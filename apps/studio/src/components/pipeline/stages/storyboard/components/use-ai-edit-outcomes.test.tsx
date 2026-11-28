// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { TaskInfoResponse } from "@/api/client"
import { useAiEditOutcomes } from "./use-ai-edit-outcomes"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, i) => text + part + String(values[i] ?? ""), ""),
  }),
}))

const unsupportedResult = {
  status: "unsupported",
  reason: "Use the image tools.",
  reasoning: "The instruction asks for new images.",
  sectionIndex: 0,
}

function task(status: TaskInfoResponse["status"], extra: Partial<TaskInfoResponse> = {}): TaskInfoResponse {
  return { taskId: "task-1", kind: "ai-edit", status, description: "", pageId: "p1", ...extra }
}

function renderOutcomes(initial: { tasks: TaskInfoResponse[]; pageId?: string; sectionIndex?: number }) {
  let instruction = ""
  const setInstruction = vi.fn((next: string | ((current: string) => string)) => {
    instruction = typeof next === "function" ? next(instruction) : next
  })
  const onFailed = vi.fn()
  const hook = renderHook(
    (props: { tasks: TaskInfoResponse[]; pageId: string; sectionIndex: number }) =>
      useAiEditOutcomes({ ...props, onFailed, setInstruction }),
    { initialProps: { pageId: "p1", sectionIndex: 0, ...initial } },
  )
  return { ...hook, onFailed, instruction: () => instruction }
}

const target = { pageId: "p1", sectionIndex: 0, instruction: "Redraw the images" }

describe("useAiEditOutcomes", () => {
  afterEach(() => cleanup())

  it("reports a tracked task that completed on the current section", () => {
    const { result, rerender, instruction } = renderOutcomes({ tasks: [task("running")] })

    act(() => result.current.trackSubmission("task-1", target))
    rerender({ tasks: [task("completed", { result: unsupportedResult })], pageId: "p1", sectionIndex: 0 })

    expect(result.current.notice).toEqual({ kind: "unsupported", reason: "Use the image tools." })
    expect(instruction()).toBe("Redraw the images")
  })

  it("reports a task that completed before its submission was tracked", () => {
    const { result } = renderOutcomes({ tasks: [task("completed", { result: unsupportedResult })] })

    act(() => result.current.trackSubmission("task-1", target))

    expect(result.current.notice).toEqual({ kind: "unsupported", reason: "Use the image tools." })
  })

  it("clears the notice when the user opens another section", () => {
    const { result, rerender } = renderOutcomes({ tasks: [] })

    act(() => result.current.reportResult(unsupportedResult, target))
    expect(result.current.notice).not.toBeNull()

    rerender({ tasks: [], pageId: "p1", sectionIndex: 1 })

    expect(result.current.notice).toBeNull()
  })

  it("ignores outcomes of edits submitted from another section", () => {
    const { result, rerender, onFailed, instruction } = renderOutcomes({ tasks: [task("running")] })

    act(() => {
      result.current.trackSubmission("task-1", target)
      result.current.trackSubmission("task-2", target)
    })
    rerender({ tasks: [task("running")], pageId: "p1", sectionIndex: 1 })
    rerender({
      tasks: [
        task("completed", { result: unsupportedResult }),
        task("failed", { taskId: "task-2", error: "boom" }),
      ],
      pageId: "p1",
      sectionIndex: 1,
    })

    expect(result.current.notice).toBeNull()
    expect(instruction()).toBe("")
    expect(onFailed).not.toHaveBeenCalled()
  })

  it("reports a failed task on the current section", () => {
    const { result, rerender, onFailed } = renderOutcomes({ tasks: [task("running")] })

    act(() => result.current.trackSubmission("task-1", target))
    rerender({ tasks: [task("failed", { error: "boom" })], pageId: "p1", sectionIndex: 0 })

    expect(onFailed).toHaveBeenCalledWith("boom")
  })
})
