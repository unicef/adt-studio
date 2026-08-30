import type { UIMessage } from "ai"

export const APPROVAL_MARKER_KEY = "__adtApproval"

export type ApprovalDecision = "approved" | "denied"

export const MUTATING_TOOLS = new Set([
  "run_stages",
  "update_stage_config",
  "edit_storyboard_section",
  "edit_translation",
  "rerun_with_instructions",
])

export interface ToolPart {
  kind: "tool"
  key: string
  toolName: string
  toolCallId: string
  state: string
  input: unknown
  output: unknown
  errorText?: string
}

export interface TextPart {
  kind: "text"
  key: string
  text: string
}

export type RenderablePart = TextPart | ToolPart

export function approvalMarker(decision: ApprovalDecision) {
  return { [APPROVAL_MARKER_KEY]: decision }
}

export function readApprovalMarker(output: unknown): ApprovalDecision | undefined {
  if (!output || typeof output !== "object") return undefined
  const decision = (output as Record<string, unknown>)[APPROVAL_MARKER_KEY]
  return decision === "approved" || decision === "denied" ? decision : undefined
}

function toolNameOf(part: { type: string; toolName?: unknown }): string | undefined {
  if (part.type === "dynamic-tool") {
    return typeof part.toolName === "string" ? part.toolName : undefined
  }
  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : undefined
}

/**
 * Flatten a message's parts into what the transcript renders: contiguous text
 * merged into one bubble, tool calls kept in place so approval cards appear
 * exactly where the assistant asked for them.
 */
export function renderableParts(message: UIMessage): RenderablePart[] {
  const out: RenderablePart[] = []

  for (const raw of message.parts) {
    const part = raw as { type: string; [key: string]: unknown }

    if (part.type === "text" && typeof part.text === "string") {
      const last = out.at(-1)
      if (last?.kind === "text") last.text = `${last.text}\n${part.text}`
      else out.push({ kind: "text", key: `t${out.length}`, text: part.text })
      continue
    }

    const toolName = toolNameOf(part)
    if (!toolName || typeof part.toolCallId !== "string") continue

    out.push({
      kind: "tool",
      key: part.toolCallId,
      toolName,
      toolCallId: part.toolCallId,
      state: typeof part.state === "string" ? part.state : "",
      input: part.input,
      output: part.output,
      errorText: typeof part.errorText === "string" ? part.errorText : undefined,
    })
  }

  return out.filter((part) => part.kind !== "text" || part.text.trim().length > 0)
}

export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("\n")
    .trim()
}
