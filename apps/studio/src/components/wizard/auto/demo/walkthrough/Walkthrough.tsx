/* eslint-disable lingui/no-unlocalized-strings -- dev-only demo page for developers, never shown to users */
import { useState, type ReactNode } from "react"
import { useLingui } from "@lingui/react"
import type { SetupRecommendation } from "@adt/types"
import { cn } from "@/lib/utils"
import { FACT_IDS, SETTING_IDS } from "../../engine/ids"
import { FACT_QUESTION } from "../../engine/words"
import { Card, ms, num, Page, Pages, Stat, Tag, WIZARD_NAME, wizardValue } from "../parts"
import { Rulebook } from "../Rulebook"

const BODY = ["story", "lesson", "exercise", "informational"]

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

const PLACEMENT: Record<string, string> = { "text-in-art": "words on the picture", "text-beside-art": "words beside the picture", "text-mostly": "mostly words", "no-text": "no words" }

const STEPS = ["Measure the PDF", "Pick the pages to show the AI", "Reading A: label the pages", "Reading B: four plain questions", "Compare the readings", "Rulebook", "Ask or not", "Result"]

/**
 * One run of the engine, step by step, from its own response: what it measured, which pages each
 * AI reading saw and what it said, how the two compare, the settings the rulebook picked (with a
 * what-if playground), what is asked and why, and the setup the book would be created with.
 * Recorded runs saved before the readings were kept show less in steps 2–4.
 */
export function Walkthrough({ rec, file }: { rec: SetupRecommendation; file: File | null }) {
  return (
    <div className="flex flex-col gap-5">
      <Summary rec={rec} />
      <Measured rec={rec} file={file} />
      <Choose rec={rec} file={file} />
      <Labels rec={rec} file={file} />
      <Questions rec={rec} file={file} />
      <Compare rec={rec} />
      <Rulebook step="6" rec={rec} file={file} />
      <AskOrNot rec={rec} />
      <Result rec={rec} file={file} />
    </div>
  )
}

