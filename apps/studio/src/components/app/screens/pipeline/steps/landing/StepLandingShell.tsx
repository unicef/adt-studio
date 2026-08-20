import { useState, type CSSProperties, type ReactNode } from "react"
import { Play, Loader2, X } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { BOOK_LEVEL_STAGES, type StageName } from "@adt/types"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LandingPreviewShell } from "./ui/LandingPreviewShell"
import { PartialMergeNotice } from "@/components/parts/PartialMergeNotice"
import { CascadeResetDialog } from "@/components/pipeline/components/CascadeResetDialog"
import { RunWarningDialog } from "@/components/pipeline/components/RunWarningDialog"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { useBookRun } from "@/hooks/use-book-run"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"

export interface StepLandingShellProps {
  bookLabel: string
  stageSlug: string
  isRunning: boolean
  isCompleted: boolean
  hasError: boolean
  canRun: boolean
  extraDisabled?: boolean
  disabledReason?: ReactNode
  runLabel: ReactNode
  rerunLabel: ReactNode
  previewLabel: string
  previewBodyClassName?: string
  onRun: () => void
  preview: ReactNode
  /**
   * When set, pressing Run first shows an advisory warning modal (e.g. the
   * feature is incompatible with the book's fixed-layout mode). The user can
   * cancel or proceed. Omit/leave null when there's nothing to warn about.
   */
  runWarning?: { title: ReactNode; description: ReactNode } | null
  hideRunButton?: boolean
  /** Pre-run checklist supplied by the workspace, rendered above Run. */
  beforeRun?: ReactNode
  children: ReactNode
}

/**
 * A stage's landing inside the pipeline workspace: what the stage does and the
 * settings that shape it, beside a live preview of the result.
 *
 * The workspace already supplies a rail, a settings gear and a dock, so there is
 * no aside and no footer here — Run sits at the end of the settings column, and
 * the two panes swap to a single column when the workspace squeezes them.
 * Colours come from `stage-config` rather than being passed per stage.
 */
export function StepLandingShell({
  bookLabel,
  stageSlug,
  isRunning,
  isCompleted,
  hasError,
  canRun,
  extraDisabled = false,
  disabledReason,
  runLabel,
  rerunLabel,
  previewLabel,
  previewBodyClassName,
  onRun,
  preview,
  runWarning,
  hideRunButton = false,
  beforeRun,
  children,
}: StepLandingShellProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)
  const downstreamAffected = useDownstreamWithOutput(stageSlug)
  const needsConfirmation = isCompleted && downstreamAffected.length > 0
  const { isCancelling, cancelRun } = useBookRun()

  const stage = STAGES.find((s) => s.slug === stageSlug)
  const hex = stage?.hex ?? "#4b5563"
  const accentStyle = {
    "--accent-color": hex,
    "--ring": hex,
    "--accent-color-soft": tint(hex, 0.12),
  } as CSSProperties

  const isDisabled = isRunning || !canRun || extraDisabled

  // Run gates, applied outermost-first: fixed-layout (or other) warning, then
  // the cascade-reset confirmation, then the run itself.
  const proceedRun = () => {
    if (needsConfirmation) {
      setConfirmOpen(true)
    } else {
      onRun()
    }
  }

  const handleRunClick = () => {
    if (runWarning) {
      setWarnOpen(true)
    } else {
      proceedRun()
    }
  }

  const pressable =
    "transition-[background-color,opacity,transform] duration-160 ease-out active:scale-[0.97] motion-reduce:active:scale-100"

  const runButton = isRunning ? (
    <Button
      onClick={() => cancelRun()}
      disabled={isCancelling}
      className={cn(
        "h-10 border-0 px-5 font-medium text-white",
        pressable,
        "bg-red-500 hover:bg-red-700 disabled:cursor-default disabled:opacity-60",
      )}
    >
      {isCancelling ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
          <Trans>Cancelling...</Trans>
        </>
      ) : (
        <>
          <X className="mr-2 size-5" />
          <Trans>Cancel</Trans>
        </>
      )}
    </Button>
  ) : (
    <Button
      onClick={handleRunClick}
      disabled={isDisabled}
      style={hasError ? undefined : { background: hex }}
      className={cn(
        "h-10 border-0 px-5 font-medium text-white hover:opacity-90",
        pressable,
        "disabled:cursor-default disabled:opacity-50",
        hasError && "bg-destructive hover:bg-destructive",
      )}
    >
      <Play className="mr-2 size-4" />
      {isCompleted || hasError ? rerunLabel : runLabel}
    </Button>
  )

  return (
    <div className="@container/landing h-full w-full" style={accentStyle}>
      <div className="mx-auto flex w-full max-w-[1080px] flex-col-reverse gap-7 px-2 py-7 pb-40  @[900px]/landing:flex-row @[900px]/landing:items-start @[900px]/landing:gap-9">
        <div className="flex min-w-0 flex-col gap-5 @[900px]/landing:w-[370px] @[900px]/landing:shrink-0">
          {BOOK_LEVEL_STAGES.has(stageSlug as StageName) && (
            <PartialMergeNotice bookLabel={bookLabel} />
          )}
          {children}
          {beforeRun}

          {!hideRunButton && (
            <div className="flex flex-col items-start gap-2 pt-0.5">
              {runButton}
              {isDisabled && !isRunning && disabledReason && (
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {disabledReason}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
          <div className="aspect-[650/812] w-full max-w-[500px] @[900px]/landing:max-w-none">
            <LandingPreviewShell
              label={previewLabel}
              className="h-full w-full"
              bodyClassName={previewBodyClassName ?? ""}
            >
              {preview}
            </LandingPreviewShell>
          </div>
        </div>
      </div>

      <CascadeResetDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        affectedStages={downstreamAffected}
        headerStageSlug={stageSlug}
        title={<Trans>Re-run {getStageLabelI18n(stageSlug)}?</Trans>}
        description={
          <Trans>
            The completed stages below will be reset and need to run again before
            final outputs are available.
          </Trans>
        }
        confirmLabel={rerunLabel}
        confirmColorClass={hasError ? "bg-destructive" : (stage?.color ?? "bg-gray-600")}
        onConfirm={() => {
          setConfirmOpen(false)
          onRun()
        }}
      />

      {runWarning && (
        <RunWarningDialog
          open={warnOpen}
          onOpenChange={setWarnOpen}
          title={runWarning.title}
          description={runWarning.description}
          confirmColorClass={hasError ? "bg-destructive" : (stage?.color ?? "bg-gray-600")}
          onConfirm={() => {
            setWarnOpen(false)
            proceedRun()
          }}
        />
      )}
    </div>
  )
}
