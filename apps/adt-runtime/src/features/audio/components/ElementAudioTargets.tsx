import { useEffect } from "react"
import { useAtomValue } from "jotai"
import { elementAudioIdsAtom } from "@/features/language/state/language.atoms"
import { pageEpochAtom } from "@/features/navigation/state/nav.atoms"
import { embedModeAtom } from "@/shared/state/ui.atoms"
import { useAudioPlayerContext } from "@/features/audio/hooks/AudioPlayerContext"

/**
 * Same exclusions the read-aloud sweep applies, plus the glossary term trigger
 * (clicking a term opens its popover - it must not also play).
 */
const EXCLUDED_SELECTOR =
  ".word-card, [data-activity-item], nav, .nav__list, button, input, textarea, select, option, .glossary-term, .glossary-term__trigger"

function accessibleName(el: HTMLElement): string {
  if (el.tagName === "IMG") return el.getAttribute("alt")?.trim() ?? ""
  return (
    el.getAttribute("aria-label")?.trim() ||
    (el.getAttribute("aria-labelledby") ? "labelled" : "") ||
    el.textContent?.trim() ||
    ""
  )
}

/**
 * Makes every authored element play its audio on click / Enter / Space -
 * without chaining to the rest of the section (SPEC-0014 AC-3). Renders null
 * and lives inside `AudioPlayerProvider`, so it shares the single `<audio>`
 * element and the shared volume / speed / active-media state.
 *
 * - The optional `element_audio.json` manifest is the gate: a book without it
 *   (or without authored audio) gets no triggers or badges (AC-14/AC-20).
 * - Attributes are added **in runtime**: the JSDOM axe audit runs with
 *   `runScripts: "outside-only"` and cannot see them (SPEC-0014 §5), so AC-9 is
 *   proven by a runtime test, not by the audit.
 * - Re-binds per `pageEpoch`, so a soft navigation cannot leave stale handlers
 *   (the reader swaps `<main>` in place - #821/#941).
 * - The badge is a **sibling overlay**, never a child of the `[data-id]` element
 *   (`applyTranslationsToDOM` replaces children) and it never intercepts the
 *   click. Its parent is made a containing block when needed, and the badge is
 *   positioned from the element's own box, so two authored targets that share
 *   a parent do not stack on the same corner.
 */
export function ElementAudioTargets() {
  const elementAudioIds = useAtomValue(elementAudioIdsAtom)
  const pageEpoch = useAtomValue(pageEpochAtom)
  const embed = useAtomValue(embedModeAtom)
  const { playElement } = useAudioPlayerContext()

  useEffect(() => {
    const cleanups: Array<() => void> = []

    for (const el of Array.from(document.querySelectorAll<HTMLElement>("#content [data-id]"))) {
      const id = el.getAttribute("data-id")
      if (!id || !elementAudioIds.includes(id)) continue
      // Not inside another interactive control (axe `nested-interactive`).
      if (el.closest(EXCLUDED_SELECTOR)) continue
      if (el.closest("a, button, [role='button'], [role='link']")) continue
      // A target with no accessible name is left untouched (AC-9).
      if (!accessibleName(el)) continue

      const activate = () => {
        playElement(id)
      }
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          activate()
        }
      }

      // An <img> target needs only tabindex="0" plus a meaningful alt; any other
      // element needs an interactive role and an accessible name. Never a
      // positive tabindex (axe `tabindex`, serious).
      const addedTabindex = !embed && !el.hasAttribute("tabindex")
      const addedRole = !embed && el.tagName !== "IMG" && !el.hasAttribute("role")
      if (!embed) {
        if (el.tagName === "IMG") {
          if (addedTabindex) el.setAttribute("tabindex", "0")
        } else {
          if (addedRole) el.setAttribute("role", "button")
          if (addedTabindex) el.setAttribute("tabindex", "0")
        }
        el.addEventListener("click", activate)
        el.addEventListener("keydown", onKeyDown)
      }

      let badge: HTMLSpanElement | null = null
      let badgeObserver: ResizeObserver | null = null
      let badgeResizeHandler: (() => void) | null = null
      let previousParentPosition = ""
      let parentPositionChanged = false
      const parent = el.parentElement
      if (parent) {
        // `position:absolute` below is relative to the nearest positioned
        // ancestor. Book exports usually have none, which would pin every badge
        // to the viewport (or the preview frame). Make the parent the containing
        // block, and restore its inline value when the target is released.
        const parentPosition = getComputedStyle(parent).position
        if (!parentPosition || parentPosition === "static") {
          previousParentPosition = parent.style.position
          parent.style.position = "relative"
          parentPositionChanged = true
        }
        badge = document.createElement("span")
        badge.setAttribute("aria-hidden", "true")
        badge.dataset.elementAudioBadge = "true"
        badge.dataset.elementAudioBadgeFor = id
        badge.textContent = "🔊"
        badge.style.cssText =
          "position:absolute;cursor:pointer;font-size:0.75rem;line-height:1;opacity:0.85;z-index:2"
        // The badge is the play control in the preview: it plays without
        // selecting the element (AC-10/AC-11). Keyboard users activate the
        // element itself, which already carries the keydown handler.
        const onBadgeClick = (event: MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
          playElement(id)
        }
        badge.addEventListener("click", onBadgeClick)
        parent.appendChild(badge)
        const placeBadge = () => {
          if (!badge?.isConnected) return
          const parentRect = parent.getBoundingClientRect()
          const elementRect = el.getBoundingClientRect()
          // A hidden element (activity page, collapsed section) has no box;
          // leave it at the origin until a resize observer sees it.
          if (elementRect.width === 0 && elementRect.height === 0) return
          const badgeWidth = badge.getBoundingClientRect().width || 14
          badge.style.left = `${Math.max(0, elementRect.right - parentRect.left - badgeWidth)}px`
          badge.style.top = `${Math.max(0, elementRect.top - parentRect.top)}px`
        }
        placeBadge()
        if (typeof ResizeObserver !== "undefined") {
          badgeObserver = new ResizeObserver(placeBadge)
          badgeObserver.observe(el)
          badgeObserver.observe(parent)
        }
        badgeResizeHandler = placeBadge
        window.addEventListener("resize", placeBadge)
        cleanups.push(() => {
          badge?.removeEventListener("click", onBadgeClick)
          badgeObserver?.disconnect()
          if (badgeResizeHandler) window.removeEventListener("resize", badgeResizeHandler)
          if (parentPositionChanged) parent.style.position = previousParentPosition
        })
      }

      cleanups.push(() => {
        el.removeEventListener("click", activate)
        el.removeEventListener("keydown", onKeyDown)
        if (addedTabindex) el.removeAttribute("tabindex")
        if (addedRole) el.removeAttribute("role")
        if (badge && badge.parentElement === parent) parent?.removeChild(badge)
      })
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [elementAudioIds, pageEpoch, embed, playElement])

  return null
}
