/* eslint-disable lingui/no-unlocalized-strings -- dev-only demo page for developers, never shown to users */
import { useEffect, useMemo, useRef, useState } from "react"
import { useLingui } from "@lingui/react"
import type { SetupRecommendation } from "@adt/types"
import { FlowTopBar } from "@/components/FlowTopBar"
import { cn } from "@/lib/utils"
import { EngineClientProvider, useEngineClient, type EngineClient } from "../engine/client"
import { useEngineRun } from "../engine/useEngineRun"
import { FACT_QUESTION } from "../engine/words"
import { Card, Kind, ms, num, Page, Pages, Stat, Tag } from "./parts"
import { Rulebook } from "./Rulebook"

// Recorded runs from the lab, dev builds only (they describe real books).
const SAVED: Record<string, () => Promise<SetupRecommendation>> = import.meta.env.DEV ? import.meta.glob<SetupRecommendation>("../lab/fixtures/*.json", { import: "default" }) : {}
const SAVED_NAMES = Object.keys(SAVED).map((k) => k.replace(/^.*\/|\.json$/g, ""))

const TYPE_TONE: Record<string, string> = {
  cover: "ring-2 ring-slate-400",
  "front-matter": "ring-2 ring-slate-300",
  story: "ring-2 ring-sky-400",
  lesson: "ring-2 ring-violet-400",
  exercise: "ring-2 ring-amber-400",
  informational: "ring-2 ring-emerald-400",
  "back-matter": "ring-2 ring-slate-300",
  blank: "opacity-60",
}

type Source = { kind: "real" } | { kind: "saved"; name: string }

/**
 * `/dev/auto-mode`: runs the auto mode engine (E3) on a PDF and lays out every step it takes and
 * what each one found, for walking other developers through it. "Real engine" calls the API with
 * the configured provider (costs a few cents, sends page images to the provider); a saved answer
 * replays a recorded run without any AI call.
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
  const [go, setGo] = useState<{ file: File; n: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const run = useEngineRun(go?.file ?? null, go?.n ?? 0)
  const rec = run.status === "done" ? run.rec : null
  const elapsed = useElapsed(run.status === "running" ? run.startedAt : null)

  const start = (f: File | null = file) => {
    if (!f && source.kind === "real") return
    setGo((g) => ({ file: f ?? new File([], "saved.pdf"), n: (g?.n ?? 0) + 1 }))
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <FlowTopBar title="Auto mode · engine demo" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-6 py-8">
          <header className="flex flex-col gap-2">
            <h1 className="text-[30px] font-bold tracking-tight">How auto mode picks a book's settings</h1>
            <p className="max-w-[820px] text-[15px] text-muted-foreground">
              Engine E3, <code>POST /api/setup-recommendation</code>. It measures the PDF, reads it twice with AI in two different ways, turns the facts into settings with a fixed rulebook, and asks the user only where the two readings disagree on something that would change a setting.
            </p>
          </header>

          <Overview rec={rec} running={run.status === "running"} elapsed={elapsed} />

          <section className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
            <input
              ref={input}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                e.target.value = ""
              }}
            />
            <button type="button" onClick={() => input.current?.click()} className="h-10 rounded-full bg-muted px-4 text-[13.5px] font-semibold hover:bg-muted/70">
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
              onClick={() => start()}
              className="h-10 rounded-full bg-brand-600 px-5 text-[13.5px] font-semibold text-white shadow-sm hover:bg-brand-600/90 disabled:opacity-40"
            >
              {run.status === "running" ? `Running… ${(elapsed / 1000).toFixed(1)} s` : rec ? "Run again" : "Run auto mode"}
            </button>
            <span className="text-[12.5px] text-muted-foreground">
              {source.kind === "real"
                ? "Sends page images to your AI provider. About 2 calls, a few cents."
                : "Replays a recorded run, no AI call. Load the same PDF to see its pages."}
            </span>
          </section>

          {run.status === "failed" && (
            <div className="rounded-2xl bg-rose-50 p-4 text-[14px] text-rose-900 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30">
              <b>{run.failure.kind}</b>: {run.failure.detail}
            </div>
          )}

          {rec && <Result rec={rec} file={file && file.size ? file : null} />}
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

/** The pipeline at a glance; while it runs, the AI steps pulse (the API reports no per-step progress). */
function Overview({ rec, running, elapsed }: { rec: SetupRecommendation | null; running: boolean; elapsed: number }) {
  const steps = [
    { n: "1", title: "Measure the PDF", kind: "measure" as const, what: "Page sizes, text layer, characters per page, facing pages, language.", time: rec ? ms(rec.timings.profileMs + rec.timings.factsMs) : null },
    { n: "2a", title: "Page-label reading", kind: "ai" as const, what: "Labels every page (short books) or a sample. Facts are counted from the labels. This is the proposal.", time: rec ? ms(rec.timings.labelsMs) : null },
    { n: "2b", title: "Questions reading", kind: "ai" as const, what: "6 pages, 4 plain questions a teacher could answer. This is the second opinion.", time: rec ? ms(rec.timings.questionsMs) : null },
    { n: "3", title: "Rulebook", kind: "rules" as const, what: "Facts → the 6 wizard settings, for every combination.", time: rec ? "instant" : null },
    { n: "4", title: "Ask only if needed", kind: "user" as const, what: "A fact is asked when it changes a setting AND the readings disagree (or too few body pages were seen).", time: rec ? `${rec.facts.filter((f) => f.ask).length} asked` : null },
  ]
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch gap-2">
      {steps.map((s, i) => {
        if (s.n === "2b") return null
        const box = (st: typeof s) => (
          <div key={st.n} className={cn("flex flex-col gap-1.5 rounded-2xl bg-card p-3.5 ring-1 ring-border", running && st.kind === "ai" && "animate-pulse ring-violet-300 motion-reduce:animate-none")}>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-muted-foreground">{st.n}</span>
              <span className="text-[14px] font-bold">{st.title}</span>
            </div>
            <Kind kind={st.kind} />
            <p className="text-[12.5px] leading-snug text-muted-foreground">{st.what}</p>
            {st.time && <span className="mt-auto text-[12px] font-semibold tabular-nums">{st.time}</span>}
            {running && st.kind === "ai" && <span className="mt-auto text-[12px] font-semibold tabular-nums text-violet-600">{(elapsed / 1000).toFixed(1)} s…</span>}
          </div>
        )
        return [
          i > 0 && (
            <span key={`arrow-${s.n}`} className="self-center text-muted-foreground">
              →
            </span>
          ),
          s.n === "2a" ? (
            <div key="ai" className="flex flex-col gap-2">
              {box(s)}
              <span className="text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">in parallel</span>
              {box(steps[2]!)}
            </div>
          ) : (
            box(s)
          ),
        ]
      })}
    </div>
  )
}

