/* eslint-disable lingui/no-unlocalized-strings -- dev-only lab chrome, never shipped */
import { useEffect, useRef, useState, type ReactNode } from "react"
import type { LabControl, LabValues } from "@/lab/DevToolbar"
import type { FlowStep } from "../guided/shared/labDrive"

const HIDDEN_KEY = "lab:toolbar-hidden"

export type StepItem = { id: FlowStep; label: string }

function readHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1"
  } catch {
    return false
  }
}

const GHOST = "h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold transition-colors"
const ICON = "grid size-8 shrink-0 place-items-center rounded-full text-[14px] transition-colors"
function Select({ control, value, onChange }: { control: LabControl; value: string; onChange: (v: string) => void }) {
  return (
    <select
      aria-label={String(control.label)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full cursor-pointer rounded-lg border-0 bg-white/10 px-2 text-[12.5px] font-semibold text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/40 [&>option]:bg-zinc-900"
    >
      {control.options.map((o) => (
        <option key={o.value} value={o.value}>
          {typeof o.label === "string" ? o.label : o.value}
        </option>
      ))}
    </select>
  )
}

function Field({ settings, id, values, onChange }: { settings: LabControl[]; id: string; values: LabValues; onChange: (key: string, value: string) => void }) {
  const control = settings.find((c) => c.key === id)
  if (!control) return null
  return <Select control={control} value={values[id] ?? control.default ?? control.options[0]!.value} onChange={(v) => onChange(id, v)} />
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className={`pointer-events-auto mb-2 max-h-[min(560px,70vh)] overflow-y-auto rounded-2xl bg-zinc-900/95 p-4 text-white shadow-[0_18px_48px_rgba(0,0,0,0.35)] ring-1 ring-white/10 backdrop-blur-md w-[min(440px,calc(100vw-32px))]`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
          ×
        </button>
      </div>
      {children}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/45">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] leading-snug text-white/45">{hint}</span>}
    </div>
  )
}


/**
 * The Add Book lab's bar: a stepper through the flow (it jumps the real flow there, and follows
 * the flow as you click through it), Replay, and ⚙ settings (book answer, speed, error, the saved
 * PDF). ← / → move one step; ` hides the bar.
 */
