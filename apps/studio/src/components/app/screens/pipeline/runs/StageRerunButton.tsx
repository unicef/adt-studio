import { useState } from "react"
import { Loader2, RotateCcw, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { CascadeResetDialog } from "@/components/pipeline/components/CascadeResetDialog"
import { RunWarningDialog } from "@/components/pipeline/components/RunWarningDialog"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import type { StageRerun } from "./useStageRerun"

/**
 * `header` sits on a stage-tinted plugin header (light text on colour);
 * `topbar` sits on the neutral workspace top bar next to Preview.
 */
export type StageRerunVariant = "header" | "topbar" | "banner"

const VARIANT_BASE: Record<StageRerunVariant, string> = {
  header: cn(
    "relative flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold",
    "transition-[background-color,opacity,scale] duration-160 ease-out",
    "active:scale-[0.97] motion-reduce:active:scale-100",
    "before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
  ),
  topbar: "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
  banner: "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold transition-colors",
}

const VARIANT_RUN: Record<StageRerunVariant, string> = {
  header: "bg-white/16 hover:bg-white/24 disabled:cursor-default disabled:bg-white/8 disabled:opacity-55",
  topbar: "text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
  banner: cn(
    "border-amber-300 bg-white/70 text-amber-900 hover:bg-amber-100 disabled:pointer-events-none disabled:opacity-60",
    "dark:border-amber-800 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/50",
  ),
}

const VARIANT_CANCEL: Record<StageRerunVariant, string> = {
  header: "bg-red-500/95 text-white hover:bg-red-600 disabled:cursor-default disabled:opacity-60",
  topbar: cn(
    "border-red-200 text-red-600 hover:bg-red-50 disabled:pointer-events-none disabled:opacity-60",
    "dark:border-red-900 dark:hover:bg-red-950/40",
  ),
  banner: cn(
    "border-red-300 bg-white/70 text-red-700 hover:bg-red-50 disabled:pointer-events-none disabled:opacity-60",
    "dark:border-red-900 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-950/40",
  ),
}

export interface StageRerunButtonProps {
  slug: string
  rerun: StageRerun
  variant?: StageRerunVariant
}

/** Re-runs one stage that already produced output, cancelling it while it runs. */
export function StageRerunButton({ slug, rerun, variant = "header" }: StageRerunButtonProps) {
  const { t } = useLingui()
  const [cascadeOpen, setCascadeOpen] = useState(false)
  const [warnOpen, setWarnOpen] = useState(false)

  if (!rerun.hasRun) return null

  const name = getStageLabelI18n(slug)
  const confirmColorClass = STAGES.find((s) => s.slug === slug)?.color ?? "bg-gray-600"

  const proceed = () => {
    if (rerun.downstreamToReset.length > 0) setCascadeOpen(true)
    else rerun.run()
  }

  if (rerun.isRunning) {
    return (
      <button
        type="button"
        onClick={rerun.cancel}
        disabled={rerun.isCancelling}
        style={NO_DRAG_REGION}
        title={t`Cancel the ${name} run`}
        aria-label={t`Cancel the ${name} run`}
        className={cn(VARIANT_BASE[variant], VARIANT_CANCEL[variant])}
      >
        {rerun.isCancelling ? (
          <>
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
            <Trans>Cancelling…</Trans>
          </>
        ) : (
          <>
            <X className="size-3.5" />
            <Trans>Cancel</Trans>
          </>
        )}
      </button>
    )
  }

  const resetCount = rerun.downstreamToReset.length
  const title = !rerun.canRun
    ? (rerun.disabledReason ?? t`Re-run ${name}`)
    : resetCount > 0
      ? t`Re-run ${name} — ${plural(resetCount, {
          one: "# completed stage will be reset",
          other: "# completed stages will be reset",
        })}`
      : t`Re-run ${name}`

  return (
    <>
      <button
        type="button"
        onClick={() => (rerun.warning ? setWarnOpen(true) : proceed())}
        disabled={!rerun.canRun}
        style={NO_DRAG_REGION}
        title={title}
        aria-label={title}
        className={cn(VARIANT_BASE[variant], VARIANT_RUN[variant])}
      >
        <RotateCcw className="size-3.5" />
        <Trans>Re-run</Trans>
      </button>

      <CascadeResetDialog
        open={cascadeOpen}
        onOpenChange={setCascadeOpen}
        affectedStages={rerun.downstreamToReset}
        headerStageSlug={slug}
        title={<Trans>Re-run {name}?</Trans>}
        description={
          <Trans>
            The completed stages below will be reset and need to run again before
            final outputs are available.
          </Trans>
        }
        confirmLabel={<Trans>Re-run</Trans>}
        confirmColorClass={confirmColorClass}
        onConfirm={() => {
          setCascadeOpen(false)
          rerun.run()
        }}
      />

      {rerun.warning && (
        <RunWarningDialog
          open={warnOpen}
          onOpenChange={setWarnOpen}
          title={rerun.warning.title}
          description={rerun.warning.description}
          confirmColorClass={confirmColorClass}
          onConfirm={() => {
            setWarnOpen(false)
            proceed()
          }}
        />
      )}
    </>
  )
}
