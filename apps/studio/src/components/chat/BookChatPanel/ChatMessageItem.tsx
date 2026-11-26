import { Trans, useLingui } from "@lingui/react/macro"
import { CircleAlert, CircleCheck, Hourglass, Wrench } from "lucide-react"
import type { ChatMessage, ChatToolCall, ChatToolResult } from "@adt/types"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent } from "@/components/ui/message"
import { Spinner } from "@/components/ui/spinner"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import { formatToolPayload, toolLabel, toolStatus, type ToolStatus } from "./tool-calls"

const STATUS_ICON: Record<ToolStatus, typeof Wrench> = {
  running: Wrench,
  awaiting: Hourglass,
  done: CircleCheck,
  error: CircleAlert,
}

function Payload({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[11px] leading-snug whitespace-pre-wrap break-all text-foreground">
      {formatToolPayload(value)}
    </pre>
  )
}

function ToolCallTrace({ call, result, status }: { call: ChatToolCall; result?: ChatToolResult; status: ToolStatus }) {
  const { i18n } = useLingui()
  const label = toolLabel(call.toolName)
  const Icon = STATUS_ICON[status]
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine status={status === "error" ? "error" : status === "running" ? "running" : status === "awaiting" ? "pending" : undefined}>
          <TraceIcon>{status === "running" ? <Spinner className="size-3.5" /> : <Icon className="size-3.5" />}</TraceIcon>
          <TraceTitle>{label ? i18n._(label) : <span className="font-mono">{call.toolName}</span>}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="flex flex-col gap-2 text-xs">
        <div className="flex flex-col gap-1">
          <span className="font-medium"><Trans>Input</Trans></span>
          <Payload value={call.args} />
        </div>
        {result && (
          <div className="flex flex-col gap-1">
            <span className="font-medium"><Trans>Result</Trans></span>
            <Payload value={result.result} />
          </div>
        )}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

interface ChatMessageItemProps {
  message: ChatMessage
  results: Map<string, ChatToolResult>
  awaitingIds: ReadonlySet<string>
  busy: boolean
}

export function ChatMessageItem({ message, results, awaitingIds, busy }: ChatMessageItemProps) {
  if (message.role === "tool") return null
  if (message.role === "user") {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end">
            <BubbleContent className="whitespace-pre-wrap">{message.content}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }
  return (
    <Message>
      <MessageContent>
        {message.text.trim() && (
          <Bubble variant="ghost">
            <BubbleContent className="whitespace-pre-wrap text-foreground">{message.text}</BubbleContent>
          </Bubble>
        )}
        {message.toolCalls.length > 0 && (
          <Trace>
            {message.toolCalls.map((call) => (
              <ToolCallTrace key={call.id} call={call} result={results.get(call.id)} status={toolStatus(results.get(call.id), awaitingIds.has(call.id), busy)} />
            ))}
          </Trace>
        )}
      </MessageContent>
    </Message>
  )
}

export function ChatThinking() {
  return (
    <Message>
      <MessageContent>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          <Trans>Thinking…</Trans>
        </span>
      </MessageContent>
    </Message>
  )
}