export function LabBar({
  steps,
  actual,
  onStep,
  pdfName,
  settings,
  values,
  onChange,
  onReplay,
  onForgetPdf,
  note,
}: {
  steps: StepItem[]
  actual: FlowStep
  onStep: (step: FlowStep) => void
  pdfName: string | null
  settings: LabControl[]
  values: LabValues
  onChange: (key: string, value: string) => void
  onReplay: () => void
  onForgetPdf: () => void
  note?: string
}) {
  const [hidden, setHidden] = useState(readHidden)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const main = steps.filter((s) => s.id !== "error")
  const at = main.findIndex((s) => s.id === actual)

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, hidden ? "1" : "0")
    } catch {
      return
    }
  }, [hidden])

  const move = (by: number) => {
    if (!main.length) return
    // From Error, ← goes back to Reading and → on to the first Check screen.
    const from = actual === "error" ? main.findIndex((s) => s.id === "reading") + (by > 0 ? 0 : 1) : at
    const next = main[Math.min(main.length - 1, Math.max(0, from + by))]
    if (next && next.id !== actual) onStep(next.id)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const free = t === document.body || t === document.documentElement || (!!t && !!root.current?.contains(t) && t.tagName !== "SELECT")
      if (!free) return
      if (e.key === "`") {
        e.preventDefault()
        setHidden((h) => !h)
      } else if (e.key === "Escape") setOpen(false)
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault()
        move(e.key === "ArrowRight" ? 1 : -1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (new URLSearchParams(window.location.search).get("toolbar") === "0") return null

  if (hidden)
    return (
      <div data-lab-toolbar="" className="pointer-events-none fixed inset-x-0 bottom-6 z-[2147483000] flex justify-center">
        <button type="button" onClick={() => setHidden(false)} className="pointer-events-auto h-8 rounded-full bg-zinc-900/90 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70 shadow-lg ring-1 ring-white/10 hover:text-white">
          Lab
        </button>
      </div>
    )

  return (
    <div ref={root} data-lab-toolbar="" className="pointer-events-none fixed inset-x-0 bottom-6 z-[2147483000] flex flex-col items-center px-4">
      {open && (
        <Panel title="Lab settings" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4">
            <Row label="Book answer" hint={note}>
              <Field settings={settings} id="book" values={values} onChange={onChange} />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Speed" hint="When you drop a PDF on Start, or Replay.">
                <Field settings={settings} id="speed" values={values} onChange={onChange} />
              </Row>
              <Row label="Error" hint="Shown on the Error step (API key when none), and on Replay.">
                <Field settings={settings} id="error" values={values} onChange={onChange} />
              </Row>
            </div>
            <Row label="Library" hint="Empty plays a first-time user: Pages asks if they're just trying it out.">
              <Field settings={settings} id="library" values={values} onChange={onChange} />
            </Row>
            <Row label="PDF">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/80" title={pdfName ?? undefined}>
                  {pdfName ?? "None yet: drop a PDF on Start, it's kept in this browser."}
                </span>
                {pdfName && (
                  <button type="button" onClick={onForgetPdf} className={`${GHOST} h-7 bg-white/10 hover:bg-white/20`}>
                    Forget
                  </button>
                )}
              </div>
            </Row>
            <p className="text-[11.5px] leading-snug text-white/45">Creating a book is simulated here: nothing is sent to the API.</p>
          </div>
        </Panel>
      )}

      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-zinc-900/90 p-1.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-md [scrollbar-width:none]">
        {steps.length > 0 && (
          <nav aria-label="Flow steps" className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/5 p-0.5">
            <button type="button" onClick={() => move(-1)} disabled={at === 0} aria-label="Previous step" title="Previous step (←)" className={`${ICON} size-7 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30`}>
              ‹
            </button>
            {steps.map((s, i) => {
              const current = s.id === actual
              const locked = !pdfName && s.id !== "start"
              const past = s.id !== "error" && actual !== "error" && i < at
              return (
                <span key={s.id} className="flex items-center">
                  {s.id === "error" && <span className="mx-0.5 h-4 w-px bg-white/15" />}
                  <button
                    type="button"
                    onClick={() => onStep(s.id)}
                    disabled={locked}
                    aria-current={current ? "step" : undefined}
                    title={locked ? "Drop a PDF on Start once; it's kept for the lab" : s.id === "error" ? "Error while reading (kind in ⚙)" : `Jump to ${s.label}`}
                    className={`h-7 whitespace-nowrap rounded-full px-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                      current ? (s.id === "error" ? "bg-rose-400 text-zinc-900" : "bg-white text-zinc-900 shadow-sm") : s.id === "error" ? "text-rose-300/80 hover:bg-rose-400/15" : past ? "text-white/80 hover:bg-white/10" : "text-white/50 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {past && <span className="mr-1 text-emerald-400">✓</span>}
                    {s.label}
                  </button>
                </span>
              )
            })}
            <button type="button" onClick={() => move(1)} disabled={at === main.length - 1 || !pdfName} aria-label="Next step" title="Next step (→)" className={`${ICON} size-7 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30`}>
              ›
            </button>
          </nav>
        )}
        {!pdfName && actual === "start" && steps.length > 0 && <span className="shrink-0 px-1.5 text-[11.5px] text-amber-300">Drop a PDF once</span>}

        <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
        <button type="button" onClick={onReplay} disabled={!pdfName} title="Replay from the PDF at the chosen speed" aria-label="Replay" className={`${ICON} bg-white/10 hover:bg-white/20 disabled:opacity-30`}>
          ↻
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Lab settings: book answer, speed, error" aria-label="Lab settings" className={`${ICON} ${open ? "bg-white text-zinc-900" : "bg-white/10 hover:bg-white/20"}`}>
          ⚙
        </button>
        <button type="button" onClick={() => setHidden(true)} aria-label="Hide lab toolbar" title="Hide (`)" className={`${ICON} text-[15px] text-white/60 hover:bg-white/10 hover:text-white`}>
          ×
        </button>
      </div>
    </div>
  )
}
