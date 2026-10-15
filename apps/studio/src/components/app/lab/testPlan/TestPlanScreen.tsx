import { Fragment, Suspense, lazy, useState, type ComponentType } from "react"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Check, ClipboardCopy, FlaskConical, Play, Sparkles, Square, Wand2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { TIERS, VARIANT_GROUPS, useVariants, type VariantTier } from "../variants"
import { startScenario, stopScenario, useScenario } from "../simulate"
import {
  NEITHER,
  applyPicks,
  resultsMarkdown,
  setActiveTest,
  setNote,
  setPick,
  setUpTest,
  testStatus,
  toggleCheck,
  useLabResults,
} from "./results"
import { COMBINED_STEPS, LAB_TESTS, ORDERED_TESTS, TEST_BOOKS, testSection, type LabTest } from "./tests"
import { applyState, clearActiveState, statesFor, useActiveState } from "./states"
import { GUIDE_ROUNDS, startGuide, useGuide } from "./guide"


const COMBINED = "combined"

function SectionHeader({ section }: { section: VariantTier | "values" }) {
  const { i18n } = useLingui()
  const tier = TIERS.find((candidate) => candidate.key === section)
  return (
    <div className="px-2.5 pb-1.5 pt-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground">
        {tier ? i18n._(tier.label) : <Trans>Your values · flow v2</Trans>}
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {tier ? i18n._(tier.hint) : <Trans>Everything recommended, together — test these after the individual variants.</Trans>}
      </p>
    </div>
  )
}

