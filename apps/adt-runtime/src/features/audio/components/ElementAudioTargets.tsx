import { useEffect } from "react"
import { useAtomValue } from "jotai"
import { elementAudioIdsAtom } from "@/features/language/state/language.atoms"
import { pageEpochAtom } from "@/features/navigation/state/nav.atoms"
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
 *   click.
 */
export function ElementAudioTargets() {
  const elementAudioIds = useAtomValue(elementAudioIdsAtom)
  const pageEpoch = useAtomValue(pageEpochAtom)
  const { playElement } = useAudioPlayerContext()

  useEffect(() => {
    const cleanups: Array<() => void> = []

    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-id]"))) {
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
      if (el.tagName === "IMG") {
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0")
      } else {
        if (!el.hasAttribute("role")) el.setAttribute("role", "button")
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0")
      }

      el.addEventListener("click", activate)
      el.addEventListener("keydown", onKeyDown)

      let badge: HTMLSpanElement | null = null
      const parent = el.parentElement
      if (parent) {
        badge = document.createElement("span")
        badge.setAttribute("aria-hidden", "true")
        badge.dataset.elementAudioBadge = "true"
        badge.textContent = "🔊"
        badge.style.cssText =
          "position:absolute;top:0;right:0;pointer-events:none;font-size:0.75rem;line-height:1;opacity:0.85"
        parent.appendChild(badge)
      }

      cleanups.push(() => {
        el.removeEventListener("click", activate)
        el.removeEventListener("keydown", onKeyDown)
        if (badge && badge.parentElement === parent) parent?.removeChild(badge)
      })
    }

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [elementAudioIds, pageEpoch, playElement])

  return null
}
