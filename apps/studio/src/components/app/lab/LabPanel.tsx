import { useEffect, useState } from "react"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Compass, ChevronLeft, ChevronRight, ClipboardCheck, Moon, Pause, Play, RotateCcw, Sparkles, Sun, X } from "lucide-react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { readThemeMode, resolvesToDark, setThemeMode } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { setNavLabOn } from "./NavLab"
import {
  DEFAULT_VARIANTS,
  GROUP_META,
  STEP_GROUPS,
  TIERS,
  VARIANT_GROUPS,
  resetVariants,
  setVariantValue,
  stepOf,
  useLabVisible,
  useVariants,
} from "./variants"
import { isPaused, pauseScenario, resumeScenario, scenarioElapsed, stopScenario, useScenario } from "./simulate"
import { clearActiveState, statesFor, stepState, useActiveState } from "./testPlan/states"
import { LAB_TESTS, RECOMMENDED } from "./testPlan/tests"

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function suppressed(): boolean {
  return new URLSearchParams(window.location.search).get("toolbar") === "0"
}

export function LabPanel() {
  const { t, i18n } = useLingui()
  const router = useRouter()
  const navigate = (path: string) => router.history.push(path)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const variants = useVariants()
  const [visible, setVisible] = useLabVisible()
  const [active] = useActiveState()
  const [scenario] = useScenario()
  const [dark, setDark] = useState(() => resolvesToDark(readThemeMode()))
  const [, setTick] = useState(0)

  const where = stepOf(pathname)
  const keys = where ? STEP_GROUPS[where.step] : []
  const test = active ? LAB_TESTS.find((candidate) => candidate.id === active.testId) : undefined
  const states = statesFor(test)
  const stateIndex = states.findIndex((state) => state.id === active?.stateId)
  const state = states[stateIndex]
  const timed = !!scenario && scenario.kind !== "slow-load"
  const paused = isPaused(scenario)
  const elapsed = scenarioElapsed(scenario)
  const changed = keys.filter((key) => variants[key] !== DEFAULT_VARIANTS[key]).length

  useEffect(() => {
    if (!timed || paused) return
    const id = window.setInterval(() => setTick((value) => value + 1), 500)
    return () => window.clearInterval(id)
  }, [timed, paused])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === "`") setVisible((value) => !value)
      else if (event.key === "[") stepState(-1, (path) => router.history.push(path))
      else if (event.key === "]") stepState(1, (path) => router.history.push(path))
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router, setVisible])

  if (suppressed() || pathname === "/lab") return null

  if (!visible || !where) {
    return (
      <button
        type="button"
        data-lab-toolbar=""
        onClick={() => (where ? setVisible(true) : navigate("/lab"))}
        aria-label={where ? t`Show lab toolbar` : t`Open the variant test plan`}
        className={cn(
          "fixed bottom-3 left-3 z-[70] h-8 rounded-full bg-zinc-900/90 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70 shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-md transition-[color,transform,bottom] duration-200 hover:text-white active:scale-[0.97]",
          "[body:has([data-pipeline-dock=shown])_&]:bottom-[92px]",
        )}
      >
        <Trans>Lab</Trans>
        {changed > 0 && <span className="ml-1.5 text-brand-300">{changed}</span>}
      </button>
    )
  }

  const toggleTheme = () => {
    const next = !dark
    setThemeMode(next ? "dark" : "light")
    setDark(next)
  }

  const stepName = getStageLabelI18n(where.slug)

  return (
    <div
      data-lab-toolbar=""
      role="toolbar"
      aria-label={t`Design variants`}
      className={cn(
        "fixed bottom-3 left-3 z-[70] flex w-[464px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl bg-zinc-900/92 text-white shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-md transition-[bottom] duration-300 animate-in fade-in slide-in-from-bottom-1",
        "[body:has([data-pipeline-dock=shown])_&]:bottom-[92px]",
      )}
    >
      <div className="flex items-center gap-1 px-3 pb-1.5 pt-2.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/45">
          <Trans>Lab</Trans>
        </span>
        <span className="truncate text-[13px] font-semibold">{stepName}</span>
        <div className="flex-1" />
        <DarkIcon
          label={t`Match the canvas: recommended picks, Arc layout, no simulation`}
          onClick={() => {
            resetVariants()
            for (const [key, value] of Object.entries({ ...RECOMMENDED, panels: "arc" })) setVariantValue(key as keyof typeof DEFAULT_VARIANTS, value)
            stopScenario()
            clearActiveState()
          }}
        >
          <Sparkles className="size-3.5" />
        </DarkIcon>
        <DarkIcon label={t`Navigation lab: floating toolbar for the dock and storyboard tab`} onClick={() => setNavLabOn(true)}>
          <Compass className="size-3.5" />
        </DarkIcon>
        <DarkIcon label={t`Variant test plan`} onClick={() => navigate("/lab")}>
          <ClipboardCheck className="size-3.5" />
        </DarkIcon>
        {changed > 0 && (
          <DarkIcon label={t`Reset all variants`} onClick={() => resetVariants()}>
            <RotateCcw className="size-3.5" />
          </DarkIcon>
        )}
        <DarkIcon label={dark ? t`Light mode` : t`Dark mode`} onClick={toggleTheme}>
          {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </DarkIcon>
        <DarkIcon label={t`Hide (\`)`} onClick={() => setVisible(false)}>
          <X className="size-3.5" />
        </DarkIcon>
      </div>

      {test && state && (
        <div className="mx-2 mb-1.5 flex items-center gap-0.5 rounded-xl bg-white/[0.06] px-1 py-1">
          <DarkIcon label={t`Previous state ([)`} disabled={stateIndex <= 0} onClick={() => stepState(-1, navigate)}>
            <ChevronLeft className="size-4" />
          </DarkIcon>
          <div className="min-w-0 flex-1 px-1">
            <div className="truncate text-[12px] font-semibold">
              <span className="mr-1.5 font-mono text-[10.5px] font-medium text-white/45">
                {stateIndex + 1}/{states.length}
              </span>
              {i18n._(state.label)}
            </div>
            <div className="truncate text-[10.5px] text-white/45">{i18n._(test.title)}</div>
          </div>
          <DarkIcon label={t`Next state (])`} disabled={stateIndex >= states.length - 1} onClick={() => stepState(1, navigate)}>
            <ChevronRight className="size-4" />
          </DarkIcon>
          {timed && (
            <>
              <DarkIcon label={paused ? t`Play` : t`Pause`} onClick={paused ? resumeScenario : pauseScenario}>
                {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              </DarkIcon>
              {elapsed !== null && (
                <span className={cn("w-8 font-mono text-[10.5px] tabular-nums", paused ? "text-white/45" : "text-brand-300")}>
                  {formatClock(elapsed)}
                </span>
              )}
            </>
          )}
          <DarkIcon label={t`Close states`} onClick={clearActiveState}>
            <X className="size-3" />
          </DarkIcon>
        </div>
      )}

      <div className="flex flex-col gap-2 px-2 pb-2.5">
        {TIERS.map((tier) => {
          const rows = keys.filter((key) => GROUP_META[key].tier === tier.key)
          if (rows.length === 0) return null
          return (
            <div key={tier.key} className="flex flex-col gap-0.5">
              <div className="px-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/35" title={i18n._(tier.hint)}>
                {i18n._(tier.label)}
              </div>
              {rows.map((key) => {
                const group = VARIANT_GROUPS.find((candidate) => candidate.key === key)
                if (!group) return null
                const value = variants[key]
                return (
                  <div key={key} role="radiogroup" aria-label={i18n._(group.label)} className="flex items-center gap-1 rounded-full bg-white/5 px-1 py-0.5">
                    <span
                      className={cn(
                        "w-[124px] shrink-0 truncate px-2 text-[11px] font-semibold",
                        value !== DEFAULT_VARIANTS[key] ? "text-white" : "text-white/55",
                      )}
                    >
                      {i18n._(group.label)}
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
                      {group.options.map((option) => {
                        const selected = option.value === value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            title={i18n._(option.hint)}
                            onClick={() => setVariantValue(key, option.value)}
                            className={cn(
                              "h-6 shrink-0 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-semibold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none",
                              selected ? "bg-white text-zinc-900 shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white",
                            )}
                          >
                            {i18n._(option.label)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DarkIcon({
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
      className="grid size-7 shrink-0 place-items-center rounded-full text-white/60 transition-[background-color,color,transform] duration-150 hover:bg-white/10 hover:text-white active:scale-90 disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  )
}