function GuideStart({ onOpen }: { onOpen: (path: string) => void }) {
  const { i18n } = useLingui()
  const [results] = useLabResults()
  const [guide] = useGuide()
  return (
    <div className="mx-1 mb-2 rounded-xl border border-brand-200 bg-brand-50/60 p-2.5 dark:border-brand-500/30 dark:bg-brand-500/10">
      <div className="px-1 text-[12.5px] font-semibold">
        <Trans>Guided testing</Trans>
      </div>
      <p className="px-1 pb-2 pt-0.5 text-[11px] leading-snug text-muted-foreground">
        <Trans>One test at a time in a floating card: the variant, its states, what to check, your pick and a note.</Trans>
      </p>
      <div className="flex flex-col gap-1">
        {GUIDE_ROUNDS.map((round, index) => {
          const tests = LAB_TESTS.filter((test) => round.tests.includes(test.id))
          const done = tests.filter((test) => testStatus(test, results) === "done").length
          const current = guide?.round === index
          return (
            <button
              key={round.key}
              type="button"
              title={i18n._(round.goal)}
              onClick={() => startGuide(index, onOpen, current && guide ? guide.index : 0)}
              className={cn(
                "flex items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 text-left text-[12px] transition-colors duration-150 hover:bg-muted",
                current && "ring-1 ring-brand-400",
              )}
            >
              <Play className="size-3 shrink-0 text-brand-600" />
              <span className="flex-1 font-medium">{i18n._(round.label)}</span>
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {done}/{round.tests.length}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: "untested" | "started" | "done" }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full transition-colors duration-200",
        status === "done" ? "bg-emerald-500" : status === "started" ? "bg-amber-400" : "bg-muted-foreground/25",
      )}
    />
  )
}

function Checklist({ id, items }: { id: string; items: { message: string }[] }) {
  const [results] = useLabResults()
  const checked = new Set(results.checks[id] ?? [])
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map((item, index) => {
        const on = checked.has(index)
        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => toggleCheck(id, index)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] leading-relaxed transition-colors duration-150",
                on ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30" : "hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors duration-150",
                  on ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
                )}
              >
                <Check className={cn("size-3 transition-transform duration-150", on ? "scale-100" : "scale-0")} strokeWidth={3} />
              </span>
              <span className={cn(on && "text-muted-foreground")}>
                <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">{index + 1}.</span>
                {item.message}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function StatesSection({ test, onOpenState }: { test: LabTest; onOpenState: (stateId: string) => void }) {
  const { i18n } = useLingui()
  const [active] = useActiveState()
  const states = statesFor(test)
  if (states.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        <Trans>States</Trans>
      </h2>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        <Trans>Each state opens the app frozen at that moment. Switch variants in the toolbar to compare the same state; use the state bar (bottom left) or the [ and ] keys to move between states, play/pause, and light/dark.</Trans>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {states.map((state, index) => {
          const current = active?.testId === test.id && active.stateId === state.id
          return (
            <button
              key={state.id}
              type="button"
              onClick={() => onOpenState(state.id)}
              className={cn(
                "group flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color] duration-150",
                current ? "border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10" : "hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "mt-px grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold transition-colors duration-150",
                  current ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground group-hover:bg-brand-600 group-hover:text-white",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{i18n._(state.label)}</span>
                {state.hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{i18n._(state.hint)}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function TestDetail({ test, onSetUp, onOpenState }: { test: LabTest; onSetUp: () => void; onOpenState: (stateId: string) => void }) {
  const { t, i18n } = useLingui()
  const [results] = useLabResults()
  const group = VARIANT_GROUPS.find((candidate) => candidate.key === test.group)
  const pick = results.picks[test.group]
  const simLabel =
    test.sim?.kind === "run"
      ? t`simulated ${test.sim.stage} run`
      : test.sim?.kind === "slow-load"
        ? t`simulated slow load`
        : null

  return (
    <div key={test.id} className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
          {(() => {
            const tier = TIERS.find((candidate) => candidate.key === testSection(test))
            const groupLabel = group ? i18n._(group.label) : test.group
            return tier ? `${i18n._(tier.label)} · ${groupLabel}` : groupLabel
          })()}
        </span>
        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em]">{i18n._(test.title)}</h1>
        <p className="max-w-[62ch] text-[14px] leading-relaxed text-muted-foreground">{i18n._(test.changes)}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {Object.entries(test.variants).map(([key, value]) => {
            const g = VARIANT_GROUPS.find((candidate) => candidate.key === key)
            const option = g?.options.find((candidate) => candidate.value === value)
            return (
              <span key={key} className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 font-medium text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
                {g ? i18n._(g.label) : key}: {option ? i18n._(option.label) : value}
              </span>
            )
          })}
          <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
            <Trans>everything else on Current</Trans>
          </span>
          <span className="rounded-full border px-2 py-0.5 font-mono text-muted-foreground">{test.path.split("?")[0]}</span>
          {simLabel && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              {simLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSetUp}
          className="mt-1 flex w-fit items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-brand-700 active:scale-[0.98]"
        >
          <Play className="size-4" />
          {statesFor(test).length > 0 ? <Trans>Set up and open state 1</Trans> : test.reload ? <Trans>Set up and reload</Trans> : <Trans>Set up and open</Trans>}
        </button>
      </div>

      <StatesSection test={test} onOpenState={onOpenState} />

      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <Trans>Steps</Trans>
        </h2>
        <Checklist id={test.id} items={test.steps.map((step) => ({ message: i18n._(step) }))} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <Trans>Look for</Trans>
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] leading-relaxed">
            {test.lookFor.map((item, index) => (
              <li key={index}>{i18n._(item)}</li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <Trans>Compare</Trans>
          </h2>
          <p className="text-[13px] leading-relaxed">{i18n._(test.compare)}</p>
        </section>
      </div>

      {group && !test.noPick && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <Trans>Your pick for {i18n._(group.label)}</Trans>
          </h2>
          <div role="radiogroup" className="flex flex-wrap gap-1.5">
            {[...group.options.map((option) => ({ value: option.value, label: i18n._(option.label) })), { value: NEITHER, label: t`Neither` }].map(
              (option) => {
                const selected = pick === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPick(test.group, option.value)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150",
                      selected ? "border-brand-600 bg-brand-600 text-white" : "hover:bg-muted",
                    )}
                  >
                    {option.label}
                  </button>
                )
              },
            )}
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            <Trans>Shared by every test in this group.</Trans>
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2 pb-16">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <Trans>Notes</Trans>
        </h2>
        <textarea
          value={results.notes[test.id] ?? ""}
          onChange={(event) => setNote(test.id, event.target.value)}
          placeholder={t`What worked, what didn't, what you'd change…`}
          rows={5}
          className="w-full rounded-xl border bg-card px-3.5 py-3 text-[13px] leading-relaxed outline-none transition-[border-color,box-shadow] focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--brand-50)]"
        />
      </section>
    </div>
  )
}

function CombinedDetail({ onOpen }: { onOpen: (path: string) => void }) {
  const { t, i18n } = useLingui()
  const [results] = useLabResults()
  const picked = VARIANT_GROUPS.filter((group) => results.picks[group.key] && results.picks[group.key] !== NEITHER)
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
          <Trans>Combined pass</Trans>
        </span>
        <h1 className="text-[22px] font-bold leading-tight">
          <Trans>Your picks, together, as a regular user</Trans>
        </h1>
        <p className="max-w-[62ch] text-[14px] leading-relaxed text-muted-foreground">
          <Trans>Applies every pick at once (Neither and unpicked groups stay on Current), then walks the whole journey.</Trans>
        </p>
        <div className="flex flex-wrap gap-1.5 text-[11.5px]">
          {picked.length === 0 ? (
            <span className="text-muted-foreground">
              <Trans>No picks yet — finish some solo tests first.</Trans>
            </span>
          ) : (
            picked.map((group) => {
              const option = group.options.find((candidate) => candidate.value === results.picks[group.key])
              return (
                <span key={group.key} className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 font-medium text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
                  {i18n._(group.label)}: {option ? i18n._(option.label) : ""}
                </span>
              )
            })
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              applyPicks()
              setActiveTest(COMBINED)
              onOpen(`/pipeline/${TEST_BOOKS.fresh}`)
            }}
            className="flex w-fit items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-brand-700 active:scale-[0.98]"
          >
            <Wand2 className="size-4" />
            <Trans>Apply my picks and open the pipeline</Trans>
          </button>
          <button
            type="button"
            onClick={() => {
              startScenario({ kind: "run", book: TEST_BOOKS.fresh, stage: "sectioning", step: "page-sectioning", durationMs: 20000, total: 12, startedAt: Date.now() })
              onOpen(`/pipeline/${TEST_BOOKS.fresh}/sectioning`)
            }}
            className="flex w-fit items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition-colors duration-150 hover:bg-muted"
          >
            <Sparkles className="size-4" />
            <Trans>Start a simulated sectioning run (20s)</Trans>
          </button>
        </div>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <Trans>Journey</Trans>
        </h2>
        <Checklist id={COMBINED} items={COMBINED_STEPS.map((step) => ({ message: i18n._(step) }))} />
      </section>
      <section className="flex flex-col gap-2 pb-16">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <Trans>Notes</Trans>
        </h2>
        <textarea
          value={results.notes[COMBINED] ?? ""}
          onChange={(event) => setNote(COMBINED, event.target.value)}
          placeholder={t`Does it hold together as one flow?`}
          rows={6}
          className="w-full rounded-xl border bg-card px-3.5 py-3 text-[13px] leading-relaxed outline-none transition-[border-color,box-shadow] focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--brand-50)]"
        />
      </section>
    </div>
  )
}

const canvasModules = import.meta.glob<{ CanvasView: ComponentType }>("../canvas/CanvasView.tsx") // eslint-disable-line lingui/no-unlocalized-strings -- module path for the optional local-only canvas
const loadCanvas = canvasModules["../canvas/CanvasView.tsx"]
const LazyCanvas = loadCanvas ? lazy(() => loadCanvas().then((module) => ({ default: module.CanvasView }))) : null

export function TestPlanScreen() {
  const canvas = useRouterState({ select: (state) => new URLSearchParams(state.location.searchStr).get("view") === "canvas" })
  if (canvas && LazyCanvas) {
    return (
      <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground"><Trans>Loading the canvas…</Trans></div>}>
        <LazyCanvas />
      </Suspense>
    )
  }
  return <TestPlanMain />
}

function TestPlanMain() {
  const { t, i18n } = useLingui()
  const router = useRouter()
  const [results] = useLabResults()
  const [scenario] = useScenario()
  useVariants()
  const [selected, setSelected] = useState<string>(results.activeTest ?? ORDERED_TESTS[0].id)
  const [copied, setCopied] = useState(false)
  const open = (path: string) => router.history.push(path)
  const doneCount = LAB_TESTS.filter((test) => testStatus(test, results) === "done").length
  const test = LAB_TESTS.find((candidate) => candidate.id === selected)

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <header className="drag-region flex h-13 shrink-0 items-center gap-3 border-b px-4">
        <button
          type="button"
          onClick={() => open("/")}
          className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <Trans>App</Trans>
        </button>
        <div className="h-5 w-px bg-border" />
        <FlaskConical className="size-4 text-brand-600" />
        <span className="text-[14px] font-semibold">
          <Trans>Variant test plan</Trans>
        </span>
        <span className="text-[12px] text-muted-foreground">{t`${doneCount} of ${LAB_TESTS.length} done`}</span>
        <div className="flex-1" />
        {LazyCanvas && (
          <button
            type="button"
            onClick={() => open("/lab?view=canvas")}
            className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors hover:bg-muted"
          >
            <Trans>Canvas</Trans>
          </button>
        )}
        {scenario && (
          <button
            type="button"
            onClick={stopScenario}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-[12.5px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
          >
            <Square className="size-3" />
            <Trans>Stop simulation</Trans>
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(resultsMarkdown(results, i18n))
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors hover:bg-muted"
        >
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <ClipboardCopy className="size-3.5" />}
          {copied ? <Trans>Copied</Trans> : <Trans>Copy results</Trans>}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r">
          <ScrollArea className="min-h-0 flex-1">
            <nav className="flex flex-col gap-0.5 p-2.5">
              <GuideStart onOpen={open} />
              <p className="px-2.5 pb-2 pt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                <Trans>Each test changes one thing; everything else stays on Current. Use the lab books — "[Lab] Hyena and Raven" (extract only) and "[Lab] Triste fim…" (fully processed).</Trans>
              </p>
              {ORDERED_TESTS.map((candidate, index) => (
                <Fragment key={candidate.id}>
                {(index === 0 || testSection(candidate) !== testSection(ORDERED_TESTS[index - 1])) && (
                  <SectionHeader section={testSection(candidate)} />
                )}
                <button
                  type="button"
                  onClick={() => setSelected(candidate.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors duration-150",
                    selected === candidate.id ? "bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200" : "hover:bg-muted",
                  )}
                >
                  <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate">{i18n._(candidate.title)}</span>
                  <StatusDot status={testStatus(candidate, results)} />
                </button>
                </Fragment>
              ))}
              <div className="my-2 h-px bg-border" />
              <button
                type="button"
                onClick={() => setSelected(COMBINED)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors duration-150",
                  selected === COMBINED ? "bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200" : "hover:bg-muted",
                )}
              >
                <Wand2 className="size-4 shrink-0 text-brand-600" />
                <span className="flex-1">
                  <Trans>Combined pass</Trans>
                </span>
              </button>
            </nav>
          </ScrollArea>
        </aside>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-[860px] px-10 py-8">
            {test ? (
              <TestDetail
                test={test}
                onSetUp={() => {
                  const first = statesFor(test)[0]
                  if (first) applyState(test, first, open, true)
                  else {
                    clearActiveState()
                    setUpTest(test, open)
                  }
                }}
                onOpenState={(stateId) => {
                  const state = statesFor(test).find((candidate) => candidate.id === stateId)
                  if (state) applyState(test, state, open)
                }}
              />
            ) : (
              <CombinedDetail onOpen={open} />
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
