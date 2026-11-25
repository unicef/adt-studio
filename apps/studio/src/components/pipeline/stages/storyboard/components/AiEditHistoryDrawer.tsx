import { Check, X as XIcon, MessageSquare, TriangleAlert } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"
import { useAiEditHistory } from "@/hooks/use-pages"

interface AiEditHistoryDrawerProps {
  open: boolean
  label: string
  pageId: string
  sectionIndex: number
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function AiEditHistoryDrawer({
  open,
  label,
  pageId,
  sectionIndex,
}: AiEditHistoryDrawerProps) {
  const { t } = useLingui()
  const { data, isLoading } = useAiEditHistory(label, pageId, sectionIndex, {
    enabled: open,
  })

  if (!open) return null

  const history = data?.history ?? []

  return (
    <div className="mt-2 rounded-md border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-600">
        <MessageSquare className="h-3.5 w-3.5" />
        <Trans>AI edit history</Trans>
        {history.length > 0 && (
          <span className="text-gray-400">({history.length})</span>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto px-3 py-2">
        {isLoading && (
          <div className="py-3 text-center text-xs text-gray-400">
            <Trans>Loading…</Trans>
          </div>
        )}

        {!isLoading && history.length === 0 && (
          <div className="py-3 text-center text-xs text-gray-400">
            <Trans>No AI edits yet for this section.</Trans>
          </div>
        )}

        <ol className="space-y-3">
          {history.map((turn) => (
            <li key={turn.correlationId} className="space-y-1.5">
              <div className="flex items-start justify-end gap-2">
                <div className="max-w-[85%] rounded-lg bg-blue-50 px-2.5 py-1.5 text-[12px] text-gray-900">
                  {turn.instruction || (
                    <span className="italic text-gray-400">
                      <Trans>(no instruction text)</Trans>
                    </span>
                  )}
                </div>
                <span className="mt-1 shrink-0 text-[10px] text-gray-400">
                  {formatTime(turn.timestamp)}
                </span>
              </div>

              {turn.attempts.map((att, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2"
                >
                  <div className="max-w-[85%] rounded-lg bg-gray-100 px-2.5 py-1.5 text-[12px] text-gray-800">
                    {i > 0 && (
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-amber-700">
                        <Trans>Retry</Trans>
                      </div>
                    )}
                    {att.reasoning}
                    {att.cached && (
                      <span
                        className="ml-1 text-[10px] text-gray-400"
                        title={t`Cached response`}
                      >
                        ({t`cached`})
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {turn.unsupported && (
                <div className="flex items-start gap-1.5 pl-2 text-[11px]">
                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                  <span className="text-amber-800">
                    <span className="font-medium">
                      <Trans>Not possible with AI editing</Trans>
                    </span>
                    {turn.unsupported.reason && <>: {turn.unsupported.reason}</>}
                  </span>
                </div>
              )}

              {turn.verify && !turn.unsupported && (
                <div className="flex items-center gap-1.5 pl-2 text-[11px]">
                  {turn.verify.applied ? (
                    <>
                      <Check className="h-3 w-3 text-green-600" />
                      <span className="text-green-700">
                        <Trans>Verified applied</Trans>
                      </span>
                    </>
                  ) : (
                    <>
                      <XIcon className="h-3 w-3 text-red-600" />
                      <span className="text-red-700">{turn.verify.reason}</span>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
