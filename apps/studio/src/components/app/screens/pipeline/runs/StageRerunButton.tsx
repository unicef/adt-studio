import { useId } from "react"
import { Loader2, RotateCcw, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import type { StageRerun } from "./useStageRerun"
import type { ProblemTone } from "@/components/app/screens/pipeline/steps/shared/problems/problemTone"
import { useRerunConfirm } from "./useRerunConfirm"

export type StageRerunVariant = "header" | "topbar" | "banner" | "bar"

const VARIANT_BASE: Record<StageRerunVariant, string> = {
  header: cn(
    "relative flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold",
    "transition-[background-color,opacity,scale] duration-160 ease-out",
    "active:scale-[0.97] motion-reduce:active:scale-100",
    "before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
  ),
  topbar: "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
  banner: "flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] font-semibold transition-colors",
  bar: "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium transition-colors duration-150",
}

const VARIANT_RUN: Record<StageRerunVariant, string> = {
  header: "bg-white/16 hover:bg-white/24 aria-disabled:cursor-default aria-disabled:bg-muted! aria-disabled:text-muted-foreground!",
  topbar: "text-foreground hover:bg-muted aria-disabled:pointer-events-none",
  banner: cn(
    "border-amber-300 bg-white/70 text-amber-900 hover:bg-amber-100 aria-disabled:pointer-events-none",
    "dark:border-amber-800 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/50",
  ),
  bar: "text-foreground hover:bg-muted aria-disabled:pointer-events-none",
}

const VARIANT_RETRY: Record<ProblemTone, Record<StageRerunVariant, string>> = {
  attention: {
    header: "bg-amber-500/12! text-amber-800! hover:bg-amber-500/20! dark:text-amber-300! aria-disabled:cursor-default aria-disabled:bg-muted! aria-disabled:text-muted-foreground!",
    topbar: "border-amber-300 text-amber-800 hover:bg-amber-500/10 dark:text-amber-300 aria-disabled:pointer-events-none",
    banner: "border-amber-300 text-amber-800 hover:bg-amber-500/10 dark:text-amber-300 aria-disabled:pointer-events-none",
    bar: "text-amber-800 hover:bg-amber-500/10 dark:text-amber-300 aria-disabled:pointer-events-none",
  },
  critical: {
    header: "bg-destructive/12! text-destructive! hover:bg-destructive/20! aria-disabled:cursor-default aria-disabled:bg-muted! aria-disabled:text-muted-foreground!",
    topbar: "border-destructive/30 text-destructive hover:bg-destructive/10 aria-disabled:pointer-events-none",
    banner: "border-destructive/30 text-destructive hover:bg-destructive/10 aria-disabled:pointer-events-none",
    bar: "text-destructive hover:bg-destructive/10 aria-disabled:pointer-events-none",
  },
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
  bar: "text-red-600 hover:bg-red-50 disabled:pointer-events-none disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40",
}

export interface StageRerunButtonProps {
  slug: string
  rerun: StageRerun
  variant?: StageRerunVariant
  tone?: ProblemTone
  labelClassName?: string
}

export function StageRerunButton({ slug, rerun, variant = "header", tone = "critical", labelClassName }: StageRerunButtonProps) {
  const { t } = useLingui()
  const confirm = useRerunConfirm(slug, rerun)
  const reasonId = useId()

  if (!rerun.hasRun) return null

  const name = getStageLabelI18n(slug)

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
  const retry = rerun.hasError === true
  const action = retry ? t`Try ${name} again` : t`Re-run ${name}`
  const title = !rerun.canRun
    ? (rerun.disabledReason ?? action)
    : resetCount > 0
      ? retry
        ? t`Try ${name} again — ${plural(resetCount, {
            one: "# completed stage will be reset",
            other: "# completed stages will be reset",
          })}`
        : t`Re-run ${name} — ${plural(resetCount, {
            one: "# completed stage will be reset",
            other: "# completed stages will be reset",
          })}`
      : action

  const blockedReason = !rerun.canRun ? (rerun.disabledReason ?? null) : null

  return (
    <>
      <span className="group/rerun relative inline-flex shrink-0">
        <button
          type="button"
          onClick={confirm.request}
          aria-disabled={!rerun.canRun || undefined}
          aria-describedby={blockedReason ? reasonId : undefined}
          style={NO_DRAG_REGION}
          aria-label={!rerun.canRun ? action : title}
          data-retry={retry || undefined}
          className={cn(
            "group/rerun-button",
            VARIANT_BASE[variant],
            retry ? VARIANT_RETRY[tone][variant] : VARIANT_RUN[variant],
            !rerun.canRun && "cursor-default",
          )}
        >
          <RotateCcw className="size-3.5" />
          <span className={cn(variant === "bar" && "max-xl:hidden", labelClassName)}>
            {retry ? <Trans>Try again</Trans> : <Trans>Re-run</Trans>}
          </span>
        </button>
        {blockedReason && (
          <span
            id={reasonId}
            role="tooltip"
            className="pointer-events-none invisible absolute right-0 top-full z-50 mt-1.5 w-max max-w-[260px] rounded-md bg-foreground px-2.5 py-1.5 text-[11.5px] font-medium leading-snug text-background opacity-0 shadow-lg transition-opacity duration-150 group-focus-within/rerun:visible group-focus-within/rerun:opacity-100 group-hover/rerun:visible group-hover/rerun:opacity-100 motion-reduce:transition-none"
          >
            {blockedReason}
          </span>
        )}
      </span>

      {confirm.dialogs}
    </>
  )
}
