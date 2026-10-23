import { describe, expect, it } from "vitest"
import type { TaskInfoResponse } from "@/api/client"
import { createdSectionIndexOf, finishedTasks, isGenerating, staleTaskIds } from "./generateActivity"

function task(partial: Partial<TaskInfoResponse>): TaskInfoResponse {
  return { taskId: "t1", kind: "generate-activity", status: "running", description: "", pageId: "p1", ...partial }
}

describe("createdSectionIndexOf", () => {
  it("reads the index the last create tool call wrote", () => {
    const result = {
      toolCalls: [
        { name: "createTemplatedActivity", result: { sectionIndex: 2 } },
        { name: "readPage", result: {} },
        { name: "createCustomSection", result: { sectionIndex: 4 } },
      ],
    }
    expect(createdSectionIndexOf(result)).toBe(4)
  })

  it("returns undefined when no create call landed", () => {
    expect(createdSectionIndexOf({ toolCalls: [{ name: "readPage", result: { sectionIndex: 1 } }] })).toBeUndefined()
    expect(createdSectionIndexOf(null)).toBeUndefined()
    expect(createdSectionIndexOf({ toolCalls: [{ name: "createCustomSection", result: { sectionIndex: -1 } }] })).toBeUndefined()
  })
})

describe("generate-activity task tracking", () => {
  it("treats running and queued tasks on this page as generating", () => {
    expect(isGenerating([task({ status: "queued" })], "p1")).toBe(true)
    expect(isGenerating([task({ status: "running", pageId: "p2" })], "p1")).toBe(false)
    expect(isGenerating([task({ kind: "ai-edit" })], "p1")).toBe(false)
    expect(isGenerating([task({ status: "completed" })], "p1")).toBe(false)
  })

  it("returns each finished task once", () => {
    const tasks = [task({ taskId: "a", status: "completed" }), task({ taskId: "b", status: "completed" }), task({ taskId: "c", status: "failed" })]
    expect(finishedTasks(tasks, "p1", "completed", new Set(["a"])).map((entry) => entry.taskId)).toEqual(["b"])
    expect(finishedTasks(tasks, "p1", "failed", new Set()).map((entry) => entry.taskId)).toEqual(["c"])
  })

  it("flags tasks that finished before the canvas opened as already announced", () => {
    const now = 100_000
    const tasks = [
      task({ taskId: "old", status: "completed", completedAt: now - 60_000 }),
      task({ taskId: "fresh", status: "completed", completedAt: now - 1_000 }),
      task({ taskId: "live", status: "running" }),
    ]
    expect(staleTaskIds(tasks, now)).toEqual(["old"])
  })
})
