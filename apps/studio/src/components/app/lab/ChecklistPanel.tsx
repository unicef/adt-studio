import { useState } from "react"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { useLingui } from "@lingui/react/macro"
import { Check, ChevronRight, X } from "lucide-react"
import { createPersistentStore } from "@/hooks/create-persistent-store"
import { cn } from "@/lib/utils"
import { applyStageState, clearStageState, type StageState, type StageStates } from "./stageStates"

interface RouteStage {
  pages: string[]
  label: MessageDescriptor
}

const ROUTE: RouteStage[] = [
  { pages: ["extract"], label: msg`1. Extract` },
  { pages: ["sectioning"], label: msg`2. Sectioning` },
  { pages: ["storyboard"], label: msg`3. Storyboard` },
  { pages: ["captions"], label: msg`4. Image descriptions` },
  { pages: ["toc"], label: msg`5. Table of contents` },
  { pages: ["easy-read"], label: msg`6. Easy Read` },
  { pages: ["sign-language"], label: msg`7. Sign language` },
  { pages: ["quizzes", "quizzes-settings"], label: msg`8. Quizzes` },
  { pages: ["glossary"], label: msg`9. Glossary` },
  { pages: ["translate"], label: msg`10. Languages` },
  { pages: ["speech"], label: msg`11. Read aloud` },
  { pages: ["validation"], label: msg`12. Validation` },
  { pages: ["preview"], label: msg`Preview` },
  { pages: ["export"], label: msg`Export` },
]

export const checkedStore = createPersistentStore<Record<string, boolean>>(
  "adt.lab.checklist",
  {},
  (value): value is Record<string, boolean> => typeof value === "object" && value !== null && !Array.isArray(value),
)

const rowClassName = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors duration-150 hover:bg-white/10"

function StateRow({ page, state, kind, here }: { page: string; state: StageState; kind: string; here: boolean }) {
  const { t } = useLingui()
  const [checked, setChecked] = checkedStore.use()
  const key = `${page}:${state.id}`
  const done = !!checked[key]
  return (
    <li className="flex items-center gap-1.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={t`Validated: ${state.label}`}
        onClick={() => setChecked((current) => ({ ...current, [key]: !done }))}
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-[5px] ring-1 transition-colors duration-150",
          done ? "bg-emerald-500 text-white ring-emerald-500" : "ring-white/30 hover:ring-white/60",
        )}
      >
        {done && <Check className="size-3" strokeWidth={3} />}
      </button>
      <button type="button" onClick={() => applyStageState(page, state)} className={cn(rowClassName, here ? "bg-white/15 text-white" : "text-white/75", done && "text-white/45 line-through")}>
        <span className="min-w-0 flex-1 truncate">{state.label}</span>
        <span className="shrink-0 text-[10.5px] text-white/40">{kind}</span>
      </button>
    </li>
  )
}

export function ChecklistPanel({ stageStates, active }: { stageStates: StageStates | null; active: { page: string; id: string } | null }) {
  const { t, i18n } = useLingui()
  const [checked] = checkedStore.use()
  const [openKey, setOpenKey] = useState<string | null>(active?.page ?? "extract")

  if (!stageStates) return <p className="px-2 py-1 text-[11.5px] text-white/55">{t`The checklist needs the local lab canvas files (lab/canvas).`}</p>

  const activeState = active ? stageStates.byPage[active.page]?.find((state) => state.id === active.id) : undefined

  return (
    <div className="flex flex-col gap-1.5">
    {activeState && (
      <div className="flex items-center gap-2 rounded-xl bg-white/10 py-1.5 pr-1.5 pl-3 text-[12px] animate-in fade-in duration-200 motion-reduce:animate-none">
        <span className="min-w-0 flex-1 truncate text-white/75">{t`Showing: ${activeState.label}`}</span>
        <button
          type="button"
          onClick={() => {
            clearStageState()
            window.location.reload()
          }}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1 font-semibold text-zinc-900 transition-[transform,background-color] duration-150 hover:bg-white/90 active:scale-[0.97]"
        >
          <X className="size-3" />
          {t`Back to real data`}
        </button>
      </div>
    )}
    <ul className="flex max-h-[58vh] flex-col gap-0.5 overflow-y-auto rounded-xl bg-white/5 p-1">
      {ROUTE.map((stage) => {
        const states = stage.pages.flatMap((page) => (stageStates.byPage[page] ?? []).map((state) => ({ page, state })))
        const name = i18n._(stage.label)
        const key = stage.pages[0]
        const total = states.length
        const done = states.filter(({ page, state }) => checked[`${page}:${state.id}`]).length
        const open = openKey === key
        if (total === 0)
          return (
            <li key={key} className="flex items-center gap-2 px-2 py-1.5 text-[12px]">
              <span className="font-semibold text-white/70">{name}</span>
              <span className="ml-auto rounded-full bg-amber-400/15 px-2 py-0.5 text-[10.5px] font-medium text-amber-300">{t`No states yet · discuss later`}</span>
            </li>
          )
        return (
          <li key={key}>
            <button type="button" aria-expanded={open} onClick={() => setOpenKey(open ? null : key)} className={cn(rowClassName, "font-semibold text-white")}>
              <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 text-white/50 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-90")} />
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <span className={cn("shrink-0 text-[11px] tabular-nums", done === total ? "text-emerald-400" : "text-white/45")}>
                {done}/{total}
              </span>
            </button>
            {open && (
              <ul className="flex flex-col gap-0.5 pt-0.5 pb-1.5 pl-5 animate-in fade-in duration-200 motion-reduce:animate-none">
                {states.map(({ page, state }) => (
                  <StateRow
                    key={`${page}:${state.id}`}
                    page={page}
                    state={state}
                    kind={stageStates.kinds[state.kind] ?? state.kind}
                    here={active?.page === page && active.id === state.id}
                  />
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
    </div>
  )
}
