import { useLayoutEffect, useRef } from "react"
import { useLingui } from "@lingui/react/macro"
import { ArrowLeft, ArrowRight, Check, Copy, PenLine, SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { clearStageState, type StageStates } from "../stageStates"
import { VariantChips } from "./VariantChips"
import { useVerifyModel } from "./useVerifyModel"

function useBarHeight() {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const root = document.documentElement
    const update = () => root.style.setProperty("--verify-bar-h", `${Math.round(node.offsetHeight)}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => {
      observer.disconnect()
      root.style.setProperty("--verify-bar-h", "0px")
    }
  }, [])
  return ref
}

const divider = <span aria-hidden className="w-px shrink-0 self-stretch bg-white/10" />

export function VerifyBar({ page, stageStates, active }: { page: string | null; stageStates: StageStates | null; active: { page: string; id: string } | null }) {
  const { t, i18n } = useLingui()
  const model = useVerifyModel(page, stageStates, active)
  const ref = useBarHeight()
  const { states, current, index, verdict, variantKeys, log } = model

  return (
    <section
      ref={ref}
      data-verify-bar=""
      aria-label={t`Verification`}
      className="relative z-[60] shrink-0 border-t border-white/10 bg-zinc-900 text-white shadow-[0_-12px_32px_rgba(0,0,0,0.22)] animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
    >
      <div className="flex gap-1 px-4 pt-2.5">
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
                "h-1.5 min-w-1.5 flex-1 rounded-full transition-[background-color,box-shadow,height] duration-150 hover:h-2.5",
                recheck ? "bg-sky-400" : stateVerdict === "ok" ? "bg-emerald-500" : stateVerdict === "issue" ? "bg-amber-400" : "bg-white/15 hover:bg-white/30",
                model.filter === "recheck" && !recheck && position !== index && "opacity-25",
                position === index && "h-2.5 ring-2 ring-white ring-offset-1 ring-offset-zinc-900",
              )}
            />
          )
        })}
      </div>

      <div className="flex items-stretch gap-3 px-4 pt-2 pb-3">
        <div className="flex w-[300px] shrink-0 items-center gap-2">
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
            <span className="truncate text-[11px] text-white/45">
              {current ? (stageStates?.kinds[current.kind] ?? current.kind) : t`Press Start or pick a dot`}
            </span>
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

        {divider}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] text-white/45 uppercase">
            <SlidersHorizontal className="size-3" />
            {t`Options in this state`}
          </span>
          {current && variantKeys.length > 0 ? (
            <div key={current.id} className="flex flex-wrap items-start gap-x-5 gap-y-2 animate-in fade-in duration-200 motion-reduce:animate-none">
              {variantKeys.map((variantKey) => (
                <VariantChips key={variantKey} variantKey={variantKey} />
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-white/45">{current ? t`Nothing to compare here: judge it as it is.` : t`Open a state to see what it lets you compare.`}</span>
          )}
          {log && (
            <span className="truncate text-[11.5px] text-sky-200/80" title={i18n._(log.text)}>
              {log.status === "fixed" ? t`Fixed · check again` : log.status === "review" ? t`Changed · try the options` : log.status === "pending" ? t`Pending` : t`Pinned`}
              {" · "}
              {i18n._(log.text)}
            </span>
          )}
        </div>

        {divider}

        <div className="flex w-[360px] shrink-0 flex-col justify-center gap-1.5">
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
          <textarea
            value={model.note}
            disabled={!current}
            onChange={(event) => model.setNote(event.target.value)}
            rows={1}
            placeholder={t`What's wrong or worth changing? (optional)`}
            className="field-sizing-content max-h-24 min-h-8 w-full resize-none rounded-lg bg-white/5 px-2.5 py-1.5 text-[12px] leading-relaxed text-white outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-white/35 focus:bg-white/10 focus:ring-1 focus:ring-white/25 disabled:opacity-40"
          />
        </div>

        {divider}

        <div className="flex w-[150px] shrink-0 flex-col justify-center gap-1">
          <span className="text-[11px] leading-tight text-white/50 tabular-nums">
            {t`${model.reviewed} of ${states.length} checked`}
            <br />
            {t`${model.issues} need work`}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={model.exportNotes}
              className="flex h-7 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              {model.copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {model.copied ? t`Copied` : t`Copy notes`}
            </button>
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
          </div>
        </div>
      </div>
    </section>
  )
}
