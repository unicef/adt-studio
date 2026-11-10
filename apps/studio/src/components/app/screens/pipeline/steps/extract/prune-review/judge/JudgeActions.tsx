import { useEffect, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { Check, ClipboardCopy, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ROW_BUTTON } from "../ReviewRow"
import type { JudgingApi } from "./useJudging"

export function CopyResultsButton({ judge, primary = false }: { judge: JudgingApi; primary?: boolean }) {
  const { t } = useLingui()
  return (
    <button
      type="button"
      onClick={() => judge.copyResults()}
      title={t`Copy every verdict and comment as Markdown`}
      data-judge-copy
      className={cn(
        ROW_BUTTON,
        "h-8 min-w-[7.5rem] justify-center",
        primary && "border-transparent bg-[var(--chrome-hex)] text-white hover:bg-[var(--chrome-hex)] hover:opacity-90",
        judge.copied && !primary && "border-emerald-600/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
      )}
    >
      <span key={judge.copied ? "copied" : "copy"} className="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none" aria-live="polite">
        {judge.copied ? <Check className="size-3.5" aria-hidden /> : <ClipboardCopy className="size-3.5" aria-hidden />}
        {judge.copied ? <Trans>Copied</Trans> : <Trans>Copy results</Trans>}
      </span>
    </button>
  )
}

export function ClearJudgements({ judge }: { judge: JudgingApi }) {
  const { t } = useLingui()
  const [asking, setAsking] = useState(false)
  const count = judge.stored

  useEffect(() => {
    if (!asking) return
    const timer = window.setTimeout(() => setAsking(false), 6000)
    return () => window.clearTimeout(timer)
  }, [asking])

  if (asking)
    return (
      <span className="flex shrink-0 items-center gap-1 animate-in fade-in slide-in-from-right-1 duration-200 motion-reduce:animate-none" role="group" aria-label={t`Confirm clearing judgements`}>
        <span className="text-[11.5px] font-medium text-foreground/80">{t`${plural(count, { one: "Clear # judgement?", other: "Clear all # judgements?" })}`}</span>
        <button
          type="button"
          onClick={() => {
            judge.clear()
            setAsking(false)
          }}
          data-judge-clear-confirm
          className={cn(ROW_BUTTON, "h-8 border-red-600/40 text-red-700 hover:bg-red-500/10 dark:border-red-400/40 dark:text-red-300")}
        >
          <Trans>Clear</Trans>
        </button>
        <button type="button" onClick={() => setAsking(false)} className={cn(ROW_BUTTON, "h-8")} autoFocus>
          <Trans>Cancel</Trans>
        </button>
      </span>
    )

  return (
    <button
      type="button"
      onClick={() => setAsking(true)}
      disabled={count === 0}
      aria-label={t`Clear judgements`}
      title={t`Clear judgements`}
      data-judge-clear
      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-[background-color,color,opacity] duration-150 hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]"
    >
      <Trash2 className="size-3.5" aria-hidden />
    </button>
  )
}
