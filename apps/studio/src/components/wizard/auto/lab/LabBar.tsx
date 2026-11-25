/* eslint-disable lingui/no-unlocalized-strings -- dev-only lab chrome, never shipped */
import { useEffect, useRef, useState, type ReactNode } from "react"
import type { LabControl, LabValues } from "@/lab/DevToolbar"
import type { FlowStep } from "../variants/guided/shared/labDrive"

const STORE_KEY = "add-book-lab-picks-v1"
const HIDDEN_KEY = "lab:toolbar-hidden"

export type StepItem = { id: FlowStep; label: string }

interface Combo {
  id: string
  name: string
  values: LabValues
  at: number
}
interface Picks {
  liked: string[]
  combos: Combo[]
}

function readPicks(): Picks {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Partial<Picks> | null
    return { liked: raw?.liked ?? [], combos: raw?.combos ?? [] }
  } catch {
    return { liked: [], combos: [] }
  }
}

function usePicks() {
  const [picks, setPicks] = useState(readPicks)
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(picks))
    } catch {
      return
    }
  }, [picks])
  return [picks, setPicks] as const
}

function readHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1"
  } catch {
    return false
  }
}

const GHOST = "h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold transition-colors"
const ICON = "grid size-8 shrink-0 place-items-center rounded-full text-[14px] transition-colors"
const labelOf = (c: LabControl, v: string) => {
  const l = c.options.find((o) => o.value === v)?.label
  return typeof l === "string" ? l : v
}

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

