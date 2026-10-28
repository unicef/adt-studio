import { useId, useState, type CSSProperties, type ReactNode } from "react"
import { Loader2, Play, Settings, X } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { BOOK_LEVEL_STAGES, type StageName } from "@adt/types"
import { Button } from "@/components/ui/button"
import { LandingPreviewShell } from "./ui/LandingPreviewShell"
import { PartialMergeNotice } from "@/components/parts/PartialMergeNotice"
import { CascadeResetDialog } from "@/components/pipeline/components/CascadeResetDialog"
import { RunWarningDialog } from "@/components/pipeline/components/RunWarningDialog"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { useBookRun } from "@/hooks/use-book-run"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { Link, useNavigate } from "@tanstack/react-router"
import { StepLandingLayout } from "./StepLandingLayout"
import { isStepSettingsSlug } from "@/components/app/screens/pipeline/settings/slugs"
import { useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { useStageError } from "../shared/RunErrorNotice"
import { useDescribeProblem, type ProblemStage } from "../shared/problems/useDescribeProblem"
import { TONE_BUTTON } from "@/components/ui/notice-tone"
import { problemTone } from "../shared/problems/problemTone"

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
  previewLabel?: string
  previewBodyClassName?: string
  onRun: () => void
  preview?: ReactNode
  runWarning?: { title: ReactNode; description: ReactNode; confirmLabel?: ReactNode } | null
  hideRunButton?: boolean
  beforeRun?: ReactNode
  title?: ReactNode
  description?: ReactNode
  notice?: ReactNode
  canvas?: ReactNode
  children: ReactNode
}

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
  title,
  description,
  notice,
  canvas,
  children,
}: StepLandingShellProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)
  const downstreamAffected = useDownstreamWithOutput(stageSlug)
  const needsConfirmation = isCompleted && downstreamAffected.length > 0
  const { isCancelling, cancelRun } = useBookRun()
  const navigate = useNavigate()
  const hasAi = useBookStructuredTextAvailability(bookLabel)
  const aiLink =
    !hasAi ? (
      <button
        type="button"
        onClick={() => void navigate({ to: "/pipeline/$label/settings/$section", params: { label: bookLabel, section: "api-keys" } })}
        className="shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <Trans>Set up AI access</Trans>
      </button>
    ) : null
  const reasonId = useId()
  const stage = STAGES.find((s) => s.slug === stageSlug)
  const hex = stage?.hex ?? "#4b5563"
  const stageError = useStageError(stageSlug as ProblemStage)
  const describe = useDescribeProblem()
  const errorTone = problemTone(describe(stageSlug as ProblemStage, stageError).level)
  const confirmFill = hasError && errorTone === "critical" ? "bg-destructive" : (stage?.color ?? "bg-gray-600")

  const accentStyle = {
    "--tint": hex,
    "--accent-color": hex,
    "--ring": hex,
    "--accent-color-soft": tint(hex, 0.12),
  } as CSSProperties

  const isDisabled = isRunning || !canRun || extraDisabled

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
      aria-describedby={isDisabled && disabledReason ? reasonId : undefined}
      style={hasError || isDisabled ? undefined : { background: hex }}
      className={cn(
        "h-10 border-0 px-5 font-medium text-white hover:opacity-90",
        pressable,
        "disabled:cursor-default disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
        hasError && TONE_BUTTON[errorTone],
      )}
    >
      <Play className="mr-2 size-4" />
      {hasError ? <Trans>Try again</Trans> : isCompleted ? rerunLabel : runLabel}
    </Button>
  )

  const StageIcon = stage?.icon
  const heading = title ? (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3.5">
        {StageIcon && (
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl text-white animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none"
            style={{ background: hex, boxShadow: `0 10px 24px -12px ${hex}` }}
          >
            <StageIcon className="size-5.5" strokeWidth={2.1} />
          </span>
        )}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
      </div>
      {description && <p className="text-[14px] leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  ) : null
  const showReason = isDisabled && !isRunning && !!disabledReason
  const notices = (
    <>
      {BOOK_LEVEL_STAGES.has(stageSlug as StageName) && <PartialMergeNotice bookLabel={bookLabel} />}
      {notice}
    </>
  )
  const previewCard =
    preview != null ? (
      <LandingPreviewShell label={previewLabel ?? ""} className="h-full w-full" bodyClassName={previewBodyClassName ?? ""}>
        {preview}
      </LandingPreviewShell>
    ) : null
  const advancedLink = (
    <Link
      to="/pipeline/$label/$step/settings"
      params={{ label: bookLabel, step: stageSlug }}
      className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <Settings className="size-3.5" />
      <Trans>Advanced settings</Trans>
    </Link>
  )
  const reasonLine = showReason ? (
    <div className="flex flex-wrap items-center gap-2">
      <p id={reasonId} className="text-[11.5px] leading-snug text-foreground/75">{disabledReason}</p>
      {aiLink}
    </div>
  ) : null

  return (
    <div className="@container/landing h-full w-full" style={accentStyle}>
      <StepLandingLayout
        heading={heading}
        notices={notices}
        settings={children}
        beforeRun={beforeRun}
        action={hideRunButton ? null : runButton}
        reason={hideRunButton ? null : reasonLine}
        advanced={isStepSettingsSlug(stageSlug) ? advancedLink : null}
        preview={previewCard}
        canvas={canvas}
      />

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
        confirmColorClass={confirmFill}
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
          confirmLabel={runWarning.confirmLabel}
          confirmColorClass={confirmFill}
          onConfirm={() => {
            setWarnOpen(false)
            proceedRun()
          }}
        />
      )}
    </div>
  )
}
