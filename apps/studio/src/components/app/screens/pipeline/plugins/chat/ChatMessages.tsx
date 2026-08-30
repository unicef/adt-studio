import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Sparkles } from "lucide-react"
import type { UIMessage } from "ai"
import {
  Message,
  MessageAvatar,
  MessageBubble,
  MessageBubbleContent,
  MessageContent,
  MessageScroller,
} from "@/components/agents/message"
import { ThinkingShimmer } from "@/components/agents/loading-states/thinking-shimmer"
import { ChatMarkdown } from "./ChatMarkdown"

export interface ChatMessagesProps {
  messages: UIMessage[]
  isBusy: boolean
  isStreaming: boolean
  error?: Error
  emptyState: React.ReactNode
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("\n")
    .trim()
}

export function ChatMessages({
  messages,
  isBusy,
  isStreaming,
  error,
  emptyState,
}: ChatMessagesProps) {
  const { t } = useLingui()
  const visible = messages.filter((message) => message.role !== "system")
  const lastMessage = visible.at(-1)
  const awaitingFirstToken =
    isBusy && (!lastMessage || lastMessage.role === "user" || !messageText(lastMessage))

  if (visible.length === 0 && !isBusy) {
    return <div className="min-h-0 flex-1 overflow-y-auto">{emptyState}</div>
  }

  return (
    <MessageScroller
      className="min-h-0 flex-1"
      label={t`Chat with the assistant`}
      busy={isStreaming}
      contentClassName="flex flex-col gap-3 px-3.5 py-4"
    >
      {visible.map((message, index) => {
        const text = messageText(message)
        if (!text) return null
        const isUser = message.role === "user"

        return (
          <Message
            key={message.id}
            from={isUser ? "user" : "assistant"}
            animateIn={index === visible.length - 1}
            className="gap-2"
          >
            {isUser ? null : (
              <MessageAvatar className="bg-brand-50 text-brand-600">
                <Sparkles aria-hidden="true" />
              </MessageAvatar>
            )}
            <MessageContent>
              <MessageBubble
                variant={isUser ? "tint" : "soft"}
                className="max-w-[258px]"
              >
                <MessageBubbleContent>
                  <ChatMarkdown>{text}</ChatMarkdown>
                </MessageBubbleContent>
              </MessageBubble>
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
    </MessageScroller>
  )
}