function Panel({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`pointer-events-auto mb-2 max-h-[min(560px,70vh)] overflow-y-auto rounded-2xl bg-zinc-900/95 p-4 text-white shadow-[0_18px_48px_rgba(0,0,0,0.35)] ring-1 ring-white/10 backdrop-blur-md ${wide ? "w-[min(760px,calc(100vw-32px))]" : "w-[min(440px,calc(100vw-32px))]"}`}>
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

type Open = { kind: "settings" } | { kind: "saved" } | { kind: "idea"; key: string } | null

/**
 * The Add Book lab's bar, for Guided: a stepper through the flow (it jumps the real flow
 * there, and follows the flow as you click through it), the idea groups that change the current
 * step (each opens its options), Save / Saved, Replay, and ⚙ settings (book answer, speed, error,
 * the saved PDF). ← / → move one step; ` hides the bar.
 */
export function LabBar({
  steps,
  actual,
  onStep,
  pdfName,
  settings,
  ideas,
  shownGroups,
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
  ideas: LabControl[]
  shownGroups: string[]
  values: LabValues
  onChange: (key: string, value: string) => void
  onReplay: () => void
  onForgetPdf: () => void
  note?: string
}) {
  const [hidden, setHidden] = useState(readHidden)
  const [open, setOpen] = useState<Open>(null)
  const [picks, setPicks] = usePicks()
  const [flash, setFlash] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const onCount = ideas.filter((c) => values[c.key] !== "now").length
  const shown = ideas.filter((c) => shownGroups.includes(c.key))
  const main = steps.filter((s) => s.id !== "error")
  const at = main.findIndex((s) => s.id === actual)
  const toggle = (o: NonNullable<Open>) => setOpen((cur) => (cur && cur.kind === o.kind && (o.kind !== "idea" || (cur.kind === "idea" && cur.key === o.key)) ? null : o))

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, hidden ? "1" : "0")
    } catch {
      return
    }
  }, [hidden])

  // An idea group not shown at this step closes its popover.
  useEffect(() => {
    if (open?.kind === "idea" && !shownGroups.includes(open.key)) setOpen(null)
  }, [shownGroups])

  const move = (by: number) => {
    if (!main.length) return
    // From Error, ← goes back to Reading and → on to Found.
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
      } else if (e.key === "Escape") setOpen(null)
      else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && open?.kind === "idea") {
        const c = ideas.find((x) => x.key === open.key)
        if (!c) return
        e.preventDefault()
        const list = c.options
        const i = list.findIndex((o) => o.value === values[c.key])
        const next = list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]
        if (next) onChange(c.key, next.value)
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault()
        move(e.key === "ArrowRight" ? 1 : -1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const say = (text: string) => {
    setFlash(text)
    window.setTimeout(() => setFlash(""), 1600)
  }

  const stepLabel = (id: string) => steps.find((s) => s.id === id)?.label ?? id
  const describe = (v: LabValues) => {
    const parts = [stepLabel(v.step ?? "start")]
    for (const c of ideas) if (v[c.key] && v[c.key] !== "now") parts.push(`${c.label}: ${labelOf(c, v[c.key]!)}`)
    return parts.join(" · ")
  }

  const saveCombo = () => {
    const name = describe({ ...values, step: actual })
    setPicks((p) => ({ ...p, combos: [{ id: crypto.randomUUID(), name, values: { ...values, step: actual }, at: Date.now() }, ...p.combos] }))
    say("✓ Saved")
  }

  const loadCombo = (c: Combo) => {
    const { step, ...rest } = c.values
    for (const [k, v] of Object.entries(rest)) if (values[k] !== v) onChange(k, v)
    if (step) onChange("step", step)
    setOpen(null)
  }

  const toggleLike = (id: string) => setPicks((p) => ({ ...p, liked: p.liked.includes(id) ? p.liked.filter((x) => x !== id) : [...p.liked, id] }))

  const copy = async () => {
    const liked = ideas.flatMap((c) => c.options.filter((o) => picks.liked.includes(o.value)).map((o) => `- ${c.label}: ${o.value} ${typeof o.label === "string" ? o.label : ""}`))
    const combos = picks.combos.map((c) => `- ${c.name}  (${new URLSearchParams(c.values).toString()})`)
    const text = ["Liked ideas:", ...(liked.length ? liked : ["- none"]), "", "Saved combos:", ...(combos.length ? combos : ["- none"])].join("\n")
    try {
      await navigator.clipboard.writeText(text)
      say("✓ Copied")
    } catch {
      say("Copy failed")
    }
  }

  if (new URLSearchParams(window.location.search).get("toolbar") === "0") return null

  if (hidden)
    return (
      <div data-lab-toolbar="" className="pointer-events-none fixed inset-x-0 bottom-6 z-[2147483000] flex justify-center">
        <button type="button" onClick={() => setHidden(false)} className="pointer-events-auto h-8 rounded-full bg-zinc-900/90 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70 shadow-lg ring-1 ring-white/10 hover:text-white">
          Lab
        </button>
      </div>
    )

  const ideaControl = open?.kind === "idea" ? ideas.find((c) => c.key === open.key) : undefined

  return (
    <div ref={root} data-lab-toolbar="" className="pointer-events-none fixed inset-x-0 bottom-6 z-[2147483000] flex flex-col items-center px-4">
      {ideaControl && (
        <Panel title={`${ideaControl.label} · ${stepLabel(actual)}`} onClose={() => setOpen(null)}>
          <div role="radiogroup" aria-label={String(ideaControl.label)} className="flex flex-col gap-0.5">
            {ideaControl.options.map((o) => {
              const on = o.value === values[ideaControl.key]
              const liked = picks.liked.includes(o.value)
              return (
                <div key={o.value} className={`flex items-start gap-1 rounded-xl pr-1 ${on ? "bg-white/10" : ""}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange(ideaControl.key, o.value)}
                    className="flex min-h-9 flex-1 items-start gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/5"
                  >
                    <span className={`mt-[5px] size-2 shrink-0 rounded-full ${on ? "bg-brand-400" : "bg-white/15"}`} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={`text-[13px] font-semibold ${on ? "text-white" : "text-white/80"}`}>
                        {o.label}
                        {o.value !== "now" && o.value !== "off" && <span className="ml-1.5 text-[11px] font-medium text-white/30">{o.value}</span>}
                      </span>
                      <span className="text-[11.5px] leading-snug text-white/50">{o.hint}</span>
                    </span>
                  </button>
                  {o.value !== "now" && o.value !== "off" && (
                    <button
                      type="button"
                      onClick={() => toggleLike(o.value)}
                      aria-pressed={liked}
                      aria-label={liked ? `Unlike ${String(o.label)}` : `Like ${String(o.label)}`}
                      className={`${ICON} mt-1 size-7 ${liked ? "text-rose-400" : "text-white/35 hover:bg-white/10 hover:text-white"}`}
                    >
                      {liked ? "♥" : "♡"}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
            <button type="button" onClick={() => onStep(actual)} disabled={!pdfName} className={`${GHOST} h-7 bg-white text-zinc-900 disabled:opacity-40`}>
              ↻ Play {stepLabel(actual)} again
            </button>
            <span className="text-[11.5px] text-white/45">↑ ↓ try the next one · {onCount} on in all steps</span>
          </div>
        </Panel>
      )}
      {open?.kind === "settings" && (
        <Panel title="Lab settings" onClose={() => setOpen(null)}>
          <div className="flex flex-col gap-4">
            <Row label="Book answer" hint={note}>
              <Select control={settings[0]!} value={values[settings[0]!.key]!} onChange={(v) => onChange(settings[0]!.key, v)} />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Speed" hint="When you drop a PDF on Start, or Replay.">
                <Select control={settings[1]!} value={values[settings[1]!.key]!} onChange={(v) => onChange(settings[1]!.key, v)} />
              </Row>
              <Row label="Error" hint="Shown on the Error step (API key when none), and on Replay.">
                <Select control={settings[2]!} value={values[settings[2]!.key]!} onChange={(v) => onChange(settings[2]!.key, v)} />
              </Row>
            </div>
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
      {open?.kind === "saved" && (
        <Panel title="Saved" wide onClose={() => setOpen(null)}>
          <h3 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/45">Liked ideas ({picks.liked.length})</h3>
          <div className="mb-4 flex flex-wrap gap-1">
            {picks.liked.length === 0 && <span className="text-[12px] text-white/45">None yet. Use ♡ in an idea group.</span>}
            {ideas.flatMap((c) =>
              c.options
                .filter((o) => picks.liked.includes(o.value))
                .map((o) => (
                  <span key={o.value} className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 py-1 pl-2.5 pr-1 text-[12px] text-rose-200">
                    {c.label}: {o.label}
                    <button type="button" onClick={() => toggleLike(o.value)} aria-label="Unlike" className="grid size-5 place-items-center rounded-full hover:bg-white/10">
                      ×
                    </button>
                  </span>
                )),
            )}
          </div>
          <h3 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/45">Saved combos ({picks.combos.length})</h3>
          <ul className="flex flex-col gap-1">
            {picks.combos.length === 0 && <li className="text-[12px] text-white/45">None yet. Use ★ Save in the bar.</li>}
            {picks.combos.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-xl bg-white/5 py-1.5 pl-3 pr-1.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px]" title={c.name}>
                  {c.name}
                </span>
                <span className="shrink-0 text-[11px] text-white/40">{new Date(c.at).toLocaleString()}</span>
                <button type="button" onClick={() => loadCombo(c)} className={`${GHOST} h-7 bg-white text-zinc-900`}>
                  Load
                </button>
                <button type="button" onClick={() => setPicks((p) => ({ ...p, combos: p.combos.filter((x) => x.id !== c.id) }))} aria-label="Delete" className="grid size-7 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
            <button type="button" onClick={copy} className={`${GHOST} bg-white text-zinc-900`}>
              Copy all as text
            </button>
            {onCount > 0 && (
              <button type="button" onClick={() => ideas.forEach((c) => values[c.key] !== "now" && onChange(c.key, "now"))} className={`${GHOST} bg-white/5 text-white/70 hover:bg-white/10`}>
                Turn all {onCount} ideas off
              </button>
            )}
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

        {ideas.length > 0 && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/5 py-0.5 pl-2.5 pr-0.5">
            <span className="pr-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">Ideas</span>
            {shown.map((c) => {
              const value = values[c.key]!
              const on = value !== "now"
              const isOpen = open?.kind === "idea" && open.key === c.key
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggle({ kind: "idea", key: c.key })}
                  aria-expanded={isOpen}
                  title={on ? `${c.label}: ${labelOf(c, value)}` : `${c.label}: Now`}
                  className={`h-7 max-w-[220px] truncate whitespace-nowrap rounded-full px-2 text-[12px] font-semibold transition-colors ${isOpen ? "bg-white text-zinc-900" : on ? "bg-brand-500 text-white hover:bg-brand-500/90" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                >
                  {c.label}
                  {on && <span className="font-medium opacity-80">: {labelOf(c, value)}</span>}
                </button>
              )
            })}
            <span className="px-1.5 text-[11px] font-semibold tabular-nums text-white/45" title="Ideas on, across all steps">
              {onCount} on
            </span>
          </div>
        )}

        <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
        <button type="button" onClick={saveCombo} title="Save this step and ideas" className={`${GHOST} bg-white/10 px-2.5 hover:bg-white/20`}>
          {flash || "★ Save"}
        </button>
        <button type="button" title="Saved picks" aria-label="Saved picks" onClick={() => toggle({ kind: "saved" })} aria-expanded={open?.kind === "saved"} className={`${GHOST} px-2.5 ${open?.kind === "saved" ? "bg-white text-zinc-900" : "bg-white/10 hover:bg-white/20"}`}>
          ☰ {picks.combos.length + picks.liked.length}
        </button>
        <button type="button" onClick={onReplay} disabled={!pdfName} title="Replay from the PDF at the chosen speed" aria-label="Replay" className={`${ICON} bg-white/10 hover:bg-white/20 disabled:opacity-30`}>
          ↻
        </button>
        <button type="button" onClick={() => toggle({ kind: "settings" })} aria-expanded={open?.kind === "settings"} title="Lab settings: design, book answer, speed, error" aria-label="Lab settings" className={`${ICON} ${open?.kind === "settings" ? "bg-white text-zinc-900" : "bg-white/10 hover:bg-white/20"}`}>
          ⚙
        </button>
        <button type="button" onClick={() => setHidden(true)} aria-label="Hide lab toolbar" title="Hide (`)" className={`${ICON} text-[15px] text-white/60 hover:bg-white/10 hover:text-white`}>
          ×
        </button>
      </div>
    </div>
  )
}
