import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import {
  approvalMarker,
  hasPendingApproval,
  preprocessApprovals,
  readApprovalMarker,
} from "../approvals.js"
import { createChatToolRegistry, defineChatTool } from "../registry.js"
import type { ChatUiMessage } from "../types.js"

interface Ctx {
  runs: string[]
}

function registryWith(execute: (ctx: Ctx, input: { value: string }) => unknown) {
  return createChatToolRegistry<Ctx>([
    defineChatTool<Ctx, { value: string }>({
      name: "edit_thing",
      description: "Edit a thing",
      inputSchema: z.object({ value: z.string() }),
      mutating: true,
      execute,
    }),
  ])
}

function assistantWith(output: unknown, toolCallId = "call-1"): ChatUiMessage[] {
  return [
    { id: "u1", role: "user", parts: [{ type: "text", text: "do it" }] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-edit_thing",
          toolCallId,
          state: "output-available",
          input: { value: "x" },
          output,
        },
      ],
    },
  ]
}

describe("approval markers", () => {
  it("reads only well-formed markers", () => {
    expect(readApprovalMarker(approvalMarker("approved"))).toBe("approved")
    expect(readApprovalMarker(approvalMarker("denied"))).toBe("denied")
    expect(readApprovalMarker({ ok: true })).toBeUndefined()
    expect(readApprovalMarker(null)).toBeUndefined()
  })
})

describe("preprocessApprovals", () => {
  it("executes an approved call and replaces the marker with the real result", async () => {
    const ctx: Ctx = { runs: [] }
    const registry = registryWith((c, input) => {
      c.runs.push(input.value)
      return { status: "ok", version: 3 }
    })

    const result = await preprocessApprovals({
      messages: assistantWith(approvalMarker("approved")),
      registry,
      context: ctx,
      executedToolCallIds: [],
    })

    expect(ctx.runs).toEqual(["x"])
    expect(result.messages[1].parts[0].output).toEqual({ status: "ok", version: 3 })
    expect(result.executedToolCallIds).toEqual(["call-1"])
  })

  it("never runs the handler for a denied call", async () => {
    const ctx: Ctx = { runs: [] }
    const execute = vi.fn()
    const result = await preprocessApprovals({
      messages: assistantWith(approvalMarker("denied")),
      registry: registryWith(execute),
      context: ctx,
      executedToolCallIds: [],
    })

    expect(execute).not.toHaveBeenCalled()
    expect(result.messages[1].parts[0].output).toMatchObject({ status: "denied" })
    expect(result.executedToolCallIds).toEqual([])
  })

  it("is idempotent when an approval is replayed", async () => {
    const ctx: Ctx = { runs: [] }
    const registry = registryWith((c, input) => {
      c.runs.push(input.value)
      return { status: "ok" }
    })
    const persisted = (
      await preprocessApprovals({
        messages: assistantWith(approvalMarker("approved")),
        registry,
        context: ctx,
        executedToolCallIds: [],
      })
    )

    const replay = await preprocessApprovals({
      messages: assistantWith(approvalMarker("approved")),
      registry,
      context: ctx,
      executedToolCallIds: persisted.executedToolCallIds,
      persistedMessages: persisted.messages,
    })

    expect(ctx.runs).toEqual(["x"])
    expect(replay.messages[1].parts[0].output).toEqual({ status: "ok" })
  })

  it("turns a handler failure into a tool error result rather than throwing", async () => {
    const registry = registryWith(() => {
      throw new Error("pipeline is running")
    })

    const result = await preprocessApprovals({
      messages: assistantWith(approvalMarker("approved")),
      registry,
      context: { runs: [] },
      executedToolCallIds: [],
    })

    expect(result.messages[1].parts[0].output).toEqual({
      status: "error",
      message: "pipeline is running",
    })
    expect(result.executedToolCallIds).toEqual(["call-1"])
  })

  it("rejects input that does not match the tool schema", async () => {
    const execute = vi.fn()
    const messages = assistantWith(approvalMarker("approved"))
    messages[1].parts[0].input = { value: 42 }

    const result = await preprocessApprovals({
      messages,
      registry: registryWith(execute),
      context: { runs: [] },
      executedToolCallIds: [],
    })

    expect(execute).not.toHaveBeenCalled()
    expect(result.messages[1].parts[0].output).toMatchObject({ status: "error" })
  })

  it("leaves untouched every part that carries no approval marker", async () => {
    const registry = registryWith(() => ({ status: "ok" }))
    const messages = assistantWith({ status: "already-done" })

    const result = await preprocessApprovals({
      messages,
      registry,
      context: { runs: [] },
      executedToolCallIds: [],
    })

    expect(result.messages[1].parts[0].output).toEqual({ status: "already-done" })
  })
})

describe("hasPendingApproval", () => {
  it("detects a trailing tool call awaiting a decision", () => {
    expect(
      hasPendingApproval([
        {
          id: "a1",
          role: "assistant",
          parts: [
            { type: "tool-edit_thing", toolCallId: "c1", state: "input-available", input: {} },
          ],
        },
      ]),
    ).toBe(true)
  })

  it("is false once the call has an output", () => {
    expect(hasPendingApproval(assistantWith({ status: "ok" }))).toBe(false)
  })
})
