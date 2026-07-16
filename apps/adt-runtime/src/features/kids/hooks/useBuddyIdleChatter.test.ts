// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { BuddyLine } from "@/features/kids/lib/buddy-lines"
import { useBuddyIdleChatter } from "./useBuddyIdleChatter"

beforeEach(() => {
  vi.useFakeTimers()
  // Deterministic gap = MIN_GAP_MS (45s) so timer boundaries are exact.
  vi.spyOn(Math, "random").mockReturnValue(0)
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("useBuddyIdleChatter", () => {
  it("says an idle line once a gap elapses when enabled", () => {
    const say = vi.fn<(line: BuddyLine) => void>()
    renderHook(() =>
      useBuddyIdleChatter({ say, character: "dino", enabled: true }),
    )

    expect(say).not.toHaveBeenCalled()
    vi.advanceTimersByTime(45_000)
    expect(say).toHaveBeenCalledTimes(1)
    expect(say.mock.calls[0][0].key).toMatch(/^kids-idle-/)
  })

  it("stays silent while disabled", () => {
    const say = vi.fn<(line: BuddyLine) => void>()
    renderHook(() =>
      useBuddyIdleChatter({ say, character: "dino", enabled: false }),
    )

    vi.advanceTimersByTime(300_000)
    expect(say).not.toHaveBeenCalled()
  })

  it("does not repeat the previous line on consecutive fires", () => {
    const say = vi.fn<(line: BuddyLine) => void>()
    renderHook(() =>
      useBuddyIdleChatter({ say, character: "dino", enabled: true }),
    )

    vi.advanceTimersByTime(90_000) // two 45s gaps
    expect(say).toHaveBeenCalledTimes(2)
    expect(say.mock.calls[0][0].key).not.toBe(say.mock.calls[1][0].key)
  })

  it("does not speak while the tab is hidden but keeps scheduling", () => {
    const say = vi.fn<(line: BuddyLine) => void>()
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    })
    renderHook(() =>
      useBuddyIdleChatter({ say, character: "dino", enabled: true }),
    )

    vi.advanceTimersByTime(45_000)
    expect(say).not.toHaveBeenCalled()
  })
})
