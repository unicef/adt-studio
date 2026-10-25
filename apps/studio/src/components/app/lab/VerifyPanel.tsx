import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { ArrowLeft, ArrowRight, Check, Copy, Hourglass, Pin, PenLine, RotateCcw, SlidersHorizontal, Wrench, X } from "lucide-react"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { cn } from "@/lib/utils"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { checkedStore } from "./ChecklistPanel"
import { applyStageState, clearStageState, type StageStates } from "./stageStates"
import { VERIFY_LOG, type LogStatus } from "./verifyLog"
import { VARIANT_GROUPS, setVariantValue, useVariants, type VariantKey } from "./variants"

type Verdict = "ok" | "issue"

interface VerifyRecord {
  verdicts: Record<string, Verdict>
  notes: Record<string, string>
  rechecked?: Record<string, boolean | number>
}

const filterStore = createPersistentStore<"all" | "recheck">("adt.lab.verify-filter", "all", (value): value is "all" | "recheck" => value === "all" || value === "recheck")

const LOG_STYLE: Record<LogStatus, { box: string; text: string }> = {
  fixed: { box: "bg-sky-400/15 ring-1 ring-sky-400/40", text: "text-sky-200" },
  review: { box: "bg-sky-400/15 ring-1 ring-sky-400/40", text: "text-sky-200" },
  pending: { box: "bg-white/5 ring-1 ring-white/10", text: "text-white/70" },
  pinned: { box: "bg-white/5 ring-1 ring-white/10", text: "text-white/50" },
}

export const verifyModeStore = createPersistentStore<boolean>("adt.lab.verify-mode", false, (value): value is boolean => typeof value === "boolean")

const recordStore = createPersistentStore<VerifyRecord>(
  "adt.lab.verify",
  { verdicts: {}, notes: {} },
  (value): value is VerifyRecord => typeof value === "object" && value !== null && "verdicts" in value && "notes" in value,
)

function copy(text: string) {
  const area = document.createElement("textarea")
  area.value = text
  area.style.position = "fixed"
  area.style.opacity = "0"
  document.body.appendChild(area)
  area.select()
  document.execCommand("copy")
  area.remove()
}

