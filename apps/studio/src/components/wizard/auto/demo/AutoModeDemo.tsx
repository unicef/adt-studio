/* eslint-disable lingui/no-unlocalized-strings -- dev-only demo page for developers, never shown to users */
import { useEffect, useMemo, useRef, useState } from "react"
import type { SetupRecommendation } from "@adt/types"
import { FlowTopBar } from "@/components/FlowTopBar"
import { EngineClientProvider, useEngineClient, type EngineClient } from "../engine/client"
import { useEngineRun } from "../engine/useEngineRun"
import { loadSavedPdf, savePdf } from "../lab/savedPdf"
import { Walkthrough } from "./walkthrough/Walkthrough"

// Recorded runs from the lab, dev builds only (they describe real books).
const SAVED: Record<string, () => Promise<SetupRecommendation>> = import.meta.env.DEV ? import.meta.glob<SetupRecommendation>("../lab/fixtures/*.json", { import: "default" }) : {}
const SAVED_NAMES = Object.keys(SAVED).map((k) => k.replace(/^.*\/|\.json$/g, ""))

/** The last run shown here, kept in this browser so a reload shows it again (with its PDF from IndexedDB). */
const LAST_KEY = "auto-mode-demo:last-run"
const PDF_KEY = "auto-mode-demo"
type Shown = { rec: SetupRecommendation; source: string; fileName: string | null; at: number }

function readLast(): Shown | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? "null") as Shown | null
  } catch {
    return null
  }
}
function writeLast(shown: Shown) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(shown))
  } catch {
    /* storage full or blocked: the run lasts until reload */
  }
}

type Source = { kind: "real" } | { kind: "saved"; name: string }
const sourceLabel = (s: Source) => (s.kind === "real" ? "real engine" : `saved run “${s.name}”`)

/**
 * `/dev/auto-mode`: runs the auto mode engine (E3) on a PDF and walks through what it actually did,
 * step by step, from its own response. "Real engine" calls the API with the configured provider
 * (a few cents, sends page images to the provider); a saved run replays a recorded answer with no
 * AI call.
 */
export function AutoModeDemo() {
  const real = useEngineClient()
  const [source, setSource] = useState<Source>({ kind: "real" })
  const engine = useMemo<EngineClient>(
    () => (source.kind === "real" ? real : { recommend: async () => structuredClone(await SAVED[`../lab/fixtures/${source.name}.json`]!()) }),
    [source, real],
  )
  return (
    <EngineClientProvider value={engine}>
      <Demo source={source} onSource={setSource} />
    </EngineClientProvider>
  )
}

function Demo({ source, onSource }: { source: Source; onSource: (s: Source) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [go, setGo] = useState<{ file: File; n: number; source: Source } | null>(null)
  const [shown, setShown] = useState<Shown | null>(readLast)
  const input = useRef<HTMLInputElement>(null)
  const run = useEngineRun(go?.file ?? null, go?.n ?? 0)
  const elapsed = useElapsed(run.status === "running" ? run.startedAt : null)

  // The PDF of the last run, so its pages show after a reload.
  useEffect(() => {
    void loadSavedPdf(PDF_KEY).then((f) => f && setFile((cur) => cur ?? f))
  }, [])

  // A finished run becomes the one shown (and kept).
  useEffect(() => {
    if (run.status !== "done" || !go) return
    const next = { rec: run.rec, source: sourceLabel(go.source), fileName: go.source.kind === "real" ? go.file.name : null, at: Date.now() }
    setShown(next)
    writeLast(next)
  }, [run])

  const pick = (f: File | null) => {
    setFile(f)
    if (f) void savePdf(f, PDF_KEY)
  }
  const start = () => {
    if (!file && source.kind === "real") return
    setGo((g) => ({ file: file ?? new File([], "saved.pdf"), n: (g?.n ?? 0) + 1, source }))
  }
  // Pages show when the PDF loaded is the one the run read (any PDF for a saved run: it may be the same book).
  const pagesFrom = file && (!shown?.fileName || shown.fileName === file.name) ? file : null

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <FlowTopBar title="Auto mode · engine demo" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-6 py-8">
          <header className="flex flex-col gap-2">
            <h1 className="text-[30px] font-bold tracking-tight">How auto mode picks a book's settings</h1>
            <p className="max-w-[820px] text-[15px] text-muted-foreground">
              Engine E3, <code>POST /api/setup-recommendation</code>. It measures the PDF, reads it twice with AI in two different ways, turns the facts into settings with a fixed rulebook, and asks the user only where the two readings disagree on something that would change a setting. Run it on a book to see what it did, step by step.
            </p>
          </header>

          <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
            <input
              ref={input}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                pick(e.target.files?.[0] ?? null)
                e.target.value = ""
              }}
            />
            <button type="button" onClick={() => input.current?.click()} className="h-10 max-w-[320px] truncate rounded-full bg-muted px-4 text-[13.5px] font-semibold hover:bg-muted/70">
              {file ? `📄 ${file.name}` : "Choose a PDF"}
            </button>
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              Engine
              <select
                value={source.kind === "real" ? "real" : source.name}
                onChange={(e) => onSource(e.target.value === "real" ? { kind: "real" } : { kind: "saved", name: e.target.value })}
                className="h-10 rounded-full bg-muted px-3 text-[13.5px] font-semibold text-foreground"
              >
                <option value="real">Real engine (AI calls)</option>
                {SAVED_NAMES.map((n) => (
                  <option key={n} value={n}>
                    Saved run: {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={run.status === "running" || (source.kind === "real" && !file)}
              onClick={start}
              className="h-10 rounded-full bg-brand-600 px-5 text-[13.5px] font-semibold text-white shadow-sm hover:bg-brand-600/90 disabled:opacity-40"
            >
              {run.status === "running" ? `Running… ${(elapsed / 1000).toFixed(1)} s` : "Run auto mode"}
            </button>
            <span className="text-[12.5px] text-muted-foreground">{source.kind === "real" ? "Sends page images to your AI provider. About 2 calls, a few cents." : "Replays a recorded run, no AI call. Load the same PDF to see its pages."}</span>
          </section>

          {run.status === "failed" && (
            <div className="rounded-2xl bg-rose-50 p-4 text-[14px] text-rose-900 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30">
              <b>{run.failure.kind}</b>: {run.failure.detail}
            </div>
          )}

          {shown ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[22px] font-bold tracking-tight">
                  {shown.fileName ?? `The ${shown.source}`}, step by step
                </h2>
                <span className="text-[12.5px] text-muted-foreground">
                  {shown.fileName && `${shown.source} · `}
                  {new Date(shown.at).toLocaleString()}
                  {!pagesFrom && shown.fileName && ` · load ${shown.fileName} to see its pages`}
                </span>
              </div>
              <Walkthrough key={`${shown.rec.id}-${shown.at}`} rec={shown.rec} file={pagesFrom} />
            </>
          ) : (
            run.status !== "running" && <p className="rounded-2xl bg-muted/40 p-6 text-center text-[14px] text-muted-foreground">Choose a PDF and run auto mode. Each step it takes shows here, from its own answer.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (since == null) return
    const id = window.setInterval(() => setNow(performance.now()), 100)
    return () => window.clearInterval(id)
  }, [since])
  return since == null ? 0 : Math.max(0, now - since)
}
