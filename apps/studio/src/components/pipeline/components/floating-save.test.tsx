// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      let text = ""
      for (let index = 0; index < strings.length; index += 1) {
        text += strings[index]
        if (index < values.length) text += String(values[index])
      }
      return text
    },
  }),
}))

// The bar itself pulls in tooltips/icons and is not what these tests exercise.
vi.mock("./FloatingSaveBar", () => ({
  FloatingSaveBar: () => null,
}))

const { FloatingSaveProvider, useFloatingSave, useFloatingSaveLeaveAction } =
  await import("./floating-save")

type Entry = Parameters<typeof useFloatingSave>[0]

/**
 * Mounts the given entries inside a provider and hands back the live
 * leave-action the unsaved-changes guard would read.
 */
function renderLeaveAction(entries: Entry[]) {
  const captured: { current: ReturnType<typeof useFloatingSaveLeaveAction> | null } = {
    current: null,
  }

  function Consumer({ entry }: { entry: Entry }) {
    useFloatingSave(entry)
    return null
  }

  function Probe() {
    captured.current = useFloatingSaveLeaveAction()
    return null
  }

  render(
    <FloatingSaveProvider>
      {entries.map((entry) => (
        <Consumer key={entry.id} entry={entry} />
      ))}
      <Probe />
    </FloatingSaveProvider>,
  )

  return captured
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("useFloatingSaveLeaveAction", () => {
  it("does not promise a re-run for an entry that only saves in place", () => {
    const leave = renderLeaveAction([
      { id: "sectioning:p1", dirty: true, saving: false, onSaveStay: vi.fn() },
    ])

    // onSaveStay alone means "save without leaving" — the guard must offer
    // "Save & leave", not "Save & Re-run".
    expect(leave.current?.canSave).toBe(true)
    expect(leave.current?.willRerun).toBe(false)
  })

  it("promises a re-run only when the entry exposes a re-run handler", () => {
    const leave = renderLeaveAction([
      {
        id: "settings:extract",
        dirty: true,
        saving: false,
        onSaveStay: vi.fn(),
        onSaveAndRerun: vi.fn(),
      },
    ])

    expect(leave.current?.willRerun).toBe(true)
  })

  it("reports unique downstream resets in pipeline order", () => {
    const leave = renderLeaveAction([
      {
        id: "sectioning:p1",
        dirty: true,
        saving: false,
        onSaveStay: vi.fn(),
        resetStages: ["package", "storyboard"],
      },
      {
        id: "sectioning:p2",
        dirty: true,
        saving: false,
        onSaveStay: vi.fn(),
        resetStages: ["quizzes", "storyboard"],
      },
    ])

    expect(leave.current?.resetStages).toEqual(["storyboard", "quizzes", "package"])
  })

  it("ignores entries that are not dirty", () => {
    const leave = renderLeaveAction([
      { id: "sectioning:p1", dirty: false, saving: false, onSaveStay: vi.fn() },
    ])

    expect(leave.current?.canSave).toBe(false)
    expect(leave.current?.willRerun).toBe(false)
  })

  it("prefers onSaveStay over onSave when both are registered", async () => {
    const onSave = vi.fn()
    const onSaveStay = vi.fn()
    const leave = renderLeaveAction([
      { id: "sectioning:p1", dirty: true, saving: false, onSave, onSaveStay },
    ])

    await leave.current?.saveAndStay()

    expect(onSaveStay).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it("rejects when a save fails, so the guard can keep the user on the page", async () => {
    const failure = new Error("PUT failed")
    const leave = renderLeaveAction([
      {
        id: "sectioning:p1",
        dirty: true,
        saving: false,
        onSaveStay: vi.fn().mockRejectedValue(failure),
      },
    ])

    await expect(leave.current?.saveAndStay()).rejects.toThrow("PUT failed")
  })

  it("saves every dirty entry and rejects if any one of them fails", async () => {
    const ok = vi.fn().mockResolvedValue(undefined)
    const leave = renderLeaveAction([
      { id: "sectioning:p1", dirty: true, saving: false, onSaveStay: ok },
      {
        id: "sectioning:p2",
        dirty: true,
        saving: false,
        onSaveStay: vi.fn().mockRejectedValue(new Error("boom")),
      },
    ])

    await expect(leave.current?.saveAndStay()).rejects.toThrow("boom")
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