function Why({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-xl bg-muted/50 px-3.5 py-2.5 text-[13.5px] leading-relaxed">{children}</div>
}

function Table({ head, children, min = 560 }: { head: string[]; children: ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-border">
      <table className="w-full text-left text-[13.5px]" style={{ minWidth: min }}>
        <thead className="bg-muted/50 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_tr]:border-t [&_tr]:border-border/60">{children}</tbody>
      </table>
    </div>
  )
}

function Summary({ rec }: { rec: SetupRecommendation }) {
  const asked = rec.facts.filter((f) => f.ask).length
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-border">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Pages" value={num(rec.pageCount)} />
        <Stat label="Model" value={rec.model.split(":").pop()} hint={rec.model} />
        <Stat label="Total time" value={ms(rec.timings.totalMs)} />
        <Stat label="AI calls" value={rec.usage.calls} hint={rec.secondOpinion ? "Both readings ran" : "Only one reading ran"} />
        <Stat label="Tokens in / out" value={`${num(rec.usage.inputTokens)} / ${num(rec.usage.outputTokens)}`} />
        <Stat label="Questions asked" value={asked} />
      </div>
      <ol className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
        {STEPS.map((s, i) => (
          <li key={s}>
            <b className="text-foreground">{i + 1}.</b> {s}
          </li>
        ))}
      </ol>
      {!rec.secondOpinion && (
        <div className="rounded-xl bg-amber-50 p-3 text-[13.5px] text-amber-900 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
          Only one AI reading finished, so there is no second opinion and nothing is asked.
        </div>
      )}
      {!rec.readings && <p className="text-[12.5px] text-muted-foreground">This recorded run was saved before the engine kept both readings' raw answers, so steps 2–4 show only what the response summarises.</p>}
    </section>
  )
}

function Fact({ label, value, tone = "plain", children }: { label: string; value: ReactNode; tone?: "good" | "info" | "plain" | "warn"; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
        <Tag tone={tone}>{value}</Tag>
      </div>
      <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{children}</p>
    </div>
  )
}

const STORAGE: Record<string, string> = {
  "single-pages": "Each PDF page is one book page. Nothing to join.",
  "spreads-as-wide-pages": "Each PDF page is already a whole opening (wider than tall), so there is nothing to join.",
  "spreads-as-separate-pages": "Facing pages are stored as separate PDF pages and pictures cross the seam, so they are joined into spreads.",
}
const TEXT_LAYER: Record<string, string> = {
  digital: "Real, selectable words. The engine can move the words around and pull the pictures out.",
  scanned: "Pictures of pages with no words in the PDF. The AI has to rebuild the words.",
  "scanned-with-ocr": "Scanned pages with a hidden OCR layer. The words exist but may not be reliable.",
  mixed: "Some pages have real text, some are scans.",
}

function Measured({ rec, file }: { rec: SetupRecommendation; file: File | null }) {
  const m = rec.measured
  return (
    <Card step="1" title="Measure the PDF" kind="measure" aside={<span className="text-[12.5px] text-muted-foreground">{ms(rec.timings.profileMs + rec.timings.factsMs)} · no AI</span>}>
      <p className="mb-3 max-w-[820px] text-[14px] text-muted-foreground">mupdf opens every page and counts what is on it: page sizes, visible and hidden characters, pictures and how much of the page they cover, characters printed on a picture, and vector paths. Nothing is guessed here; these numbers feed the rulebook directly or are passed to the AI as hints.</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Fact label="Page storage" value={m.pageStorage} tone="info">
          {STORAGE[m.pageStorage]} {m.facingPairs} facing pairs looked at, {m.joinedPairs} with a picture crossing the seam. This alone decides Page Grouping.
        </Fact>
        <Fact label="Text layer" value={m.textLayer} tone={m.textLayer === "digital" ? "good" : "warn"}>
          {TEXT_LAYER[m.textLayer]}
        </Fact>
        <Fact label="Text density" value={`${num(Math.round(m.medianChars))} chars / page`}>
          Median characters on a page. Language guessed from the text: {m.language ?? "unknown"}.
        </Fact>
        {m.textOverPicturesShare != null && (
          <Fact label="Words on pictures" value={`${Math.round(m.textOverPicturesShare * 100)}%`}>
            Share of text pages whose words sit over a large picture. A hint for the AI; the readings decide where the words sit.
          </Fact>
        )}
        {m.exerciseCuePages != null && (
          <Fact label="Exercise cues" value={`${m.exerciseCuePages} pages`} tone={m.exerciseCues ? "info" : "plain"}>
            Blanks, answer lines, numbered tasks and instruction verbs, counted without AI. {m.exerciseCues ? "On at least 10% of the pages." : "Under 10% of the pages."}
          </Fact>
        )}
        {m.vectorDiagrams != null && (
          <Fact label="Vector diagrams" value={m.vectorDiagrams ? "yes" : "no"} tone={m.vectorDiagrams ? "info" : "plain"}>
            Drawn charts or diagrams on at least 10% of the pages. With a real text layer this can turn Figure Extraction on.
          </Fact>
        )}
      </div>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[12px] font-semibold text-muted-foreground">Pages behind “page storage”</div>
          <Pages file={file} pages={m.pageStorageEvidence} width={64} />
        </div>
        <div>
          <div className="mb-2 text-[12px] font-semibold text-muted-foreground">Pages behind “text layer”</div>
          <Pages file={file} pages={m.textLayerEvidence} width={64} />
        </div>
      </div>
    </Card>
  )
}

function Choose({ rec, file }: { rec: SetupRecommendation; file: File | null }) {
  const aPages = (rec.readings?.labels?.pages ?? rec.pageLabels).map((p) => p.page)
  const bPages = rec.readings?.questions?.pages ?? null
  const full = aPages.length >= rec.pageCount
  return (
    <Card step="2" title="Pick the pages to show the AI" kind="measure">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-[14px] font-bold">
            Reading A gets {full ? "every page" : `${aPages.length} of ${rec.pageCount} pages`}
          </h3>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Books of 30 pages or fewer are labelled in full. A longer book gets a fixed sample: the opening, pages spread through the middle, and the last few.</p>
          {!full && (
            <div className="mt-2">
              <Pages file={file} pages={aPages} width={44} />
            </div>
          )}
        </div>
        <div>
          <h3 className="text-[14px] font-bold">Reading B gets {bPages ? `${bPages.length} pages` : "a few pages"}</h3>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Chosen from the measurement, inside the book: the first inside page, a page with exercise cues, words on a picture or a diagram if there is one, the middle page and the last inside page, then more to fill the set.</p>
          <div className="mt-2">{bPages ? <Pages file={file} pages={bPages} width={72} /> : <span className="text-[12.5px] text-muted-foreground">Not kept in this recorded run.</span>}</div>
        </div>
      </div>
      <Why>
        Each page goes as an image, and both readings run at the same time with the same model ({rec.model}). Reading A took {ms(rec.timings.labelsMs)}
        {rec.usage.labels ? ` and ${num(rec.usage.labels.inputTokens)} tokens in` : " (did not run)"}; reading B took {ms(rec.timings.questionsMs)}
        {rec.usage.questions ? ` and ${num(rec.usage.questions.inputTokens)} tokens in` : " (did not run)"}.
      </Why>
    </Card>
  )
}

function Labels({ rec, file }: { rec: SetupRecommendation; file: File | null }) {
  const labels = rec.readings?.labels ?? null
  const pages = labels?.pages ?? rec.pageLabels.map((p) => ({ ...p, textPlacement: null as string | null, meaningfulFigure: null as boolean | null }))
  const c = labels?.counts
  const body = c?.body ?? rec.pageLabels.filter((l) => BODY.includes(l.type)).length
  const value = (id: string) => rec.facts.find((f) => f.id === id)?.value ?? "—"
  const flag = (id: string) => labels?.flags.includes(id as never)
  const ties = (id: string) => (labels?.ties as Record<string, string[]> | undefined)?.[id] ?? []
  const pct = (n: number) => (body ? `${Math.round((n / body) * 100)}%` : "—")
  return (
    <Card step="3" title="Reading A: label the pages" kind="ai" aside={<span className="text-[12.5px] text-muted-foreground">the proposal · {ms(rec.timings.labelsMs)}</span>}>
      <p className="mb-3 max-w-[820px] text-[14px] text-muted-foreground">
        The model looks at each page on its own and gives it a type (cover, story, lesson, exercise, informational, front or back matter, blank), where its words sit and whether it has a figure that carries meaning. The book facts are then <b>counted</b> from the labels with fixed thresholds; only body pages vote.
      </p>
      <div className="flex max-h-[460px] flex-wrap gap-3 overflow-y-auto pr-1">
        {pages.map((l) => (
          <Page
            key={l.page}
            file={file}
            page={l.page}
            width={84}
            tone={TYPE_TONE[l.type]}
            label={
              <>
                {l.type}
                {l.textPlacement && <div className="font-normal text-muted-foreground">{PLACEMENT[l.textPlacement] ?? l.textPlacement}</div>}
                {l.meaningfulFigure && <div className="font-normal text-violet-600 dark:text-violet-300">figure</div>}
              </>
            }
          />
        ))}
      </div>
      <div className="mt-4">
        <Table head={["Fact", "Counted from the labels", "Threshold", "Result"]} min={640}>
          <tr>
            <td className="font-semibold">genre</td>
            <td>{c ? `${body} body pages: ${c.story} story, ${c.textbook} textbook, ${c.reference} reference` : `${body} body pages`}</td>
            <td className="text-muted-foreground">most common, needs 60%</td>
            <td>
              <Tag tone="info">{value("genre")}</Tag> {flag("genre") && <Tag tone="warn">close call</Tag>}
            </td>
          </tr>
          <tr>
            <td className="font-semibold">exercises</td>
            <td>{c ? `${c.exercisePages} exercise pages (${pct(c.exercisePages)})` : "—"}</td>
            <td className="text-muted-foreground">0 → none, under half → some, else many</td>
            <td>
              <Tag tone="info">{value("exercises")}</Tag> {flag("exercises") && <Tag tone="warn">close call</Tag>}
            </td>
          </tr>
          <tr>
            <td className="font-semibold">composition</td>
            <td>
              {c
                ? Object.entries(c.placement)
                    .map(([k, n]) => `${PLACEMENT[k] ?? k} ${n}`)
                    .join(", ") || "no body page with words"
                : "where the words sit, on the body pages with text"}
            </td>
            <td className="text-muted-foreground">most common, needs 60%</td>
            <td>
              <Tag tone="info">{value("composition")}</Tag> {flag("composition") && <Tag tone="warn">close call</Tag>}
            </td>
          </tr>
          <tr>
            <td className="font-semibold">diagrams</td>
            <td>{c ? `${c.figurePages} pages with a figure that carries meaning (${pct(c.figurePages)})` : "—"}</td>
            <td className="text-muted-foreground">0 → none, under a third → some, else many</td>
            <td>
              <Tag tone="info">{value("diagrams")}</Tag> {flag("diagrams") && <Tag tone="warn">close call</Tag>}
            </td>
          </tr>
        </Table>
      </div>
      {labels && FACT_IDS.some((id) => ties(id).length > 1) && (
        <Why>
          Ties in the count:{" "}
          {FACT_IDS.filter((id) => ties(id).length > 1)
            .map((id) => `${id} (${ties(id).join(" = ")})`)
            .join(", ")}
          . A tie takes reading B's answer.
        </Why>
      )}
      {labels && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          The model's own whole-book guess: <b className="text-foreground">{labels.bookGenre}</b> (not used; the count decides).
        </p>
      )}
    </Card>
  )
}

