import { TriangleAlert, X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { AiEditOutcomeNotice } from "../lib/ai-edit-outcome"

interface AiEditNoticeProps {
  notice: AiEditOutcomeNotice
  onDismiss: () => void
}

export function AiEditNotice({ notice, onDismiss }: AiEditNoticeProps) {
  const { t } = useLingui()
  const title =
    notice.kind === "unsupported"
      ? t`AI editing can't do this`
      : t`This AI edit may not have been fully applied`

  return (
    <div
      role="status"
      className="px-4 py-2 border-b shrink-0 bg-amber-50 dark:bg-amber-950/40 animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 text-amber-900 dark:text-amber-100">
          <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium">{title}</p>
            {notice.reason && <p className="mt-0.5">{notice.reason}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-colors cursor-pointer"
          aria-label={t`Dismiss`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
