import { Hourglass } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { NoticeStrip } from "@/components/ui/notice-strip"
import { progressCounts } from "@/components/app/screens/pipeline/runs/LiveRunPanel"
import type { RunStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"

export function SectioningWaitStrip({ extract, hex }: { extract: RunStageActivity; hex: string }) {
  const { t } = useLingui()
  const counts = progressCounts(extract)
  return (
    <NoticeStrip
      tone="attention"
      hex={hex}
      icon={Hourglass}
      role="status"
      title={<Trans>Waiting for Extract</Trans>}
      body={<Trans>Sectioning starts as soon as Extract finishes. Pages show up here as they're extracted.</Trans>}
    >
      {counts && (
        <span
          aria-label={t`${counts.done} of ${counts.total} pages extracted`}
          className="shrink-0 pr-1.5 font-mono text-[12px] tabular-nums text-muted-foreground"
        >
          {counts.done} / {counts.total}
        </span>
      )}
    </NoticeStrip>
  )
}
