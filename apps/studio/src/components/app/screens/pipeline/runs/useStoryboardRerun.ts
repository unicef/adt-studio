import { useLingui } from "@lingui/react/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { useBookRun } from "@/hooks/use-book-run"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"
import { usePages } from "@/hooks/use-pages"
import type { StageRerun } from "./useStageRerun"
import { useStoryboardRun } from "./useStoryboardRun"

/**
 * Re-run state for Storyboard, which the dock never exposes as a step — its
 * first run belongs to the empty canvas, so only the workspace top bar can
 * offer a re-run once pages are rendered.
 */
export function useStoryboardRerun(label: string): StageRerun {
  const { t } = useLingui()
  const storyboard = useStoryboardRun(label)
  const downstreamToReset = useDownstreamWithOutput("storyboard")
  const { isCancelling, cancelRun } = useBookRun()
  const { data: pages } = usePages(label)

  const name = getStageLabelI18n("storyboard")
  const hasRendering = (pages ?? []).some((page) => page.hasRendering)

  const disabledReason = !storyboard.hasSections
    ? t`Run ${getStageLabelI18n("sectioning")} first.`
    : !storyboard.hasApiKey
      ? t`Add an API key in Book settings to re-run ${name}.`
      : null

  return {
    hasRun: hasRendering || storyboard.isRunning,
    isRunning: storyboard.isRunning,
    isCancelling,
    canRun: storyboard.canRun,
    disabledReason,
    downstreamToReset,
    warning: null,
    run: storyboard.run,
    cancel: cancelRun,
  }
}
