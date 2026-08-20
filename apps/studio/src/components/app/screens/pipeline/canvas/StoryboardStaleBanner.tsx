import { AlertTriangle } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { StageRerunButton } from "@/components/app/screens/pipeline/runs/StageRerunButton"
import type { StageRerun } from "@/components/app/screens/pipeline/runs/useStageRerun"

export interface StoryboardStaleBannerProps {
  rerun: StageRerun
  /** Pages whose render is behind its sections; 0 when only the stage was reset. */
  outdatedCount: number
}

/**
 * The renderings are still on disk and still editable, but they no longer match
 * the sections they came from. One banner for the whole book, so a restructuring
 * session in Sectioning costs one re-run rather than one per edit.
 */
export function StoryboardStaleBanner({ rerun, outdatedCount }: StoryboardStaleBannerProps) {
  const { t } = useLingui()

  return (
    <div className="flex w-full shrink-0 items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-3.5 py-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="size-3.5 shrink-0" />
      <p className="min-w-0 flex-1 text-[12px] leading-snug">
        <Trans>
          Sectioning has changed since these pages were rendered. Re-run Storyboard to regenerate
          them.
        </Trans>
      </p>
      {outdatedCount > 0 && (
        <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums dark:bg-amber-900/60">
          {t`${plural(outdatedCount, {
            one: "# page out of date",
            other: "# pages out of date",
          })}`}
        </span>
      )}
      <StageRerunButton slug="storyboard" rerun={rerun} variant="banner" />
    </div>
  )
}
