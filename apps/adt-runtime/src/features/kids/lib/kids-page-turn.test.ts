// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { isPlayingAtom } from "@/features/audio/state/audio.atoms"
import { soundEffectsAtom } from "@/shared/state/ui.atoms"
import { navigateWithPageTurn } from "./kids-page-turn"

const navMock = vi.hoisted(() => ({ navigateToHref: vi.fn() }))
const soundMock = vi.hoisted(() => ({ playActivitySound: vi.fn() }))

vi.mock("@/features/navigation/lib/page-navigation", () => ({
  navigateToHref: navMock.navigateToHref,
}))

vi.mock("@/features/activity/runtime/sounds", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/activity/runtime/sounds")>()
  return { ...actual, playActivitySound: soundMock.playActivitySound }
})

const store = getDefaultStore()

beforeEach(() => {
  vi.useFakeTimers()
  store.set(soundEffectsAtom, true)
  store.set(isPlayingAtom, false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("navigateWithPageTurn", () => {
  // A page turn is a full document load, so the cue has to be played on the
  // gesture and the navigation deferred — otherwise the clip is cut off by the
  // unload, and playing it on arrival is blocked by the autoplay policy.
  it("plays the cue first, then navigates", () => {
    navigateWithPageTurn("two.html")

    expect(soundMock.playActivitySound).toHaveBeenCalledWith("page_turn")
    expect(navMock.navigateToHref).not.toHaveBeenCalled()

    vi.advanceTimersByTime(120)
    expect(navMock.navigateToHref).toHaveBeenCalledWith("two.html")
  })

  it("navigates immediately with no cue when sound effects are off", () => {
    store.set(soundEffectsAtom, false)

    navigateWithPageTurn("two.html")

    expect(soundMock.playActivitySound).not.toHaveBeenCalled()
    expect(navMock.navigateToHref).toHaveBeenCalledWith("two.html")
  })

  // A cue over the narrator would talk across the story.
  it("stays silent and navigates immediately while narration plays", () => {
    store.set(isPlayingAtom, true)

    navigateWithPageTurn("two.html")

    expect(soundMock.playActivitySound).not.toHaveBeenCalled()
    expect(navMock.navigateToHref).toHaveBeenCalledWith("two.html")
  })

  it("ignores a missing href", () => {
    navigateWithPageTurn(undefined)

    expect(soundMock.playActivitySound).not.toHaveBeenCalled()
    expect(navMock.navigateToHref).not.toHaveBeenCalled()
  })
})