export function VerifyPanel({ page, stageStates, active }: { page: string | null; stageStates: StageStates | null; active: { page: string; id: string } | null }) {
  const { t } = useLingui()
  const [record, setRecord] = recordStore.use()
  const [, setChecked] = checkedStore.use()
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = filterStore.use()
  const variants = useVariants()
  const { i18n } = useLingui()

  if (!stageStates) return <p className="px-2 py-1 text-[11.5px] text-white/55">{t`Verification needs the local lab canvas files (lab/canvas).`}</p>
  const states = page ? (stageStates.byPage[page] ?? []) : []
  if (!page || states.length === 0) return <p className="px-2 py-2 text-[12px] leading-relaxed text-white/60">{t`This screen has no simulated states yet. Open a stage (Extract, Sectioning…) to verify its states.`}</p>

  const stage = getStageLabelI18n(page)
  const needsRecheck = (id: string) => {
    const stateKey = `${page}:${id}`
    const entry = VERIFY_LOG[stateKey]
    if (entry?.status !== "fixed" && entry?.status !== "review") return false
    const seen = record.rechecked?.[stateKey]
    const seenRound = seen === true ? 1 : typeof seen === "number" ? seen : 0
    return seenRound < (entry.round ?? 1)
  }
  const recheckCount = states.filter((state) => needsRecheck(state.id)).length
  const fixedCount = states.filter((state) => ["fixed", "review"].includes(VERIFY_LOG[`${page}:${state.id}`]?.status ?? "")).length
  const pendingCount = states.filter((state) => VERIFY_LOG[`${page}:${state.id}`]?.status === "pending").length
  const visible = filter === "recheck" ? states.map((state, position) => ({ state, position })).filter(({ state }) => needsRecheck(state.id)) : states.map((state, position) => ({ state, position }))
  const index = active?.page === page ? states.findIndex((state) => state.id === active.id) : -1
  const current = index >= 0 ? states[index] : null
  const key = current ? `${page}:${current.id}` : ""
  const verdict = current ? record.verdicts[key] : undefined
  const note = current ? (record.notes[key] ?? "") : ""
  const reviewed = states.filter((state) => record.verdicts[`${page}:${state.id}`]).length
  const issues = states.filter((state) => record.verdicts[`${page}:${state.id}`] === "issue").length

  const open = (position: number) => {
    const target = states[position]
    if (target) applyStageState(page, target)
  }
  const step = (direction: 1 | -1) => {
    const order = visible.map(({ position }) => position)
    const ahead = direction === 1 ? order.find((position) => position > index) : [...order].reverse().find((position) => position < index)
    const wrapped = filter === "recheck" ? (direction === 1 ? order[0] : order[order.length - 1]) : undefined
    const next = ahead ?? wrapped
    if (next !== undefined && next !== index) open(next)
  }
  const others = visible.filter(({ position }) => position !== index)
  const hasPrev = filter === "recheck" ? others.length > 0 : visible.some(({ position }) => position < index)
  const hasNext = filter === "recheck" ? others.length > 0 : visible.some(({ position }) => position > index)
  const log = current ? VERIFY_LOG[key] : undefined
  const judge = (next: Verdict | null) => {
    if (!current) return
    setRecord((prev) => {
      const verdicts = { ...prev.verdicts }
      if (next) verdicts[key] = next
      else delete verdicts[key]
      const entry = VERIFY_LOG[key]
      const rechecked = (entry?.status === "fixed" || entry?.status === "review") && next ? { ...prev.rechecked, [key]: entry.round ?? 1 } : prev.rechecked
      return { ...prev, verdicts, rechecked }
    })
    setChecked((prev) => ({ ...prev, [key]: next === "ok" }))
  }
  const exportNotes = () => {
    const lines = [`# ${t`Verification: ${stage}`} · ${new Date().toISOString().slice(0, 10)}`, ""]
    for (const state of states) {
      const stateKey = `${page}:${state.id}`
      const mark = record.verdicts[stateKey] === "ok" ? "✅" : record.verdicts[stateKey] === "issue" ? "⚠️" : "·"
      const text = record.notes[stateKey]?.trim()
      const entry = VERIFY_LOG[stateKey]
      const picked = (entry?.variants ?? [])
        .map((variantKey) => {
          const group = VARIANT_GROUPS.find((candidate) => candidate.key === variantKey)
          const option = group?.options.find((candidate) => candidate.value === variants[variantKey])
          return group && option ? `${i18n._(group.label)}: **${i18n._(option.label)}**` : null
        })
        .filter(Boolean)
      const pickedText = picked.length ? ` · ${t`selected`} ${picked.join(", ")}` : ""
      const status = entry ? ` · _${entry.status === "fixed" ? t`fixed, re-check` : entry.status === "review" ? t`variants to pick` : entry.status === "pending" ? t`pending` : t`pinned`}_` : ""
      lines.push(`- ${mark} **${state.label}** (\`${state.id}\`)${status}${pickedText}${text ? ` — ${text}` : ""}`)
    }
    copy(lines.join("\n"))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-2">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-white/45 uppercase">
            {current ? t`${stage} · ${index + 1} of ${states.length}` : t`${stage} · ${states.length} states`}
          </span>
          <span className="truncate text-[14px] font-semibold">{current ? current.label : t`Real data`}</span>
          {current && <span className="text-[11px] text-white/45">{stageStates.kinds[current.kind] ?? current.kind}</span>}
        </div>
        <button
          type="button"
          aria-label={t`Previous state`}
          title={t`Previous state`}
          disabled={!hasPrev}
          onClick={() => step(-1)}
          className="grid size-8 place-items-center rounded-lg text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white disabled:opacity-30"
        >
          <ArrowLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={!hasNext}
          className="flex h-8 items-center gap-1 rounded-lg bg-white px-2.5 text-[12px] font-semibold text-zinc-900 transition-transform duration-150 active:scale-[0.97] disabled:opacity-30"
        >
          {index < 0 ? t`Start` : t`Next`}
          <ArrowRight className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 rounded-xl bg-white/5 p-1">
        {(
          [
            ["all", t`All states`],
            ["recheck", t`To re-check (${recheckCount})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "h-7 flex-1 rounded-lg text-[12px] font-semibold transition-[background-color,color] duration-150",
              filter === value ? "bg-white text-zinc-900" : "text-white/65 hover:bg-white/10 hover:text-white",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {log && (
        <div className={cn("flex gap-2 rounded-xl px-2.5 py-2 animate-in fade-in duration-200 motion-reduce:animate-none", LOG_STYLE[log.status].box)}>
          {log.status === "fixed" ? <Wrench className="mt-0.5 size-3.5 shrink-0 text-sky-300" /> : log.status === "review" ? <SlidersHorizontal className="mt-0.5 size-3.5 shrink-0 text-sky-300" /> : log.status === "pending" ? <Hourglass className="mt-0.5 size-3.5 shrink-0 text-white/55" /> : <Pin className="mt-0.5 size-3.5 shrink-0 text-white/45" />}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={cn("text-[11px] font-semibold tracking-[0.06em] uppercase", LOG_STYLE[log.status].text)}>
              {log.status === "fixed" ? t`Fixed · check again` : log.status === "review" ? t`Changed · try the options` : log.status === "pending" ? t`Pending · ${log.group ? i18n._(log.group) : ""}` : t`Pinned`}
            </span>
            <span className="text-[12px] leading-snug text-white/80">{i18n._(log.text)}</span>
            {log.variants?.map((variantKey: VariantKey) => {
              const group = VARIANT_GROUPS.find((candidate) => candidate.key === variantKey)
              if (!group) return null
              return (
                <span key={variantKey} className="mt-1.5 flex flex-col gap-1">
                  <span className="text-[10px] font-semibold tracking-[0.08em] text-white/45 uppercase">{i18n._(group.label)}</span>
                  <span className="flex flex-wrap gap-1">
                    {group.options.map((option) => {
                      const on = variants[variantKey] === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          title={i18n._(option.hint)}
                          aria-pressed={on}
                          onClick={() => setVariantValue(variantKey, option.value)}
                          className={cn(
                            "h-7 rounded-full px-2.5 text-[12px] font-semibold transition-[background-color,color] duration-150",
                            on ? "bg-white text-zinc-900" : "bg-white/5 text-white/75 hover:bg-white/10 hover:text-white",
                          )}
                        >
                          {i18n._(option.label)}
                        </button>
                      )
                    })}
                  </span>
                </span>
              )
            })}
          </span>
        </div>
      )}

      {current && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-white/5 p-1.5 animate-in fade-in duration-200 motion-reduce:animate-none">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              aria-pressed={verdict === "ok"}
              onClick={() => judge(verdict === "ok" && !needsRecheck(current.id) ? null : "ok")}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-[background-color,color] duration-150",
                verdict === "ok" ? "bg-emerald-500 text-white" : "bg-white/5 text-white/80 hover:bg-white/10",
              )}
            >
              <Check className="size-3.5" />
              {t`Looks good`}
            </button>
            <button
              type="button"
              aria-pressed={verdict === "issue"}
              onClick={() => judge(verdict === "issue" && !needsRecheck(current.id) ? null : "issue")}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-[background-color,color] duration-150",
                verdict === "issue" ? "bg-amber-400 text-zinc-900" : "bg-white/5 text-white/80 hover:bg-white/10",
              )}
            >
              <PenLine className="size-3.5" />
              {t`Needs work`}
            </button>
          </div>
          <textarea
            value={note}
            onChange={(event) => setRecord((prev) => ({ ...prev, notes: { ...prev.notes, [key]: event.target.value } }))}
            rows={2}
            placeholder={t`What's wrong or worth changing? (optional)`}
            className="w-full resize-none rounded-lg bg-white/5 px-2.5 py-2 text-[12px] leading-relaxed text-white outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-white/35 focus:bg-white/10 focus:ring-1 focus:ring-white/25"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-1 rounded-xl bg-white/5 p-1.5">
        {states.map((state, position) => {
          const stateVerdict = record.verdicts[`${page}:${state.id}`]
          const stateLog = VERIFY_LOG[`${page}:${state.id}`]
          const recheck = needsRecheck(state.id)
          return (
            <button
              key={state.id}
              type="button"
              title={state.label}
              aria-label={state.label}
              aria-current={position === index || undefined}
              onClick={() => open(position)}
              className={cn(
                "h-2.5 min-w-2.5 flex-1 rounded-full transition-[background-color,box-shadow] duration-150",
                recheck ? "bg-sky-400" : stateVerdict === "ok" ? "bg-emerald-500" : stateVerdict === "issue" ? "bg-amber-400" : "bg-white/15 hover:bg-white/30",
                stateLog?.status === "pinned" && "opacity-40",
                filter === "recheck" && !recheck && position !== index && "opacity-25",
                position === index && "ring-2 ring-white ring-offset-1 ring-offset-zinc-900",
              )}
            />
          )
        })}
      </div>

      <div className="flex items-center gap-1 px-1">
        <span className="flex flex-1 flex-col text-[11px] leading-tight text-white/50 tabular-nums">
          <span>{t`${reviewed} of ${states.length} checked · ${issues} need work`}</span>
          {(fixedCount > 0 || pendingCount > 0) && <span className="text-white/40">{t`${fixedCount} changed · ${pendingCount} pending`}</span>}
        </span>
        {current && (
          <button
            type="button"
            onClick={() => {
              clearStageState()
              window.location.reload()
            }}
            className="flex h-7 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium text-white/65 transition-colors duration-150 hover:bg-white/10 hover:text-white"
          >
            <X className="size-3" />
            {t`Real data`}
          </button>
        )}
        <button
          type="button"
          onClick={exportNotes}
          className="flex h-7 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium text-white/65 transition-colors duration-150 hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? t`Copied` : t`Copy notes`}
        </button>
        {reviewed > 0 && (
          <button
            type="button"
            aria-label={t`Clear this stage's results`}
            title={t`Clear this stage's results`}
            onClick={() =>
              setRecord((prev) => {
                const verdicts = { ...prev.verdicts }
                const notes = { ...prev.notes }
                for (const state of states) {
                  delete verdicts[`${page}:${state.id}`]
                  delete notes[`${page}:${state.id}`]
                }
                const rechecked = { ...prev.rechecked }
                for (const state of states) delete rechecked[`${page}:${state.id}`]
                return { verdicts, notes, rechecked }
              })
            }
            className="grid size-7 place-items-center rounded-full text-white/50 transition-colors duration-150 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="size-3" />
          </button>
        )}
      </div>
    </div>
  )
}
