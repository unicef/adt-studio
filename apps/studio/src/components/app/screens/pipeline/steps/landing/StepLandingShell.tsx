import { useState, type CSSProperties, type ReactNode } from "react"
import { ChevronDown, Loader2, Play, Settings, X } from "lucide-react"
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
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { Link, useNavigate } from "@tanstack/react-router"
import { StepLandingLayout } from "./StepLandingLayout"
import { useStepVariant } from "@/components/app/screens/pipeline/shared/useStepVariant"
import { hasFullHeightLanding } from "./fullHeight"
import { isStepSettingsSlug } from "@/components/app/screens/pipeline/settings/slugs"
import { useBookStructuredTextAvailability } from "@/hooks/use-api-key"

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
  runWarning?: { title: ReactNode; description: ReactNode } | null
  hideRunButton?: boolean
  beforeRun?: ReactNode
  title?: ReactNode
  description?: ReactNode
  notice?: ReactNode
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
  children,
}: StepLandingShellProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)
  const downstreamAffected = useDownstreamWithOutput(stageSlug)
  const needsConfirmation = isCompleted && downstreamAffected.length > 0
  const { isCancelling, cancelRun } = useBookRun()
  const landingVariant = useStepVariant("landing", stageSlug)
  const actionFirst = landingVariant === "action-first"
  const compact = landingVariant === "compact"
  const navigate = useNavigate()
  const hasAi = useBookStructuredTextAvailability(bookLabel)
  const aiLink =
    (landingVariant !== "current" || title) && !hasAi ? (
      <button
        type="button"
        onClick={() => void navigate({ to: "/pipeline/$label/settings/$section", params: { label: bookLabel, section: "api-keys" } })}
        className="shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <Trans>Set up AI access</Trans>
      </button>
    ) : null
  const [exampleOpen, setExampleOpen] = useState(false)

  const stage = STAGES.find((s) => s.slug === stageSlug)
  const hex = stage?.hex ?? "#4b5563"
  const accentStyle = {
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
  const previewCard = (
    <LandingPreviewShell label={previewLabel} className="h-full w-full" bodyClassName={previewBodyClassName ?? ""}>
      {preview}
    </LandingPreviewShell>
  )
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
      <p className="text-[11.5px] leading-snug text-muted-foreground">{disabledReason}</p>
      {aiLink}
    </div>
  ) : null

  return (
    <div className="@container/landing h-full w-full" style={accentStyle}>
      {hasFullHeightLanding(stageSlug) ? (
        <StepLandingLayout
          heading={heading}
          notices={notices}
          settings={children}
          beforeRun={beforeRun}
          action={hideRunButton ? null : runButton}
          reason={hideRunButton ? null : reasonLine}
          advanced={isStepSettingsSlug(stageSlug) ? advancedLink : null}
          preview={previewCard}
        />
      ) : compact ? (
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5 px-2 py-8 pb-40 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
          {BOOK_LEVEL_STAGES.has(stageSlug as StageName) && <PartialMergeNotice bookLabel={bookLabel} />}
          {children}
          {beforeRun}
          {!hideRunButton && (
            <div className="sticky bottom-[104px] z-10 flex items-center gap-3 rounded-xl border bg-card/95 p-2.5 shadow-[0_14px_32px_-18px_rgba(0,0,0,0.4)] backdrop-blur-md">
              {runButton}
              {isDisabled && !isRunning && disabledReason && (
                <p className="min-w-0 text-[11.5px] leading-snug text-muted-foreground">{disabledReason}</p>
              )}
              {isDisabled && !isRunning && aiLink}
            </div>
          )}
          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setExampleOpen((open) => !open)}
              aria-expanded={exampleOpen}
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown className={cn("size-3.5 transition-transform duration-200", exampleOpen && "rotate-180")} />
              {exampleOpen ? <Trans>Hide the example</Trans> : <Trans>Show an example of the result</Trans>}
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
                exampleOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="mx-auto mt-3 aspect-[650/812] w-full max-w-[380px]">
                  <LandingPreviewShell label={previewLabel} className="h-full w-full" bodyClassName={previewBodyClassName ?? ""}>
                    {preview}
                  </LandingPreviewShell>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
      <div
        className={cn(
          "mx-auto flex w-full max-w-[1080px] gap-7 px-2 py-7 pb-40 @[900px]/landing:flex-row @[900px]/landing:items-start @[900px]/landing:gap-9",
          actionFirst ? "flex-col" : "flex-col-reverse",
        )}
      >
        <div className="flex min-w-0 flex-col gap-5 @[900px]/landing:w-[370px] @[900px]/landing:shrink-0">
          {BOOK_LEVEL_STAGES.has(stageSlug as StageName) && (
            <PartialMergeNotice bookLabel={bookLabel} />
          )}
          {children}
          {beforeRun}

          {!hideRunButton && (
            <div
              className={cn(
                "flex flex-col items-start gap-2 pt-0.5",
                actionFirst && "sticky bottom-[104px] z-10 -mx-2 rounded-xl bg-background/90 px-2 py-2 backdrop-blur-md",
              )}
            >
              {runButton}
              {isDisabled && !isRunning && disabledReason && (
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {disabledReason}
                </p>
              )}
              {isDisabled && !isRunning && aiLink}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
          <div
            className={cn(
              "aspect-[650/812] w-full transition-[max-width] duration-300 @[900px]/landing:max-w-none",
              actionFirst ? "max-w-[340px]" : "max-w-[500px]",
            )}
          >
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
      )}

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
