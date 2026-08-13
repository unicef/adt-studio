/**
 * Page-turn cue for kids mode.
 *
 * Turning a page is a full document load, which rules out both obvious
 * approaches: a cue started here would be cut off when the document unloads,
 * and a cue played on arrival is rejected by the autoplay policy because a
 * fresh document has no user activation yet (and would fail silently, since
 * `play()` rejections are swallowed).
 *
 * So the cue belongs to the *gesture*: play it on the tap, then hand over to
 * the navigation a beat later so the clip is actually audible. The delay is
 * deliberately short — long enough to hear, short enough not to feel laggy.
 *
 * Skipped while narration or buddy speech is playing, so a cue never talks
 * over the story, and skipped entirely when sound effects are off.
 */
import { getDefaultStore } from "jotai"
import {
  PAGE_TURN_LEAD_MS,
  playActivitySound,
  soundEffectsEnabled,
} from "@/features/activity/runtime/sounds"
import { isPlayingAtom } from "@/features/audio/state/audio.atoms"
import { navigateToHref } from "@/features/navigation/lib/page-navigation"

function narrationActive(): boolean {
  try {
    return getDefaultStore().get(isPlayingAtom) === true
  } catch {
    return false
  }
}

export function navigateWithPageTurn(href: string | undefined): void {
  if (!href) return
  if (!soundEffectsEnabled() || narrationActive()) {
    navigateToHref(href)
    return
  }
  playActivitySound("page_turn")
  window.setTimeout(() => navigateToHref(href), PAGE_TURN_LEAD_MS)
}