function Result({ rec, file }: { rec: SetupRecommendation; file: File | null }) {
  const { i18n } = useLingui()
  const asked = rec.facts.filter((f) => f.ask)
  const [raw, setRaw] = useState(false)

  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rec, null, 2)], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `auto-mode-${rec.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="grid grid-cols-6 gap-3">
        <Stat label="Pages" value={num(rec.pageCount)} />
        <Stat label="Model" value={rec.model.split(":").pop()} hint={rec.model} />
        <Stat label="Total time" value={ms(rec.timings.totalMs)} />
        <Stat label="AI calls" value={rec.usage.calls} hint={rec.secondOpinion ? "Both readings ran" : "Only one reading ran"} />
        <Stat label="Tokens in / out" value={`${num(rec.usage.inputTokens)} / ${num(rec.usage.outputTokens)}`} />
        <Stat label="Questions for the user" value={asked.length} />
      </div>
      {!rec.secondOpinion && (
        <div className="rounded-xl bg-amber-50 p-3 text-[13.5px] text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
          Only one AI reading finished, so there is no second opinion and nothing is asked.
        </div>
      )}

      <Card step="1" title="Measured from the PDF" kind="measure">
        <div className="mb-4 grid grid-cols-5 gap-3">
          <Stat label="Page storage" value={rec.measured.pageStorage} hint="How the PDF stores two-page openings" />
          <Stat label="Facing pairs / joined" value={`${rec.measured.facingPairs} / ${rec.measured.joinedPairs}`} hint="Pairs looked at / pairs where a picture crosses the seam" />
          <Stat label="Text layer" value={rec.measured.textLayer} />
          <Stat label="Median characters / page" value={num(Math.round(rec.measured.medianChars))} />
          <Stat label="Language" value={rec.measured.language ?? "unknown"} />
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <div className="mb-2 text-[12px] font-semibold text-muted-foreground">Pages behind “page storage”</div>
            <Pages file={file} pages={rec.measured.pageStorageEvidence} width={56} />
          </div>
          <div>
            <div className="mb-2 text-[12px] font-semibold text-muted-foreground">Pages behind “text layer”</div>
            <Pages file={file} pages={rec.measured.textLayerEvidence} width={56} />
          </div>
        </div>
      </Card>

      <Card step="2a" title="Page-label reading: one label per page" kind="ai" aside={<span className="text-[12.5px] text-muted-foreground">{rec.pageLabels.length} pages labelled · {ms(rec.timings.labelsMs)} · {rec.usage.labels ? `${num(rec.usage.labels.inputTokens)} tokens in` : "did not run"}</span>}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {Object.entries(countBy(rec.pageLabels.map((l) => l.type))).map(([t, n]) => (
            <Tag key={t}>
              {t} · {n}
            </Tag>
          ))}
        </div>
        <div className="flex max-h-[420px] flex-wrap gap-2.5 overflow-y-auto pr-1">
          {rec.pageLabels.map((l) => (
            <Page key={l.page} file={file} page={l.page} width={64} label={l.type} tone={TYPE_TONE[l.type]} />
          ))}
        </div>
        {rec.pageRange && (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Suggested pages to import: <b className="text-foreground">{rec.pageRange.start}–{rec.pageRange.end}</b>
            {rec.pageRange.keepCover && " (cover kept)"}
            {rec.pageRange.skipped.map((s) => ` · skips ${s.from}–${s.to} (${s.why})`).join("")}. The user always picks the Page Range; this is only the default.
          </p>
        )}
      </Card>

      <Card step="2b" title="The 4 facts: proposal vs second opinion" kind="ai" aside={<span className="text-[12.5px] text-muted-foreground">{ms(rec.timings.questionsMs)} · {rec.usage.questions ? `${num(rec.usage.questions.inputTokens)} tokens in` : "did not run"}</span>}>
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-semibold">Fact</th>
              <th className="py-2 pr-3 font-semibold">2a labels say</th>
              <th className="py-2 pr-3 font-semibold">2b questions say</th>
              <th className="py-2 pr-3 font-semibold">Changes a setting?</th>
              <th className="py-2 pr-3 font-semibold">Ask the user?</th>
              <th className="py-2 font-semibold">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rec.facts.map((f) => {
              const agree = f.secondOpinion === null || f.secondOpinion === f.value
              return (
                <tr key={f.id} className={cn("border-b border-border/60 align-top", f.ask && "bg-amber-50 dark:bg-amber-500/10")}>
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold">{f.id}</div>
                    <div className="text-[12px] text-muted-foreground">{i18n._(FACT_QUESTION[f.id])}</div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Tag tone="info">{f.value}</Tag>
                  </td>
                  <td className="py-2.5 pr-3">
                    {f.secondOpinion === null ? <span className="text-muted-foreground">—</span> : <Tag tone={agree ? "good" : "warn"}>{f.secondOpinion}</Tag>}
                    {f.reason && <div className="mt-1 max-w-[300px] text-[12.5px] text-muted-foreground">“{f.reason}”</div>}
                  </td>
                  <td className="py-2.5 pr-3">
                    {f.matters ? <Tag tone="info">yes</Tag> : <span className="text-muted-foreground">no</span>}
                    {f.affectsLocked && (
                      <div className="mt-1">
                        <Tag tone="bad">a locked one</Tag>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">{f.ask ? <Tag tone="warn">{f.askReason === "readings-disagree" ? "yes: readings disagree" : "yes: few body pages"}</Tag> : <span className="text-muted-foreground">no</span>}</td>
                  <td className="py-2.5">
                    <Pages file={file} pages={f.evidencePages} width={40} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Why two readings: in the experiments the model's own confidence caught 0 of 7 wrong facts; the disagreement between two different readings caught 5 of 5.
        </p>
      </Card>

      <Rulebook rec={rec} file={file} />

      <Card step="4" title="What the user sees" kind="user">
        {asked.length === 0 ? (
          <p className="text-[14px]">No questions. A one-line summary of the setup and the Create button.</p>
        ) : (
          <ol className="flex flex-col gap-2 text-[14px]">
            {asked.map((f, i) => (
              <li key={f.id}>
                <b>
                  {i + 1} of {asked.length}:
                </b>{" "}
                {i18n._(FACT_QUESTION[f.id])} <span className="text-muted-foreground">(our guess: {f.value}, other reading: {f.secondOpinion})</span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          The book is created with these settings and the recommendation id <code>{rec.id}</code>, so the book remembers which run picked them.
        </p>
      </Card>

      <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRaw((r) => !r)} className="rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted/70">
            {raw ? "Hide" : "Show"} raw response
          </button>
          <button type="button" onClick={download} className="rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted/70">
            Download JSON
          </button>
        </div>
        {raw && <pre className="mt-3 max-h-[520px] overflow-auto rounded-xl bg-muted/50 p-3 text-[12px] leading-snug">{JSON.stringify(rec, null, 2)}</pre>}
      </section>
    </>
  )
}

function countBy(xs: string[]) {
  const out: Record<string, number> = {}
  for (const x of xs) out[x] = (out[x] ?? 0) + 1
  return out
}
