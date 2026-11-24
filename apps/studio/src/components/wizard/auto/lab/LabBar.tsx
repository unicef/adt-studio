/* eslint-disable lingui/no-unlocalized-strings -- dev-only lab chrome, never shipped */
import { useEffect, useRef, useState, type ReactNode } from "react"
import type { LabControl, LabValues } from "@/lab/DevToolbar"

const STORE_KEY = "add-book-lab-picks-v1"
const HIDDEN_KEY = "lab:toolbar-hidden"

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

const PILL = "h-7 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold transition-[background-color,color] duration-150"
const pill = (active: boolean) => `${PILL} ${active ? "bg-white text-zinc-900 shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"}`
const GHOST = "h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold transition-colors"
const labelOf = (c: LabControl, v: string) => {
  const l = c.options.find((o) => o.value === v)?.label
  return typeof l === "string" ? l : v
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/5 py-0.5 pl-2.5 pr-1">
      <span className="pr-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">{title}</span>
      {children}
    </div>
  )
}

function Select({ control, value, onChange }: { control: LabControl; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center" title={String(control.label)}>
      <span className="sr-only">{control.label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 max-w-[170px] cursor-pointer rounded-full border-0 bg-white/10 px-2 text-[12px] font-semibold text-white outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/40 [&>option]:bg-zinc-900"
      >
        {control.options.map((o) => (
          <option key={o.value} value={o.value}>
            {typeof o.label === "string" ? o.label : o.value}
          </option>
        ))}
      </select>
    </label>
  )
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="pointer-events-auto mb-2 max-h-[min(560px,70vh)] w-[min(980px,calc(100vw-32px))] overflow-y-auto rounded-2xl bg-zinc-900/95 p-4 text-white shadow-[0_18px_48px_rgba(0,0,0,0.35)] ring-1 ring-white/10 backdrop-blur-md">
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

/**
 * The Add Book lab's toolbar, in three sections: Design, State (the engine answer, its speed and
 * an error) and, for Living chat, Ideas (one row per group from the reference board) in a panel.
 * Picks persist in this browser: a heart per idea, and saved combos (design + state + ideas) to
 * reload later. "Copy" puts both on the clipboard as plain text.
 */
export function LabBar({
  design,
  state,
  ideas,
  values,
  onChange,
  onRestart,
  note,
}: {
  design: LabControl
  state: LabControl[]
  ideas: LabControl[]
  values: LabValues
  onChange: (key: string, value: string) => void
  onRestart: () => void
  note?: string
}) {
  const [hidden, setHidden] = useState(readHidden)
  const [open, setOpen] = useState<"ideas" | "saved" | null>(null)
  const [picks, setPicks] = usePicks()
  const [flash, setFlash] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const changed = ideas.filter((c) => values[c.key] !== "now").length

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
      const t = e.target as HTMLElement | null
      const free = t === document.body || t === document.documentElement || (!!t && !!root.current?.contains(t) && t.tagName !== "SELECT")
      if (!free) return
      if (e.key === "`") {
        e.preventDefault()
        setHidden((h) => !h)
      } else if (e.key === "Escape") setOpen(null)
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault()
        const o = design.options
        const i = Math.max(0, o.findIndex((x) => x.value === values[design.key]))
        onChange(design.key, o[(i + (e.key === "ArrowRight" ? 1 : -1) + o.length) % o.length]!.value)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [design, values, onChange])

  const say = (text: string) => {
    setFlash(text)
    window.setTimeout(() => setFlash(""), 1600)
  }

  const describe = (v: LabValues) => {
    const parts = [labelOf(design, v[design.key] ?? "")]
    for (const c of ideas) if (v[c.key] && v[c.key] !== "now") parts.push(`${c.label}: ${labelOf(c, v[c.key]!)}`)
    return parts.join(" · ")
  }

  const saveCombo = () => {
    const name = describe(values)
    setPicks((p) => ({ ...p, combos: [{ id: crypto.randomUUID(), name, values: { ...values }, at: Date.now() }, ...p.combos] }))
    say("✓ Saved")
  }

  const loadCombo = (c: Combo) => {
    for (const [k, v] of Object.entries(c.values)) onChange(k, v)
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

  return (
    <div ref={root} data-lab-toolbar="" className="pointer-events-none fixed inset-x-0 bottom-6 z-[2147483000] flex flex-col items-center px-4">
      {open === "ideas" && (
        <Panel title="Living chat ideas" onClose={() => setOpen(null)}>
          <div className="flex flex-col gap-2">
            {ideas.map((c) => {
              const value = values[c.key]!
              return (
                <div key={c.key} className="flex items-center gap-2">
                  <span className="w-[76px] shrink-0 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/45">{c.label}</span>
                  <div role="radiogroup" aria-label={String(c.label)} className="flex flex-1 flex-wrap gap-0.5">
                    {c.options.map((o) => (
                      <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(c.key, o.value)} className={pill(o.value === value)}>
                        {picks.liked.includes(o.value) && <span className="mr-1 text-rose-400">♥</span>}
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={value === "now"}
                    onClick={() => toggleLike(value)}
                    aria-pressed={picks.liked.includes(value)}
                    title={value === "now" ? "Pick an idea to like it" : "Like this idea"}
                    className={`${GHOST} w-[74px] disabled:opacity-30 ${picks.liked.includes(value) ? "bg-rose-500/20 text-rose-300" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
                  >
                    {picks.liked.includes(value) ? "♥ Liked" : "♡ Like"}
                  </button>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
            <button type="button" onClick={() => ideas.forEach((c) => onChange(c.key, "now"))} className={`${GHOST} bg-white/5 text-white/70 hover:bg-white/10`}>
              Reset all to Now
            </button>
            <span className="text-[11.5px] text-white/45">Ideas switch live. Restart replays the flow from the start.</span>
          </div>
        </Panel>
      )}
      {open === "saved" && (
        <Panel title="Saved" onClose={() => setOpen(null)}>
          <h3 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/45">Liked ideas ({picks.liked.length})</h3>
          <div className="mb-4 flex flex-wrap gap-1">
            {picks.liked.length === 0 && <span className="text-[12px] text-white/45">None yet. Use ♡ Like in Ideas.</span>}
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
            {picks.combos.length === 0 && <li className="text-[12px] text-white/45">None yet. Use Save in the bar.</li>}
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
          <div className="mt-3 border-t border-white/10 pt-3">
            <button type="button" onClick={copy} className={`${GHOST} bg-white text-zinc-900`}>
              Copy all as text
            </button>
          </div>
        </Panel>
      )}

      <div className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full bg-zinc-900/90 p-1.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur-md [scrollbar-width:none]">
        <Section title="Design">
          {design.options.map((o) => (
            <button key={o.value} type="button" onClick={() => onChange(design.key, o.value)} aria-pressed={o.value === values[design.key]} className={pill(o.value === values[design.key])}>
              {o.label}
            </button>
          ))}
        </Section>
        <Section title="State">
          {state.map((c) => (
            <span key={c.key} title={c.key === "book" ? note : undefined}>
              <Select control={c} value={values[c.key]!} onChange={(v) => onChange(c.key, v)} />
            </span>
          ))}
        </Section>
        {ideas.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => (o === "ideas" ? null : "ideas"))} aria-expanded={open === "ideas"} className={`${GHOST} ${open === "ideas" ? "bg-white text-zinc-900" : "bg-brand-500 text-white hover:bg-brand-500/90"}`}>
            Ideas{changed > 0 ? ` · ${changed} on` : ""}
          </button>
        )}
        <span className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />
        <button type="button" onClick={saveCombo} className={`${GHOST} bg-white/10 hover:bg-white/20`}>
          {flash || "★ Save"}
        </button>
        <button type="button" title="Saved picks" aria-label="Saved picks" onClick={() => setOpen((o) => (o === "saved" ? null : "saved"))} aria-expanded={open === "saved"} className={`${GHOST} ${open === "saved" ? "bg-white text-zinc-900" : "bg-white/10 hover:bg-white/20"}`}>
          ☰ {picks.combos.length + picks.liked.length}
        </button>
        <button type="button" onClick={onRestart} title="Restart the flow" aria-label="Restart" className={`${GHOST} bg-white/10 px-2.5 hover:bg-white/20`}>
          ↻
        </button>
        <button type="button" onClick={() => setHidden(true)} aria-label="Hide lab toolbar" title="Hide (`)" className="grid size-8 shrink-0 place-items-center rounded-full text-[15px] text-white/60 hover:bg-white/10 hover:text-white">
          ×
        </button>
      </div>
    </div>
  )
}
