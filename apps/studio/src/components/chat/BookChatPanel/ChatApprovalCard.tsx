import { Trans, useLingui } from "@lingui/react/macro"
import { ShieldQuestion } from "lucide-react"
import type { ChatToolCall } from "@adt/types"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { ReaderFileDiff } from "./ReaderFileDiff"
import { formatToolPayload, toolLabel } from "./tool-calls"

interface ChatApprovalCardProps {
  label: string
  calls: ChatToolCall[]
  onDecide: (decisions: Record<string, boolean>) => void
}

function isFileWrite(args: unknown): args is { path: string; content: string } {
  const value = args as { path?: unknown; content?: unknown } | null
  return typeof value?.path === "string" && typeof value.content === "string"
}

export function ChatApprovalCard({ label, calls, onDecide }: ChatApprovalCardProps) {
  const { i18n } = useLingui()
  const decideAll = (approved: boolean) =>
    onDecide(Object.fromEntries(calls.map((call) => [call.id, approved])))

  return (
    <Item variant="outline" size="sm" role="group" className="flex-col items-stretch gap-3 border-amber-300 bg-amber-50/70">
      <div className="flex items-start gap-3">
        <ItemMedia variant="icon" className="text-amber-700">
          <ShieldQuestion />
        </ItemMedia>
        <ItemContent>
          <ItemTitle><Trans>Approve this change?</Trans></ItemTitle>
          <ItemDescription><Trans>The assistant wants to change the book. Nothing is saved until you approve.</Trans></ItemDescription>
        </ItemContent>
      </div>
      {calls.map((call) => {
        const toolName = toolLabel(call.toolName)
        return (
          <div key={call.id} className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium">{toolName ? i18n._(toolName) : <span className="font-mono">{call.toolName}</span>}</span>
            {call.toolName === "writeReaderFile" && isFileWrite(call.args) ? (
              <ReaderFileDiff label={label} path={call.args.path} next={call.args.content} />
            ) : (
              <pre className="max-h-56 overflow-auto rounded-md border bg-background px-2 py-1.5 font-mono text-[11px] whitespace-pre-wrap break-all">
                {formatToolPayload(call.args)}
              </pre>
            )}
          </div>
        )
      })}
      <ItemActions className="justify-end">
        <Button size="sm" variant="outline" onClick={() => decideAll(false)}>
          <Trans>Decline</Trans>
        </Button>
        <Button size="sm" onClick={() => decideAll(true)}>
          <Trans>Approve</Trans>
        </Button>
      </ItemActions>
    </Item>
  )
}
