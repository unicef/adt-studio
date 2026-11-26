import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { ChatMessage, ChatToolResult } from "@adt/types"

export type ToolStatus = "running" | "awaiting" | "done" | "error"

const TOOL_LABELS: Record<string, MessageDescriptor> = {
  listPages: msg`Listed the pages`,
  getPage: msg`Read a page`,
  getSection: msg`Read a section`,
  listPageImages: msg`Listed page images`,
  updateSection: msg`Update a section`,
  createTemplatedActivity: msg`Create an activity`,
  createCustomSection: msg`Create a custom section`,
}

export function toolLabel(toolName: string): MessageDescriptor | null {
  return TOOL_LABELS[toolName] ?? null
}

export function toolResultsById(messages: ChatMessage[]): Map<string, ChatToolResult> {
  const results = new Map<string, ChatToolResult>()
  for (const message of messages) {
    if (message.role === "tool") for (const result of message.results) results.set(result.id, result)
  }
  return results
}

export function toolStatus(result: ChatToolResult | undefined, awaiting: boolean, busy: boolean): ToolStatus {
  if (result) return result.isError ? "error" : "done"
  if (awaiting) return "awaiting"
  return busy ? "running" : "error"
}

export function formatToolPayload(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}
