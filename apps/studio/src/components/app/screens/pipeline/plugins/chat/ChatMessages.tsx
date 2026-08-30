import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Sparkles } from "lucide-react"
import type { UIMessage } from "ai"
import type { ToolApprovalStatus } from "@/components/agents/tool-approval"
import {
  Message,
  MessageAvatar,
  MessageBubble,
  MessageBubbleContent,
  MessageContent,
} from "@/components/agents/message"
import { ThinkingShimmer } from "@/components/agents/loading-states/thinking-shimmer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChatApprovalCard } from "./ChatApprovalCard"
import { useStickToBottom } from "./useStickToBottom"
import { ChatMarkdown } from "./ChatMarkdown"
import { ChatToolTrace } from "./ChatToolTrace"
import {
  MUTATING_TOOLS,
  messageText,
  readApprovalMarker,
  renderableParts,
  type RenderablePart,
  type ToolPart,
} from "./message-parts"

export interface ChatMessagesProps {
  label: string
  messages: UIMessage[]
  isBusy: boolean
  isStreaming: boolean
  error?: Error
  emptyState: React.ReactNode
  awaitingRunCallIds: ReadonlySet<string>
  onDecide: (part: ToolPart, decision: "approved" | "denied") => void
}

function approvalStatus(
  part: ToolPart,
  awaitingRun: boolean,
  isBusy: boolean,
): ToolApprovalStatus {
  if (part.state === "output-error") return "error"
  const decision = readApprovalMarker(part.output)
  if (decision === "denied") return "denied"
  if (decision === "approved") {
    if (!awaitingRun) return "complete"
    return isBusy ? "running" : "approving"
  }
  if (part.state === "output-available") return "complete"
  return "pending"
}

/** Group consecutive read-tool calls so one trace covers a burst of lookups. */
function groupParts(parts: RenderablePart[]): Array<RenderablePart | { kind: "trace"; key: string; parts: ToolPart[] }> {
  const grouped: Array<RenderablePart | { kind: "trace"; key: string; parts: ToolPart[] }> = []

  for (const part of parts) {
    if (part.kind === "tool" && !MUTATING_TOOLS.has(part.toolName)) {
      const last = grouped.at(-1)
      if (last && "kind" in last && last.kind === "trace") {
        last.parts.push(part)
        continue
      }
      grouped.push({ kind: "trace", key: `trace-${part.toolCallId}`, parts: [part] })
      continue
    }
    grouped.push(part)
  }

  return grouped
}

export function ChatMessages({
  label,
  messages,
  isBusy,
  isStreaming,
  error,
  emptyState,
  awaitingRunCallIds,
  onDecide,
}: ChatMessagesProps) {
  const { t } = useLingui()
  const viewportRef = useStickToBottom()
  const visible = messages.filter((message) => message.role !== "system")
  const lastMessage = visible.at(-1)
  const awaitingFirstToken =
    isBusy &&
    (!lastMessage ||
      lastMessage.role === "user" ||
      (!messageText(lastMessage) && renderableParts(lastMessage).length === 0))

  if (visible.length === 0 && !isBusy) {
    return <ScrollArea className="min-h-0 flex-1">{emptyState}</ScrollArea>
  }

  return (
    <ScrollArea
      className="min-h-0 flex-1"
      viewportRef={viewportRef}
      viewportClassName="[overflow-anchor:none]"
    >
      <div
        role="log"
        aria-live="polite"
        aria-busy={isStreaming}
        aria-label={t`Chat with the assistant`}
        className="flex flex-col gap-3 px-3.5 py-4"
      >
        {visible.map((message, messageIndex) => {
          const isUser = message.role === "user"
          const parts = groupParts(renderableParts(message))
          if (parts.length === 0) return null

          return (
            <Message
              key={message.id}
              from={isUser ? "user" : "assistant"}
              animateIn={messageIndex === visible.length - 1}
              className="gap-2"
            >
              {isUser ? null : (
                <MessageAvatar className="bg-brand-50 text-brand-600">
                  <Sparkles aria-hidden="true" />
                </MessageAvatar>
              )}
              <MessageContent>
                {parts.map((part) => {
                  if (part.kind === "trace") {
                    return <ChatToolTrace key={part.key} parts={part.parts} />
                  }

                  if (part.kind === "tool") {
                    return (
                      <ChatApprovalCard
                        key={part.key}
                        label={label}
                        toolName={part.toolName}
                        toolCallId={part.toolCallId}
                        input={part.input}
                        inputReady={part.state !== "input-streaming"}
                        status={approvalStatus(
                          part,
                          awaitingRunCallIds.has(part.toolCallId),
                          isBusy,
                        )}
                        onApprove={() => onDecide(part, "approved")}
                        onDeny={() => onDecide(part, "denied")}
                      />
                    )
                  }

                  return (
                    <MessageBubble
                      key={part.key}
                      variant={isUser ? "tint" : "soft"}
                      className="max-w-[85%]"
                    >
                      <MessageBubbleContent>
                        <ChatMarkdown>{part.text}</ChatMarkdown>
                      </MessageBubbleContent>
                    </MessageBubble>
                  )
                })}
              </MessageContent>
            </Message>
          )
        })}

        {awaitingFirstToken ? (
          <Message from="assistant" className="gap-2">
            <MessageAvatar className="bg-brand-50 text-brand-600">
              <Sparkles aria-hidden="true" />
            </MessageAvatar>
            <MessageContent>
              <ThinkingShimmer className="text-[12.5px]">
                <Trans>Thinking…</Trans>
              </ThinkingShimmer>
            </MessageContent>
          </Message>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800"
          >
            <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span className="text-pretty">
              <Trans>The assistant could not answer: {error.message}</Trans>
            </span>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  )
}
