import { Trans } from "@lingui/react/macro"
import { CircleAlert, CircleCheck, Wrench } from "lucide-react"
import type { ChatMessage, ChatToolCall, ChatToolResult } from "@adt/types"
import { cn } from "@/lib/utils"

export function formatToolPayload(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2)
}

function ToolDetails({ name, payload, failed }: { name: string; payload: unknown; failed?: boolean }) {
  return (
    <details className="group rounded-md border border-border bg-muted/40 text-xs">
      <summary className={cn("flex cursor-pointer items-center gap-1.5 px-2 py-1 font-mono", failed && "text-red-700")}>
        {failed === undefined ? (
          <Wrench className="h-3 w-3 shrink-0" />
        ) : failed ? (
          <CircleAlert className="h-3 w-3 shrink-0" />
        ) : (
          <CircleCheck className="h-3 w-3 shrink-0 text-green-700" />
        )}
        <span className="truncate">{name}</span>
      </summary>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all border-t border-border px-2 py-1.5">
        {formatToolPayload(payload)}
      </pre>
    </details>
  )
}

function ToolCalls({ calls }: { calls: ChatToolCall[] }) {
  return calls.map((call) => <ToolDetails key={call.id} name={call.toolName} payload={call.args} />)
}

function ToolResults({ results }: { results: ChatToolResult[] }) {
  return results.map((result) => (
    <ToolDetails key={result.id} name={result.toolName} payload={result.result} failed={Boolean(result.isError)} />
  ))
}

export function ChatMessageItem({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="ml-8 self-end whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        {message.content}
      </div>
    )
  }
  if (message.role === "tool") {
    return (
      <div className="flex flex-col gap-1">
        <ToolResults results={message.results} />
      </div>
    )
  }
  return (
    <div className="mr-8 flex flex-col gap-1.5">
      {message.text.trim() && <div className="whitespace-pre-wrap text-sm text-foreground">{message.text}</div>}
      <ToolCalls calls={message.toolCalls} />
    </div>
  )
}

export function ChatThinking() {
  return (
    <div className="animate-pulse text-xs text-muted-foreground">
      <Trans>Thinking…</Trans>
    </div>
  )
}
