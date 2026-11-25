import { Trans } from "@lingui/react/macro"
import type { ChatToolCall } from "@adt/types"
import { Button } from "@/components/ui/button"
import { formatToolPayload } from "./ChatMessageItem"

interface ChatApprovalCardProps {
  calls: ChatToolCall[]
  onDecide: (decisions: Record<string, boolean>) => void
}

export function ChatApprovalCard({ calls, onDecide }: ChatApprovalCardProps) {
  const decideAll = (approved: boolean) =>
    onDecide(Object.fromEntries(calls.map((call) => [call.id, approved])))

  return (
    <div role="group" className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <p className="font-medium text-amber-900">
        <Trans>The assistant wants to change the book:</Trans>
      </p>
      {calls.map((call) => (
        <div key={call.id} className="flex flex-col gap-1">
          <span className="font-mono text-xs text-amber-900">{call.toolName}</span>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded border border-amber-200 bg-white px-2 py-1.5 text-xs">
            {formatToolPayload(call.args)}
          </pre>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => decideAll(false)}>
          <Trans>Decline</Trans>
        </Button>
        <Button size="sm" onClick={() => decideAll(true)}>
          <Trans>Approve</Trans>
        </Button>
      </div>
    </div>
  )
}
