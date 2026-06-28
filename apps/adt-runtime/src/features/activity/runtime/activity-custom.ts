import { getDefaultStore } from "jotai"
import { pagesAtom, currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import {
  confettiTriggerAtom,
  skipEnabledAtom,
  skipHandlerAtom,
  submitEnabledAtom,
  submitLabelAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "@/features/activity/state/activity.atoms"
import { playActivitySound } from "@/features/activity/runtime/sounds"

/**
 * `activity_custom_*` — the escape hatch for fully-interactive activities that
 * don't map to a templated type (jigsaw, crossword, word-search, mini-games…).
 *
 * Unlike the templated activities, the runtime does NOT know the section's
 * internal structure. Each custom section ships its own embedded `<script>`
 * that wires up interaction and hands the runtime a grader by calling
 * `window.adtRegisterCustomActivity(section, { validate, reset })` (the contract
 * documented in `packages/agents/src/prompts/activity-generation.ts`).
 *
 * ## The timing problem this module solves
 *
 * A book page is a standalone HTML document: the section's inline `<script>`
 * runs *during parse*, BEFORE `base.bundle.*.js` (loaded at the end of <body>)
 * has had a chance to define `window.adtRegisterCustomActivity`. If the function
 * isn't defined yet the call throws and the grader is lost forever — which is
 * exactly why the Submit button used to stay disabled.
 *
 * To bridge that gap, `renderPageHtml` injects a tiny buffering stub into
 * <head> (see `package-web.ts`) that defines `window.adtRegisterCustomActivity`
 * to push `{ section, handlers }` onto `window.__adtPendingCustomActivities`.
 * This module, which boots from `base.bundle`, drains that buffer, installs the
 * "live" registrar (so any later/SPA re-execution still registers), and wires
 * the collected graders into the page's Submit chrome.
 *
 * ## Submit-enabled policy
 *
 * The runtime can't generically tell when an arbitrary custom activity is
 * "ready" (placement state lives in the activity's own DOM). So Submit is
 * enabled as soon as a custom activity registers; the activity's `validate()`
 * is responsible for the "not finished yet" feedback (the prompt requires it to
 * return false until the learner has interacted and to write an aria-live
 * status). The runtime only plays the success/error sound and, on success,
 * flips the button to "Next".
 */
const CUSTOM_SELECTOR = 'section[data-section-type^="activity_custom"]'

export interface CustomActivityHandlers {
  /** `true` when the learner's answer is correct. Owns its own visual feedback. */
  validate: () => boolean | Promise<boolean>
  /** Returns the section to its initial unanswered state. */
  reset?: () => void
}

interface PendingCustomActivity {
  section: HTMLElement
  handlers: CustomActivityHandlers
}

declare global {
  interface Window {
    /**
     * Registration hook called by each custom activity's embedded script. Set
     * to a buffering stub in <head> (parse time) and replaced with the live
     * implementation here once the runtime boots.
     */
    adtRegisterCustomActivity?: (
      section: HTMLElement,
      handlers: CustomActivityHandlers,
    ) => void
    /** Registrations buffered by the <head> stub before the runtime booted. */
    __adtPendingCustomActivities?: PendingCustomActivity[]
  }
}

function findNextPageHref(): string | null {
  const store = getDefaultStore()
  const pages = store.get(pagesAtom)
  const currentId = store.get(currentSectionIdAtom)
  if (!currentId) return null
  const idx = pages.findIndex((p) => p.section_id === currentId)
  if (idx < 0 || idx >= pages.length - 1) return null
  return pages[idx + 1].href
}

let a11yIdCounter = 0

/**
 * Defensive accessibility floor for a custom activity. The generation prompt
 * asks for named, roled, keyboard-focusable drop zones and cards and a labelled
 * section, but it's LLM best-effort — this backfills the minimum so a
 * screen-reader / keyboard learner can always operate the activity even when a
 * generation missed something. It only ever ADDS missing attributes; it never
 * overrides what the author provided. The build-time validator
 * (validate-activity-structure.ts) is the primary guard; this is the safety net.
 */
function applyA11yBackstop(section: HTMLElement): void {
  // Section: a labelled grouping landmark.
  if (!section.hasAttribute("role")) section.setAttribute("role", "group")
  if (
    !section.getAttribute("aria-label")?.trim() &&
    !section.getAttribute("aria-labelledby")?.trim()
  ) {
    const heading = section.querySelector<HTMLElement>(
      "h1, h2, h3, h4, h5, h6, [role='heading']",
    )
    if (heading?.textContent?.trim()) {
      if (!heading.id) heading.id = `adt-custom-heading-${++a11yIdCounter}`
      section.setAttribute("aria-labelledby", heading.id)
    }
  }

  // Drop zones: roled + keyboard-focusable.
  section
    .querySelectorAll<HTMLElement>("[data-activity-target]")
    .forEach((zone) => {
      if (!zone.hasAttribute("role")) zone.setAttribute("role", "group")
      if (!zone.hasAttribute("tabindex")) zone.setAttribute("tabindex", "0")
    })

  // Cards: non-native controls need a role + focusability to be operable.
  // Native controls (<button>, <a>, <input>…) already have both.
  const NATIVE = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"])
  section
    .querySelectorAll<HTMLElement>("[data-activity-item]")
    .forEach((card) => {
      if (NATIVE.has(card.tagName)) return
      if (!card.hasAttribute("role")) card.setAttribute("role", "button")
      if (!card.hasAttribute("tabindex")) card.setAttribute("tabindex", "0")
    })
}

export function initializeCustomActivity(): (() => void) | null {
  if (typeof document === "undefined") return null

  const pending = window.__adtPendingCustomActivities
  const hasPending = Array.isArray(pending) && pending.length > 0
  const hasCustomSection = !!document.querySelector(CUSTOM_SELECTOR)
  if (!hasPending && !hasCustomSection) return null

  // Guarantee a baseline a11y floor on every custom section, independent of
  // whether its grader registered successfully.
  document
    .querySelectorAll<HTMLElement>(CUSTOM_SELECTOR)
    .forEach(applyA11yBackstop)

  const store = getDefaultStore()
  const hasNextPage = findNextPageHref() !== null
  const registered: PendingCustomActivity[] = []

  const runValidation = async () => {
    // No grader registered (e.g. the <head> stub is missing because the book
    // was packaged before this fix). Nothing to grade — leave it to the user to
    // re-package; bail rather than falsely report success.
    if (registered.length === 0) return

    let allPass = true
    for (const { handlers } of registered) {
      try {
        if (!(await handlers.validate())) allPass = false
      } catch (err) {
        console.error("Custom activity validate() threw:", err)
        allPass = false
      }
    }

    playActivitySound(allPass ? "success" : "error")

    if (allPass) {
      store.set(confettiTriggerAtom, store.get(confettiTriggerAtom) + 1)
      store.set(submitStateAtom, "next")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, hasNextPage)
    }
    // On failure stay in "submit" state and keep the button enabled so the
    // learner can adjust and retry; validate() already surfaced what's wrong.
  }

  const handleValidate = () => {
    // Post-success: the button is now "Next" — advance to the next page.
    if (store.get(submitStateAtom) === "next") {
      const href = findNextPageHref()
      if (href) window.location.href = href
      return
    }
    void runValidation()
  }

  const handleSkip = () => {
    const href = findNextPageHref()
    if (href) window.location.href = href
  }

  const wire = () => {
    if (registered.length === 0) return
    store.set(validateHandlerAtom, () => handleValidate)
    store.set(skipHandlerAtom, () => handleSkip)
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(submitEnabledAtom, true)
    store.set(skipEnabledAtom, hasNextPage)
  }

  const register = (entry: PendingCustomActivity | null | undefined) => {
    if (
      !entry ||
      !(entry.section instanceof HTMLElement) ||
      !entry.handlers ||
      typeof entry.handlers.validate !== "function"
    ) {
      return
    }
    registered.push(entry)
    wire()
  }

  // Drain whatever the parse-time stub buffered, then take over so any late
  // registration (SPA re-execution path) still wires up.
  if (Array.isArray(pending)) {
    for (const entry of pending.splice(0)) register(entry)
  }
  window.adtRegisterCustomActivity = (section, handlers) =>
    register({ section, handlers })

  return () => {
    store.set(validateHandlerAtom, () => null)
    store.set(skipHandlerAtom, () => null)
    store.set(submitEnabledAtom, false)
    store.set(skipEnabledAtom, false)
  }
}
