// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { TaskInfoResponse } from "@/api/client"
import { useAwaitingRerender } from "./use-awaiting-rerender"

const task = (
  taskId: string,
  status: TaskInfoResponse["status"],
  result?: unknown
): TaskInfoResponse => ({ taskId, kind: "re-render", status, description: "", pageId: "p1", result })

function setup(initial: { tasks: TaskInfoResponse[]; version: number | null }) {
  return renderHook(({ tasks, version }) => useAwaitingRerender(tasks, version), {
    initialProps: initial,
  })
}

describe("useAwaitingRerender", () => {
  it("is not awaiting until a re-render is submitted", () => {
    const { result } = setup({ tasks: [], version: 1 })
    expect(result.current.awaiting).toBe(false)
  })

  it("awaits from submission, through the request, while the task is queued or running", () => {
    const { result, rerender } = setup({ tasks: [], version: 1 })
    act(() => result.current.markSubmitted())
    expect(result.current.awaiting).toBe(true)
    // The save itself writes a rendering version: that must not clear it.
    rerender({ tasks: [], version: 2 })
    expect(result.current.awaiting).toBe(true)
    act(() => result.current.trackTask("t1"))
    rerender({ tasks: [task("t1", "queued")], version: 2 })
    expect(result.current.awaiting).toBe(true)
    rerender({ tasks: [task("t1", "running")], version: 2 })
    expect(result.current.awaiting).toBe(true)
  })

  it("after completion, awaits until the page shows the task's rendering version", () => {
    const { result, rerender } = setup({ tasks: [], version: 2 })
    act(() => result.current.markSubmitted())
    act(() => result.current.trackTask("t1"))
    rerender({ tasks: [task("t1", "completed", { version: 3 })], version: 2 })
    expect(result.current.awaiting).toBe(true)
    rerender({ tasks: [task("t1", "completed", { version: 3 })], version: 3 })
    expect(result.current.awaiting).toBe(false)
  })

  it("clears on completion when the result carries no version", () => {
    const { result, rerender } = setup({ tasks: [], version: 2 })
    act(() => result.current.markSubmitted())
    act(() => result.current.trackTask("t1"))
    rerender({ tasks: [task("t1", "completed")], version: 2 })
    expect(result.current.awaiting).toBe(false)
  })

  it("clears when the tracked task fails, ignoring other tasks", () => {
    const { result, rerender } = setup({ tasks: [task("old", "failed")], version: 1 })
    act(() => result.current.markSubmitted())
    act(() => result.current.trackTask("t1"))
    expect(result.current.awaiting).toBe(true)
    rerender({ tasks: [task("old", "failed"), task("t1", "failed")], version: 1 })
    expect(result.current.awaiting).toBe(false)
  })

  it("clears when the request is rejected or returns no task", () => {
    const { result } = setup({ tasks: [], version: 1 })
    act(() => result.current.markSubmitted())
    act(() => result.current.clear())
    expect(result.current.awaiting).toBe(false)

    act(() => result.current.markSubmitted())
    act(() => result.current.trackTask(undefined))
    expect(result.current.awaiting).toBe(false)
  })
})
