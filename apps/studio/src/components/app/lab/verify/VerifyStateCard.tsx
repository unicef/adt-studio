import { useLingui } from "@lingui/react/macro"
import { ArrowLeft, ArrowRight, Check, Copy, PenLine, RotateCcw, SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { clearStageState, type StageStates } from "../stageStates"
import { VariantChips } from "./VariantChips"
import type { VerifyModel } from "./useVerifyModel"

export function VerifyStateCard({ model, stageStates }: { model: VerifyModel; stageStates: StageStates }) {
  const { t, i18n } = useLingui()
  const { states, current, index, verdict, variantKeys, log, page } = model

  return (
    <section
      aria-label={t`Verify this state`}
      className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-xl bg-zinc-800 p-2 ring-1 ring-white/10 shadow-[0_-10px_24px_-6px_rgba(0,0,0,0.5)]"
    >
      <div className="flex gap-0.5 px-0.5 pt-0.5">
        {states.map((state, position) => {
          const stateVerdict = model.record.verdicts[`${page}:${state.id}`]
          const recheck = model.needsRecheck(state.id)
          return (
            <button
              key={state.id}
              type="button"
              title={state.label}
              aria-label={state.label}
              aria-current={position === index || undefined}
              onClick={() => model.open(position)}
              className={cn(
                "h-2 min-w-1.5 flex-1 rounded-full transition-[background-color,box-shadow] duration-150",
                recheck ? "bg-sky-400" : stateVerdict === "ok" ? "bg-emerald-500" : stateVerdict === "issue" ? "bg-amber-400" : "bg-white/15 hover:bg-white/30",
                model.filter === "recheck" && !recheck && position !== index && "opacity-25",
                position === index && "ring-2 ring-white ring-offset-1 ring-offset-zinc-800",
              )}
            />
          )
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={t`Previous state`}
          title={t`Previous state`}
          disabled={!model.hasPrev}
          onClick={() => model.step(-1)}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white disabled:opacity-30"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[10px] font-semibold tracking-[0.08em] text-white/45 uppercase">
            {current ? t`${model.stage} · ${index + 1} of ${states.length}` : t`${model.stage} · ${states.length} states`}
          </span>
          <span key={current?.id ?? "none"} className="truncate text-[14px] font-semibold animate-in fade-in duration-200 motion-reduce:animate-none">
            {current ? current.label : t`Real data`}
          </span>
          <span className="truncate text-[11px] text-white/45">{current ? (stageStates.kinds[current.kind] ?? current.kind) : t`Press Start or pick a dot`}</span>
        </div>
        <button
          type="button"
          onClick={() => model.step(1)}
          disabled={!model.hasNext}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 text-[12px] font-semibold text-zinc-900 transition-transform duration-150 active:scale-[0.97] disabled:opacity-30"
        >
          {index < 0 ? t`Start` : t`Next`}
          <ArrowRight className="size-3.5" />
        </button>
      </div>

      {current && (
        <div key={current.id} className="flex flex-col gap-1.5 rounded-lg bg-white/[0.04] px-2 py-1.5 animate-in fade-in duration-200 motion-reduce:animate-none">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] text-white/45 uppercase">
            <SlidersHorizontal className="size-3" />
            {t`Options in this state`}
          </span>
          {variantKeys.length > 0 ? (
            <div className="flex flex-col gap-2">
              {variantKeys.map((variantKey) => (
                <VariantChips key={variantKey} variantKey={variantKey} />
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-white/45">{t`Nothing to compare here: judge it as it is.`}</span>
          )}
          {log && (
            <span className="text-[11.5px] leading-snug text-sky-200/80">
              {log.status === "fixed" ? t`Fixed · check again` : log.status === "review" ? t`Changed · try the options` : log.status === "pending" ? t`Pending` : t`Pinned`}
              {" · "}
              {i18n._(log.text)}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={!current}
          aria-pressed={verdict === "ok"}
          onClick={() => model.toggle("ok")}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-[background-color,color] duration-150 disabled:opacity-30",
            verdict === "ok" ? "bg-emerald-500 text-white" : "bg-white/5 text-white/80 hover:bg-white/10",
          )}
        >
          <Check className="size-3.5" />
          {t`Approve`}
        </button>
        <button
          type="button"
          disabled={!current}
          aria-pressed={verdict === "issue"}
          onClick={() => model.toggle("issue")}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-[background-color,color] duration-150 disabled:opacity-30",
            verdict === "issue" ? "bg-amber-400 text-zinc-900" : "bg-white/5 text-white/80 hover:bg-white/10",
          )}
        >
          <PenLine className="size-3.5" />
          {t`Needs work`}
        </button>
      </div>
      {current && (
        <textarea
          value={model.note}
          onChange={(event) => model.setNote(event.target.value)}
          rows={2}
          placeholder={t`What's wrong or worth changing? (optional)`}
          className="w-full resize-none rounded-lg bg-white/5 px-2.5 py-2 text-[12px] leading-relaxed text-white outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-white/35 focus:bg-white/10 focus:ring-1 focus:ring-white/25"
        />
      )}

      <div className="flex items-center gap-0.5">
        <span className="flex-1 px-1 text-[11px] leading-tight text-white/50 tabular-nums">{t`${model.reviewed} of ${states.length} checked · ${model.issues} need work`}</span>
        {current && (
          <button
            type="button"
            aria-label={t`Back to real data`}
            title={t`Back to real data`}
            onClick={() => clearStageState()}
            className="grid size-7 place-items-center rounded-full text-white/55 transition-colors duration-150 hover:bg-white/10 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        )}
        {model.reviewed > 0 && (
          <button
            type="button"
            aria-label={t`Clear this stage's results`}
            title={t`Clear this stage's results`}
            onClick={model.clearStage}
            className="grid size-7 place-items-center rounded-full text-white/50 transition-colors duration-150 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="size-3" />
          </button>
        )}
        <button
          type="button"
          onClick={model.exportNotes}
          className="flex h-7 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
        >
          {model.copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {model.copied ? t`Copied` : t`Copy notes`}
        </button>
      </div>
    </section>
  )
}
