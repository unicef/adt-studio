import { describe, expect, it, vi } from "vitest"
import { createBookEventBus } from "./book-event-bus.js"

describe("createBookEventBus", () => {
  it("delivers events to per-label and global listeners", () => {
    const bus = createBookEventBus()
    const labelListener = vi.fn()
    const otherLabelListener = vi.fn()
    const globalListener = vi.fn()

    bus.addListener("a", labelListener)
    bus.addListener("b", otherLabelListener)
    bus.addGlobalListener(globalListener)

    const event = { type: "stage-run-complete", label: "a" } as const
    bus.emit("a", event)

    expect(labelListener).toHaveBeenCalledWith(event)
    expect(globalListener).toHaveBeenCalledWith("a", event)
    expect(otherLabelListener).not.toHaveBeenCalled()
  })

  it("stops delivering to a global listener after unsubscribe", () => {
    const bus = createBookEventBus()
    const globalListener = vi.fn()

    const unsubscribe = bus.addGlobalListener(globalListener)
    unsubscribe()

    bus.emit("a", { type: "stage-run-complete", label: "a" })
    expect(globalListener).not.toHaveBeenCalled()
  })
})
