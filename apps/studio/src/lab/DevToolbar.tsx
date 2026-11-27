/* eslint-disable lingui/no-unlocalized-strings -- dev-only lab chrome, never shipped */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"

export interface LabOption {
  value: string
  label: ReactNode
  /** One line on what to look for (shown by bars that have room for it). */
  hint?: string
}

export interface LabControl {
  key: string
  label: ReactNode
  options: LabOption[]
  default?: string
  cycle?: boolean
}

export interface LabAction {
  key: string
  label: ReactNode
  onClick: () => void
}

export type LabValues = Record<string, string>

const PARAMS_EVENT = "lab:params"
const HIDDEN_KEY = "lab:toolbar-hidden"

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange)
  window.addEventListener(PARAMS_EVENT, onChange)
  return () => {
    window.removeEventListener("popstate", onChange)
    window.removeEventListener(PARAMS_EVENT, onChange)
  }
}

function fallback(control: LabControl): string {
  return control.default ?? control.options[0]?.value ?? ""
}

/**
 * Lab state kept in the URL (`?variant=b&state=error`), so every combination is a link you can
 * share, reload or screenshot. Values outside a control's options fall back to its default, and
 * defaults are left out of the URL. Routers with typed search params can skip this hook and pass
 * their own `values`/`onChange` to `DevToolbar`.
 */
export function useLabParams(controls: LabControl[]): [LabValues, (key: string, value: string) => void] {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "")
  const values = useMemo(() => {
    const params = new URLSearchParams(search)
    const out: LabValues = {}
    for (const control of controls) {
      const raw = params.get(control.key)
      out[control.key] = raw !== null && control.options.some((o) => o.value === raw) ? raw : fallback(control)
    }
    return out
  }, [search, controls])
  const set = useCallback(
    (key: string, value: string) => {
      const control = controls.find((c) => c.key === key)
      const url = new URL(window.location.href)
      if (control && value === fallback(control)) url.searchParams.delete(key)
      else url.searchParams.set(key, value)
      window.history.replaceState(window.history.state, "", url)
      window.dispatchEvent(new Event(PARAMS_EVENT))
    },
    [controls],
  )
  return [values, set]
}

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1"
  } catch {
    return false
  }
}

function suppressed(): boolean {
  return new URLSearchParams(window.location.search).get("toolbar") === "0"
}

function Segment({ control, value, onChange }: { control: LabControl; value: string; onChange: (value: string) => void }) {
  return (
    <div role="radiogroup" aria-label={typeof control.label === "string" ? control.label : control.key} className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/5 px-1 py-0.5">
      <span className="px-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/45">{control.label}</span>
      {control.options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={
              "h-7 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none " +
              (active ? "bg-white text-zinc-900 shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white")
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Floating dev-only bar for flipping between design variants and simulated states. One per lab,
 * mounted once next to the screen it drives, never inside production components. ← / → step the
 * `cycle` control (the first one by default) when nothing else has focus; ` hides the bar;
 * `?toolbar=0` removes it for screenshots. Deliberately unthemed so it never reads as product UI.
 */
export function DevToolbar({ controls, values, onChange, actions = [], note }: { controls: LabControl[]; values: LabValues; onChange: (key: string, value: string) => void; actions?: LabAction[]; note?: ReactNode }) {
  const [hidden, setHidden] = useState(readHidden)
  const [shown, setShown] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const cycled = controls.find((c) => c.cycle) ?? controls[0]

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, hidden ? "1" : "0")
    } catch {
      return
    }
  }, [hidden])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as Node | null
      const free = target === document.body || target === document.documentElement || (target !== null && root.current?.contains(target))
      if (!free) return
      if (e.key === "`") {
        e.preventDefault()
        setHidden((h) => !h)
        return
      }
      if (!cycled || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return
      e.preventDefault()
      const options = cycled.options
      const index = Math.max(0, options.findIndex((o) => o.value === values[cycled.key]))
      const next = options[(index + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length]
      onChange(cycled.key, next.value)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [cycled, values, onChange])

  if (suppressed()) return null

  return (
    <div data-lab-toolbar="" className="pointer-events-none fixed inset-x-0 bottom-6 z-[2147483000] flex justify-center px-4">
      {hidden ? (
        <button
          type="button"
          onClick={() => setHidden(false)}
          aria-label="Show lab toolbar"
          className="pointer-events-auto h-8 rounded-full bg-zinc-900/90 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70 shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-md transition-[color,transform] duration-150 ease-out hover:text-white active:scale-[0.97]"
        >
          Lab
        </button>
      ) : (
        <div
          ref={root}
          className={
            "pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-zinc-900/90 p-1.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-md [scrollbar-width:none] transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none " +
            (shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")
          }
        >
          {controls.map((control) => (
            <Segment key={control.key} control={control} value={values[control.key]} onChange={(value) => onChange(control.key, value)} />
          ))}
          {note !== undefined && <span className="shrink-0 px-2 text-[12px] font-medium text-white/70">{note}</span>}
          {actions.length > 0 && <span className="mx-1 h-5 w-px shrink-0 bg-white/15" />}
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              className="h-8 shrink-0 whitespace-nowrap rounded-full bg-white/10 px-3 text-[12px] font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-white/20 active:scale-[0.97]"
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setHidden(true)}
            aria-label="Hide lab toolbar"
            className="grid size-8 shrink-0 place-items-center rounded-full text-[15px] leading-none text-white/60 transition-[background-color,color] duration-150 ease-out hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