function Questions({ rec, file }: { rec: SetupRecommendation; file: File | null }) {
  const { i18n } = useLingui()
  const answers = rec.readings?.questions?.answers
  return (
    <Card step="4" title="Reading B: four plain questions" kind="ai" aside={<span className="text-[12.5px] text-muted-foreground">the second opinion · {ms(rec.timings.questionsMs)}</span>}>
      <p className="mb-3 max-w-[820px] text-[14px] text-muted-foreground">The model sees its pages together and answers four questions a teacher could answer from the paper book, and names the language of the words, picking one of the given answers and saying why in its own words. It is also told the measurement (for example, how much text sits on pictures).</p>
      <p className="mb-3 text-[13.5px]">
        Language it saw on the pages: <Tag tone="info">{rec.readings?.questions?.language ?? "—"}</Tag>{" "}
        <span className="text-muted-foreground">
          · used for the book: <b className="text-foreground">{rec.language?.code ?? rec.measured.language ?? "unknown"}</b>
          {rec.language?.source && ` (from ${rec.language.source === "ai" ? "this reading" : rec.language.source === "text" ? "the PDF's text" : "the PDF's language tag"})`}
        </span>
      </p>
      {!rec.secondOpinion ? (
        <p className="text-[13.5px] text-muted-foreground">This reading did not finish.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {FACT_IDS.map((id) => {
            const f = rec.facts.find((x) => x.id === id)
            const a = answers?.[id]
            return (
              <div key={id} className="rounded-xl bg-muted/40 p-3.5">
                <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{id}</div>
                <div className="mt-1 text-[14px] font-semibold">{i18n._(FACT_QUESTION[id])}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Tag tone="info">{a?.answer ?? f?.secondOpinion ?? "—"}</Tag>
                  {a && <span className="text-[12px] text-muted-foreground">confidence: {a.confidence}</span>}
                </div>
                {(a?.reason ?? f?.reason) && <p className="mt-2 text-[13.5px] leading-snug">In the model's words: “{a?.reason ?? f?.reason}”</p>}
                <div className="mt-2">
                  <Pages file={file} pages={a?.evidencePages ?? f?.evidencePages ?? []} width={44} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function Compare({ rec }: { rec: SetupRecommendation }) {
  const differ = rec.facts.filter((f) => f.secondOpinion !== null && f.secondOpinion !== f.value)
  return (
    <Card step="5" title="Compare the two readings" kind="rules">
      <Table head={["Fact", "A · labels (proposal)", "B · questions", "Agree?"]} min={520}>
        {rec.facts.map((f) => {
          const agree = f.secondOpinion === null || f.secondOpinion === f.value
          return (
            <tr key={f.id}>
              <td className="font-semibold">{f.id}</td>
              <td>
                <Tag tone="info">{f.value}</Tag>
              </td>
              <td>{f.secondOpinion === null ? <span className="text-muted-foreground">—</span> : <Tag tone={agree ? "good" : "warn"}>{f.secondOpinion}</Tag>}</td>
              <td>{f.secondOpinion === null ? "—" : agree ? "✓ yes" : "✗ no"}</td>
            </tr>
          )
        })}
      </Table>
      <Why>
        {!rec.secondOpinion
          ? "Only one reading ran, so there is nothing to compare."
          : differ.length === 0
            ? "Both readings agree on all four facts. "
            : `They disagree on ${differ.map((f) => f.id).join(", ")}. `}
        Agreement is the engine's “I'm sure”: in the experiments the model's own confidence caught 0 of 7 wrong facts, while a disagreement between two readings that look at the book differently caught 5 of 5. Reading A's answers are used; reading B only decides whether to ask.
      </Why>
    </Card>
  )
}

function AskOrNot({ rec }: { rec: SetupRecommendation }) {
  const { i18n } = useLingui()
  const asked = rec.facts.filter((f) => f.ask)
  const body = rec.readings?.labels?.counts.body ?? rec.pageLabels.filter((l) => BODY.includes(l.type)).length
  return (
    <Card step="7" title="Ask the user or not" kind="user">
      <p className="mb-3 max-w-[820px] text-[14px] text-muted-foreground">
        A fact is put to the user only when another answer would change a setting <b>and</b> either the two readings disagree, or reading A saw fewer than 2 body pages. This book had {body} body pages.
      </p>
      <Table head={["Fact", "Could change a setting?", "Readings disagree?", "Asked?"]}>
        {rec.facts.map((f) => (
          <tr key={f.id} className={cn(f.ask && "bg-amber-50 dark:bg-amber-500/10")}>
            <td className="font-semibold">{f.id}</td>
            <td>
              {f.matters ? "yes" : "no"}
              {f.affectsLocked && <div className="text-[12px] text-muted-foreground">Touches a setting fixed at import.</div>}
            </td>
            <td>{f.secondOpinion === null ? "—" : f.secondOpinion !== f.value ? "yes" : "no"}</td>
            <td>{f.ask ? <Tag tone="warn">{f.askReason === "few-body-pages" ? "asked: few body pages" : f.askReason === "one-reading" ? "asked: one reading only" : "asked: readings disagree"}</Tag> : <span className="text-muted-foreground">no</span>}</td>
          </tr>
        ))}
      </Table>
      <Why>
        {asked.length === 0 ? (
          "Nothing to ask: the Add Book screen shows what it found as sure picks, one tap each, and the Create button."
        ) : (
          <>
            The Add Book screen asks {asked.length === 1 ? "one question" : `${asked.length} questions`}, each with the engine's guess marked:
            <ol className="mt-1 list-decimal pl-5">
              {asked.map((f) => (
                <li key={f.id}>
                  {i18n._(FACT_QUESTION[f.id])} <span className="text-muted-foreground">(guess: {f.value}, other reading: {f.secondOpinion})</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </Why>
    </Card>
  )
}

function Result({ rec, file }: { rec: SetupRecommendation; file: File | null }) {
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
    <Card step="8" title="Result" kind="rules">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SETTING_IDS.map((id) => (
          <Stat key={id} label={WIZARD_NAME[id]!} value={wizardValue(id, rec.settings[id]?.value)} hint={rec.settings[id]?.rule} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-5">
        <div>
          <div className="mb-2 text-[12px] font-semibold text-muted-foreground">Preview page</div>
          <Page file={file} page={rec.previewPage} width={96} />
        </div>
        <p className="max-w-[640px] text-[13px] text-muted-foreground">
          The user picks the pages to import (every page until they choose).{" "}
          The book is created with these settings and the recommendation id <code>{rec.id}</code>, so it remembers which run picked them. {rec.lockedSettings.length > 0 && `Fixed once created: ${rec.lockedSettings.map((id) => WIZARD_NAME[id]).join(", ")}.`}
        </p>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={() => setRaw((r) => !r)} className="rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted/70">
          {raw ? "Hide" : "Show"} raw response
        </button>
        <button type="button" onClick={download} className="rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-semibold hover:bg-muted/70">
          Download JSON
        </button>
      </div>
      {raw && <pre className="mt-3 max-h-[520px] overflow-auto rounded-xl bg-muted/50 p-3 text-[12px] leading-snug">{JSON.stringify(rec, null, 2)}</pre>}
    </Card>
  )
}
