import type { ChatToolRegistry } from "./registry.js"
import type { ChatUiMessage, ChatUiPart } from "./types.js"

export const APPROVAL_MARKER_KEY = "__adtApproval"

export type ApprovalDecision = "approved" | "denied"

export interface ApprovalMarker {
  [APPROVAL_MARKER_KEY]: ApprovalDecision
}

export interface DeniedToolResult {
  status: "denied"
  message: string
}

export interface FailedToolResult {
  status: "error"
  message: string
}

export function approvalMarker(decision: ApprovalDecision): ApprovalMarker {
  return { [APPROVAL_MARKER_KEY]: decision }
}

export function readApprovalMarker(output: unknown): ApprovalDecision | undefined {
  if (!output || typeof output !== "object") return undefined
  const decision = (output as Record<string, unknown>)[APPROVAL_MARKER_KEY]
  return decision === "approved" || decision === "denied" ? decision : undefined
}

export function toolNameOfPart(part: ChatUiPart): string | undefined {
  if (part.type === "dynamic-tool") {
    return typeof part.toolName === "string" ? part.toolName : undefined
  }
  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : undefined
}

function toolCallIdOfPart(part: ChatUiPart): string | undefined {
  return typeof part.toolCallId === "string" ? part.toolCallId : undefined
}

/** Outputs already persisted for a tool call, so a replayed approval reuses them. */
function indexPersistedOutputs(messages: ChatUiMessage[]): Map<string, unknown> {
  const outputs = new Map<string, unknown>()
  for (const message of messages) {
    for (const part of message.parts) {
      const toolCallId = toolCallIdOfPart(part)
      if (!toolCallId || part.state !== "output-available") continue
      if (readApprovalMarker(part.output) !== undefined) continue
      outputs.set(toolCallId, part.output)
    }
  }
  return outputs
}

export interface PreprocessApprovalsOptions<Ctx> {
  messages: ChatUiMessage[]
  registry: ChatToolRegistry<Ctx>
  context: Ctx
  /** Tool calls the server already ran; replays reuse their persisted output. */
  executedToolCallIds: Iterable<string>
  /** Previously persisted messages, used to recover a replayed call's output. */
  persistedMessages?: ChatUiMessage[]
  deniedMessage?: string
}

export interface PreprocessApprovalsResult {
  messages: ChatUiMessage[]
  executedToolCallIds: string[]
}

/**
 * Execute every approved mutating tool call recorded in the message history and
 * replace its approval marker with the real result. Runs before the model does,
 * so the loop resumes with genuine tool output instead of a placeholder.
 */
export async function preprocessApprovals<Ctx>({
  messages,
  registry,
  context,
  executedToolCallIds,
  persistedMessages = [],
  deniedMessage = "The user declined this action. Do not retry it unless they ask again.",
}: PreprocessApprovalsOptions<Ctx>): Promise<PreprocessApprovalsResult> {
  const executed = new Set(executedToolCallIds)
  const persistedOutputs = indexPersistedOutputs(persistedMessages)

  const nextMessages = await Promise.all(
    messages.map(async (message) => {
      if (message.role !== "assistant") return message

      const nextParts = await Promise.all(
        message.parts.map(async (part): Promise<ChatUiPart> => {
          const decision = part.state === "output-available"
            ? readApprovalMarker(part.output)
            : undefined
          if (!decision) return part

          const toolCallId = toolCallIdOfPart(part)
          const toolName = toolNameOfPart(part)
          if (!toolCallId || !toolName) return part

          if (decision === "denied") {
            const denied: DeniedToolResult = { status: "denied", message: deniedMessage }
            return { ...part, output: denied }
          }

          if (executed.has(toolCallId)) {
            const previous = persistedOutputs.get(toolCallId)
            return previous === undefined ? part : { ...part, output: previous }
          }

          const tool = registry.get(toolName)
          if (!tool) {
            const failed: FailedToolResult = {
              status: "error",
              message: `Unknown tool: ${toolName}`,
            }
            return { ...part, output: failed }
          }

          executed.add(toolCallId)
          try {
            const parsed = tool.inputSchema.parse(part.input)
            const output = await tool.execute(context, parsed)
            return { ...part, output }
          } catch (error) {
            const failed: FailedToolResult = {
              status: "error",
              message: error instanceof Error ? error.message : String(error),
            }
            return { ...part, output: failed }
          }
        }),
      )

      return { ...message, parts: nextParts }
    }),
  )

  return { messages: nextMessages, executedToolCallIds: [...executed] }
}

/** True when the last assistant message still holds an unanswered mutating call. */
export function hasPendingApproval(messages: ChatUiMessage[]): boolean {
  const last = messages[messages.length - 1]
  if (!last || last.role !== "assistant") return false
  return last.parts.some(
    (part) => toolNameOfPart(part) !== undefined && part.state === "input-available",
  )
}
