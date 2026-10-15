import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardCopy, Moon, Pause, Play, Sun, X } from "lucide-react"
import { readThemeMode, resolvesToDark, setThemeMode } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { VARIANT_GROUPS, setVariantValue, useVariants } from "./variants"
import { isPaused, pauseScenario, resumeScenario, scenarioElapsed, useScenario } from "./simulate"
import { NEITHER, resultsMarkdown, setNote, setPick, toggleCheck, useLabResults } from "./testPlan/results"
import { applyState, statesFor, stepState, useActiveState } from "./testPlan/states"
import type { LabTest } from "./testPlan/tests"
import { GUIDE_ROUNDS, exitGuide, guideTest, guideTotals, setGuideCollapsed, stepGuide, useGuide } from "./testPlan/guide"

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function GuideBar() {
  const { t, i18n } = useLingui()
  const router = useRouter()
  const navigate = (path: string) => router.history.push(path)
  const [position] = useGuide()
  const [results] = useLabResults()
  const [active] = useActiveState()
  const [scenario] = useScenario()
  const variants = useVariants()
  const [dark, setDark] = useState(() => resolvesToDark(readThemeMode()))
  const [copied, setCopied] = useState(false)
  const [, setTick] = useState(0)

  const test = guideTest(position)
  const round = position ? GUIDE_ROUNDS[position.round] : undefined
  const states = statesFor(test)
  const stateIndex = states.findIndex((state) => active?.testId === test?.id && state.id === active?.stateId)
  const state = states[stateIndex]
  const timed = !!scenario && scenario.kind !== "slow-load"
  const paused = isPaused(scenario)
  const elapsed = scenarioElapsed(scenario)
  const usingPicks = !!test && !!round?.usePicks?.includes(test.id)
  const group = test ? VARIANT_GROUPS.find((candidate) => candidate.key === test.group) : undefined

  useEffect(() => {
    if (!timed || paused) return
    const id = window.setInterval(() => setTick((value) => value + 1), 500)
    return () => window.clearInterval(id)
  }, [timed, paused])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === "[") stepState(-1, (path) => router.history.push(path))
      else if (event.key === "]") stepState(1, (path) => router.history.push(path))
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router])

  if (!position || !test || !round) return null

  const { overall, total } = guideTotals(position)
  const isLast = overall === total
  const pick = results.picks[test.group]
  const toggleTheme = () => {
    const next = !dark
    setThemeMode(next ? "dark" : "light")
    setDark(next)
  }

  if (position.collapsed) {
    return (
      <div
        data-lab-toolbar
        className="fixed bottom-3 left-3 z-[70] flex items-center gap-1 rounded-full border border-border bg-card/95 p-1 text-[12.5px] shadow-2xl backdrop-blur-xl transition-[bottom] duration-300 animate-in fade-in [body:has([data-pipeline-dock=shown])_&]:bottom-[92px]"
      >
        <button
          type="button"
          onClick={() => setGuideCollapsed(false)}
          className="flex h-7 items-center gap-2 rounded-full pl-2.5 pr-2 transition-colors hover:bg-muted"
        >
          <span className="font-mono text-[10.5px] text-muted-foreground">
            {overall}/{total}
          </span>
          <span className="max-w-[240px] truncate font-semibold">{i18n._(test.title)}</span>
          <ChevronUp className="size-3.5 text-muted-foreground" />
        </button>
        <GuideIcon label={t`Next test`} disabled={isLast} onClick={() => stepGuide(1, navigate)}>
          <ChevronRight className="size-4" />
        </GuideIcon>
      </div>
    )
  }

  return (
    <div
      data-lab-toolbar
      role="dialog"
      aria-label={t`Guided testing`}
      className="fixed bottom-3 left-3 z-[70] flex max-h-[calc(100vh-24px)] w-[400px] flex-col overflow-hidden rounded-2xl border border-border bg-card/97 text-[12.5px] shadow-2xl backdrop-blur-xl transition-[bottom] duration-300 animate-in fade-in slide-in-from-bottom-2 [body:has([data-pipeline-dock=shown])_&]:bottom-[92px] [body:has([data-pipeline-dock=shown])_&]:max-h-[calc(100vh-104px)]"
    >
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brand-600">{i18n._(round.label)}</span>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          · {position.index + 1}/{round.tests.length}
        </span>
        <div className="flex-1" />
        <GuideIcon label={t`Previous test`} disabled={overall === 1} onClick={() => stepGuide(-1, navigate)}>
          <ChevronLeft className="size-4" />
        </GuideIcon>
        <GuideIcon label={t`Next test`} disabled={isLast} onClick={() => stepGuide(1, navigate)}>
          <ChevronRight className="size-4" />
        </GuideIcon>
        <GuideIcon label={t`Collapse`} onClick={() => setGuideCollapsed(true)}>
          <ChevronDown className="size-4" />
        </GuideIcon>
        <GuideIcon label={t`Exit guided testing`} onClick={exitGuide}>
          <X className="size-3.5" />
        </GuideIcon>
      </div>
      <div className="h-0.5 bg-muted">
        <div className="h-full bg-brand-600 transition-[width] duration-500 ease-out" style={{ width: `${(overall / total) * 100}%` }} />
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3.5 py-3">
        <div>
          <div className="text-[14px] font-semibold leading-snug">{i18n._(test.title)}</div>
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{i18n._(test.changes)}</p>
        </div>

        {usingPicks ? (
          <div className="rounded-xl bg-muted/60 px-2.5 py-2 text-[11.5px] text-muted-foreground">
            <Trans>Your picks from rounds 1–3 are applied. Switch any group in the full toolbar after exiting.</Trans>
          </div>
        ) : (
          group && (
            <Row label={i18n._(group.label)}>
              <div role="radiogroup" aria-label={i18n._(group.label)} className="flex flex-wrap gap-1">
                {group.options.map((option) => {
                  const selected = variants[test.group] === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      title={i18n._(option.hint)}
                      onClick={() => setVariantValue(test.group, option.value)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-150",
                        selected ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                      )}
                    >
                      {i18n._(option.label)}
                    </button>
                  )
                })}
              </div>
            </Row>
          )
        )}

        {states.length > 0 && (
          <Row label={t`State`}>
            <div className="flex items-center gap-0.5">
              <GuideIcon label={t`Previous state ([)`} disabled={stateIndex <= 0} onClick={() => stepState(-1, navigate)}>
                <ChevronLeft className="size-4" />
              </GuideIcon>
              <div className="min-w-0 flex-1 px-1">
                <div className="truncate font-semibold">
                  <span className="mr-1.5 font-mono text-[10.5px] font-medium text-muted-foreground">
                    {stateIndex + 1}/{states.length}
                  </span>
                  {state ? i18n._(state.label) : "—"}
                </div>
                {state?.hint && <div className="truncate text-[11px] text-muted-foreground">{i18n._(state.hint)}</div>}
              </div>
              <GuideIcon label={t`Next state (])`} disabled={stateIndex >= states.length - 1} onClick={() => stepState(1, navigate)}>
                <ChevronRight className="size-4" />
              </GuideIcon>
              {timed && (
                <>
                  <GuideIcon label={paused ? t`Play` : t`Pause`} onClick={paused ? resumeScenario : pauseScenario}>
                    {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                  </GuideIcon>
                  {elapsed !== null && (
                    <span className={cn("w-8 font-mono text-[10.5px] tabular-nums", paused ? "text-muted-foreground" : "text-brand-600")}>
                      {formatClock(elapsed)}
                    </span>
                  )}
                </>
              )}
              <GuideIcon label={dark ? t`Light mode` : t`Dark mode`} onClick={toggleTheme}>
                {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
              </GuideIcon>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {states.map((candidate, index) => (
                <button
                  key={candidate.id}
                  type="button"
                  title={i18n._(candidate.label)}
                  onClick={() => applyState(test, candidate, navigate)}
                  className={cn(
                    "grid size-6 place-items-center rounded-full font-mono text-[10.5px] font-semibold transition-colors duration-150",
                    index === stateIndex ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted-foreground/20",
                  )}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </Row>
        )}

        <Checks key={test.id} test={test} pick={pick} group={group} />
      </div>

      <div className="flex items-center gap-2 border-t px-3 py-2.5">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(resultsMarkdown(results, i18n))
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-3.5 text-emerald-600" /> : <ClipboardCopy className="size-3.5" />}
          {copied ? <Trans>Copied</Trans> : <Trans>Copy results</Trans>}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={isLast}
          onClick={() => stepGuide(1, navigate)}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[12.5px] font-semibold text-white transition-[background-color,transform,opacity] duration-150 hover:bg-brand-700 active:scale-[0.97] disabled:opacity-40"
        >
          {position.index === round.tests.length - 1 && !isLast ? <Trans>Next round</Trans> : <Trans>Next test</Trans>}
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

function GuideIcon({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-90 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}

function Checks({
  test,
  pick,
  group,
}: {
  test: LabTest
  pick: string | undefined
  group: (typeof VARIANT_GROUPS)[number] | undefined
}) {
  const { t, i18n } = useLingui()
  const [results] = useLabResults()
  const checked = new Set(results.checks[test.id] ?? [])
  const firstOpen = test.steps.findIndex((_, index) => !checked.has(index))
  const [phase, setPhase] = useState(firstOpen === -1 ? test.steps.length : firstOpen)
  const deciding = phase >= test.steps.length
  const total = test.steps.length + 1

  const markAndNext = () => {
    if (!checked.has(phase)) toggleCheck(test.id, phase)
    setPhase((value) => value + 1)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <button
            key={index}
            type="button"
            tabIndex={-1}
            onClick={() => setPhase(index)}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-200",
              index === phase ? "bg-brand-600" : index < test.steps.length && checked.has(index) ? "bg-emerald-500" : "bg-muted",
            )}
          />
        ))}
      </div>

      <div key={phase} className="animate-in fade-in slide-in-from-right-1 duration-200">
        {deciding ? (
          <div className="flex flex-col gap-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <Trans>Decide</Trans>
            </div>
            {test.lookFor.length > 0 && (
              <ul className="flex flex-col gap-1 text-[12px] leading-snug">
                {test.lookFor.map((item, index) => (
                  <li key={index} className="flex gap-1.5">
                    <span className="text-muted-foreground">·</span>
                    {i18n._(item)}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11.5px] leading-snug text-muted-foreground">{i18n._(test.compare)}</p>
            {group && !test.noPick && (
              <div role="radiogroup" aria-label={t`Your pick`} className="flex flex-wrap gap-1">
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
                          "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors duration-150",
                          selected ? "border-brand-600 bg-brand-600 text-white" : "hover:bg-muted",
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  },
                )}
              </div>
            )}
            <textarea
              value={results.notes[test.id] ?? ""}
              onChange={(event) => setNote(test.id, event.target.value)}
              placeholder={t`Notes — what worked, what you'd change…`}
              rows={2}
              className="w-full resize-none rounded-xl border bg-background px-2.5 py-2 text-[12px] leading-snug outline-none transition-[border-color,box-shadow] focus:border-brand-400 focus:shadow-[0_0_0_3px_var(--brand-50)]"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <Trans>
                Check {phase + 1} of {test.steps.length}
              </Trans>
            </div>
            <p className="text-[13.5px] font-medium leading-snug">{i18n._(test.steps[phase])}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={phase === 0}
          onClick={() => setPhase((value) => value - 1)}
          className="flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
        >
          <ChevronLeft className="size-3.5" />
          <Trans>Back</Trans>
        </button>
        <div className="flex-1" />
        {!deciding && (
          <>
            <button
              type="button"
              onClick={() => setPhase((value) => value + 1)}
              className="h-7 rounded-lg px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Trans>Skip</Trans>
            </button>
            <button
              type="button"
              onClick={markAndNext}
              className="flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors hover:bg-muted"
            >
              <Check className="size-3.5 text-emerald-600" />
              {phase === test.steps.length - 1 ? <Trans>Done, decide</Trans> : <Trans>Done, next</Trans>}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
