import { useLingui } from "@lingui/react/macro"
import { Hourglass, Pin, SlidersHorizontal, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StageStates } from "../stageStates"
import { TestingCard, TestingPointer } from "./TestingCard"
import { useVerifyModel } from "./useVerifyModel"
import { VerifyStateCard } from "./VerifyStateCard"
import type { LogStatus } from "./verifyLog"

const LOG_STYLE: Record<LogStatus, { box: string; text: string }> = {
  fixed: { box: "bg-sky-400/15 ring-1 ring-sky-400/40", text: "text-sky-200" },
  review: { box: "bg-sky-400/15 ring-1 ring-sky-400/40", text: "text-sky-200" },
  pending: { box: "bg-white/5 ring-1 ring-white/10", text: "text-white/70" },
  pinned: { box: "bg-white/5 ring-1 ring-white/10", text: "text-white/50" },
}

export function VerifyPanel({ page, stageStates, active }: { page: string | null; stageStates: StageStates | null; active: { page: string; id: string } | null }) {
  const { t, i18n } = useLingui()
  const model = useVerifyModel(page, stageStates, active)
  const { states, log } = model

  if (!stageStates) return <p className="px-2 py-1 text-[11.5px] text-white/55">{t`Verification needs the local lab canvas files (lab/canvas).`}</p>
  if (!page || states.length === 0)
    return (
      <div className="flex flex-col gap-1.5">
        <TestingPointer page={page} />
        <p className="px-2 py-2 text-[12px] leading-relaxed text-white/60">{t`This screen has no simulated states yet. Open a stage (Extract, Sectioning…) to verify its states.`}</p>
      </div>
    )

  return (
    <div className="flex flex-col gap-1.5">
      <TestingCard page={page} items={model.testingNow} stageStates={stageStates} />
      <TestingPointer page={page} />

      {model.recheckCount > 0 && (
        <div className="flex items-center gap-0.5 rounded-xl bg-white/5 p-1">
          {(
            [
              ["all", t`All states`],
              ["recheck", t`To re-check (${model.recheckCount})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={model.filter === value}
              onClick={() => model.setFilter(value)}
              className={cn(
                "h-7 flex-1 rounded-lg text-[12px] font-semibold transition-[background-color,color] duration-150",
                model.filter === value ? "bg-white text-zinc-900" : "text-white/65 hover:bg-white/10 hover:text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {log && (
        <div className={cn("flex gap-2 rounded-xl px-2.5 py-2 animate-in fade-in duration-200 motion-reduce:animate-none", LOG_STYLE[log.status].box)}>
          {log.status === "fixed" ? (
            <Wrench className="mt-0.5 size-3.5 shrink-0 text-sky-300" />
          ) : log.status === "review" ? (
            <SlidersHorizontal className="mt-0.5 size-3.5 shrink-0 text-sky-300" />
          ) : log.status === "pending" ? (
            <Hourglass className="mt-0.5 size-3.5 shrink-0 text-white/55" />
          ) : (
            <Pin className="mt-0.5 size-3.5 shrink-0 text-white/45" />
          )}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={cn("text-[11px] font-semibold tracking-[0.06em] uppercase", LOG_STYLE[log.status].text)}>
              {log.status === "fixed" ? t`Fixed · check again` : log.status === "review" ? t`Changed · try the options` : log.status === "pending" ? t`Pending · ${log.group ? i18n._(log.group) : ""}` : t`Pinned`}
            </span>
            <span className="text-[12px] leading-snug text-white/80">{i18n._(log.text)}</span>
          </span>
        </div>
      )}

      {(model.fixedCount > 0 || model.pendingCount > 0) && (
        <span className="px-1 text-[11px] leading-tight text-white/40 tabular-nums">{t`${model.fixedCount} changed · ${model.pendingCount} pending`}</span>
      )}

      <VerifyStateCard model={model} stageStates={stageStates} />
    </div>
  )
}
