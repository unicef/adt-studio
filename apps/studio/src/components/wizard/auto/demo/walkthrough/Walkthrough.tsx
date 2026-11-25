/* eslint-disable lingui/no-unlocalized-strings -- dev-only demo page for developers, never shown to users */
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useLingui } from "@lingui/react"
import type { SetupBookFactId, SetupRecommendation, SetupSettingId } from "@adt/types"
import { cn } from "@/lib/utils"
import { RULE_WHY } from "../../engine/words"
import { Card, ms, num, Page, Pages, Stat, Tag, WIZARD_NAME, wizardValue } from "../parts"

/** What `measure-one.ts` printed for the book (no AI), plus the 6 recorded runs and the user's right settings. */
type Measure = {
  profileMs: number
  fileBytes: number
  plan: { full: boolean; all: number[] }
  measured: {
    pageStorage: { value: string; pairs: number; seams: number; wideShare: number; evidence: number[] }
    textLayer: { value: string; scannedPages: number; ocrPages: number; pages: number }
    textOverPictures: { value: boolean; share: number }
    pictureHeavy: { value: boolean; medianCoverage: number }
    textDensity: { medianChars: number; class: string }
    vectorDiagrams: { value: boolean; pagesWithDiagrams: number }
    exerciseCues: { value: boolean; pagesWithCues: number }
    language: { guess: string | null }
  }
  pages: { page: number; w: number; h: number; chars: number; invisible: number; images: number; imageCoverage: number; textOverImage: number; paths: number }[]
  runs: { model: string; run: number; facts: Record<SetupBookFactId, [string, string | null]>; settings: Record<SetupSettingId, string | boolean>; asked: number; totalMs: number; tokensIn: number; tokensOut: number }[]
  right: Record<SetupSettingId, string | boolean>
}

const FACTS: SetupBookFactId[] = ["genre", "exercises", "composition", "diagrams"]
const SETTINGS: SetupSettingId[] = ["preset", "renderStrategy", "pageGrouping", "sectioningMode", "activitiesGenerator", "figureExtraction"]

/** The engine's own wording, as of this branch (packages/pipeline/src/setup-recommender/readings.ts). */
const ASKED: Record<SetupBookFactId, { ask: string; answer: Record<string, string> }> = {
  genre: { ask: "What is this book mostly?", answer: { story: "A story. Readers follow characters or events from start to end…", textbook: "A schoolbook…", reference: "Something people read to find information…" } },
  exercises: { ask: "Does the book ask the reader to write or mark answers? (Colouring and drawing do not count.)", answer: { none: "No. The reader only reads, or colours and draws…", some: "Yes, on a few pages…", many: "Yes, on most pages." } },
  composition: { ask: "Where are the words on a page?", answer: { "text-in-art": "Printed on the picture itself, for example over the sky or the grass.", "text-beside-art": "In their own space: above, below or next to the picture, or on the opposite page.", "text-mostly": "It is mostly words. Pictures are few or small." } },
  diagrams: { ask: "Are there pictures with labels that explain something, like maps, charts, diagrams or labelled drawings?", answer: { none: "No. Only illustrations or photos…", some: "Yes, a few.", many: "Yes, on many pages." } },
}

// Recorded data about a real book, dev builds only (like the lab's fixtures).
const FILES: Record<string, () => Promise<unknown>> = import.meta.env.DEV ? import.meta.glob("./raven-*.json", { import: "default" }) : {}
const load = import.meta.env.DEV
  ? () => Promise.all([FILES["./raven-run.json"]!(), FILES["./raven-measure.json"]!()]).then(([rec, m]) => ({ rec: rec as SetupRecommendation, m: m as Measure }))
  : null

/**
 * One real book, step by step: what the engine measured in Raven, what each AI reading said, how
 * the rulebook turned that into settings, why nothing was asked, and how it compares with the right
 * settings. Built from a recorded run (round 2, gpt-5.4-mini run 1) and a local measurement; no AI call.
 */
export function Walkthrough() {
  const [data, setData] = useState<{ rec: SetupRecommendation; m: Measure } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    void load?.().then(setData)
  }, [])
  if (!load) return <p className="text-[14px] text-muted-foreground">The walkthrough uses recorded runs of a real book, so it only exists in dev builds.</p>
  if (!data) return <p className="text-[14px] text-muted-foreground">Loading the recorded run…</p>
  const { rec, m } = data

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-border">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[22px] font-bold tracking-tight">Raven, step by step</h2>
            <p className="max-w-[760px] text-[14px] text-muted-foreground">
              A 12-page picture book: a story about Hyena and Raven, one landscape page per opening, a picture on one side and a few lines of text on the other. Everything below comes from a recorded run (round 2, <code>gpt-5.4-mini</code>, run 1) and a local measurement of the PDF, so this page makes no AI call.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <input
              ref={input}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                e.target.value = ""
              }}
            />
            <button type="button" onClick={() => input.current?.click()} className="h-10 rounded-full bg-muted px-4 text-[13.5px] font-semibold hover:bg-muted/70">
              {file ? `📄 ${file.name}` : "Load raven.pdf to see the pages"}
            </button>
            <span className="text-[12px] text-muted-foreground">Stays in your browser. Without it, pages show as numbers.</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Pages" value={rec.pageCount} />
          <Stat label="Page size" value={`${m.pages[0]!.w} × ${m.pages[0]!.h} pt`} hint="Wider than tall: landscape" />
          <Stat label="File" value={`${(m.fileBytes / 1e6).toFixed(1)} MB`} />
          <Stat label="Total time" value={ms(rec.timings.totalMs)} />
          <Stat label="AI calls" value={rec.usage.calls} />
          <Stat label="Questions asked" value={rec.facts.filter((f) => f.ask).length} />
        </div>
        <ol className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
          {["Measure the PDF", "Pick the pages to show the AI", "Reading A: label every page", "Reading B: four plain questions", "Compare the readings", "Rulebook", "Ask or not", "Result"].map((s, i) => (
            <li key={s}>
              <b className="text-foreground">{i + 1}.</b> {s}
            </li>
          ))}
        </ol>
      </section>

      <Measured m={m} file={file} />
      <Choose m={m} rec={rec} file={file} />
      <Labels rec={rec} file={file} />
      <Questions rec={rec} file={file} />
      <Compare rec={rec} />
      <Rules rec={rec} m={m} />
      <AskOrNot rec={rec} />
      <Result rec={rec} m={m} />
    </div>
  )
}

function Why({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-xl bg-muted/50 px-3.5 py-2.5 text-[13.5px] leading-relaxed">{children}</div>
}

function Measured({ m, file }: { m: Measure; file: File | null }) {
  const x = m.measured
  return (
    <Card step="1" title="Measure the PDF" kind="measure" aside={<span className="text-[12.5px] text-muted-foreground">{ms(m.profileMs)} · no AI</span>}>
      <p className="mb-3 max-w-[820px] text-[14px] text-muted-foreground">mupdf opens every page and counts what is on it: size, visible and hidden characters, pictures and how much of the page they cover, characters printed on a picture, and vector paths. Nothing is guessed here.</p>
      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full min-w-[640px] text-left text-[13px] tabular-nums">
          <thead className="bg-muted/50 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              {["Page", "Size (pt)", "Characters", "Hidden (OCR)", "Pictures", "Picture cover", "Chars on a picture", "Vector paths"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.pages.map((p) => (
              <tr key={p.page} className="border-t border-border/60">
                <td className="px-3 py-1.5 font-semibold">{p.page}</td>
                <td className="px-3 py-1.5">
                  {p.w} × {p.h}
                </td>
                <td className="px-3 py-1.5">{p.chars}</td>
                <td className="px-3 py-1.5">{p.invisible}</td>
                <td className="px-3 py-1.5">{p.images}</td>
                <td className="px-3 py-1.5">{Math.round(p.imageCoverage * 100)}%</td>
                <td className="px-3 py-1.5">{p.textOverImage}</td>
                <td className="px-3 py-1.5">{p.paths}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mb-2 mt-5 text-[14px] font-bold">What the numbers say</h3>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Fact label="Page storage" value="wide pages" tone="info">
          All {m.pages.length} pages are wider than tall ({Math.round(x.pageStorage.wideShare * 100)}% wide), so each PDF page already holds a whole opening. No picture crosses a seam between two PDF pages ({x.pageStorage.seams} seams in {x.pageStorage.pairs} pairs), so there are no split spreads to join.
        </Fact>
        <Fact label="Text layer" value={x.textLayer.value} tone="good">
          Real, selectable words: {x.textLayer.scannedPages} scanned pages, {x.textLayer.ocrPages} with hidden OCR text. So the engine can move the words around and pull pictures out.
        </Fact>
        <Fact label="Words on pictures" value={`${Math.round(x.textOverPictures.share * 100)}%`} tone="plain">
          No character sits on a picture: the text and the picture are in separate parts of the page. This is a measured hint; the AI readings decide the composition.
        </Fact>
        <Fact label="Text density" value={`${x.textDensity.medianChars} chars / page`} tone="plain">
          About one sentence per page ({x.textDensity.class}). The back page (p. 12) has the most text: credits. Pictures cover {Math.round(x.pictureHeavy.medianCoverage * 100)}% of a typical page.
        </Fact>
        <Fact label="Vector diagrams" value={x.vectorDiagrams.value ? "yes" : "none"} tone="plain">
          3 vector paths per page, the same on every page: page furniture, not charts or diagrams.
        </Fact>
        <Fact label="Exercise cues" value={`${x.exerciseCues.pagesWithCues} pages`} tone="plain">
          No blanks, answer lines or numbered tasks in the text. Language guessed from the text: {x.language.guess ?? "unknown"}.
        </Fact>
      </div>
      <div className="mt-4">
        <div className="mb-2 text-[12px] font-semibold text-muted-foreground">Pages behind “wide pages”</div>
        <Pages file={file} pages={x.pageStorage.evidence} width={96} />
      </div>
    </Card>
  )
}

function Fact({ label, value, tone, children }: { label: string; value: ReactNode; tone: "good" | "info" | "plain"; children: ReactNode }) {
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

function Choose({ m, rec, file }: { m: Measure; rec: SetupRecommendation; file: File | null }) {
  const qPages = [2, 3, 4, 5, 7, 11]
  return (
    <Card step="2" title="Pick the pages to show the AI" kind="measure">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-[14px] font-bold">Reading A gets every page</h3>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            Books of 30 pages or fewer are labelled in full, so all {m.plan.all.length} pages go. (A long book gets a fixed sample: the opening, 10 pages spread through the middle, and the last 4.)
          </p>
        </div>
        <div>
          <h3 className="text-[14px] font-bold">Reading B gets 6 pages</h3>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Chosen from the measurement, inside the book (not the covers): the first inside page, a page with exercise cues, words on a picture or a diagram if there is one (none here), the middle page and the last inside page, then the next ones to make 6.</p>
          <div className="mt-2">
            <Pages file={file} pages={qPages} width={80} />
          </div>
        </div>
      </div>
      <Why>
        Each page goes as an image, and both readings run at the same time with the same model ({rec.model}). Reading A took {ms(rec.timings.labelsMs)} and {num(rec.usage.labels?.inputTokens ?? 0)} tokens in; reading B took {ms(rec.timings.questionsMs)} and {num(rec.usage.questions?.inputTokens ?? 0)} tokens in.
      </Why>
    </Card>
  )
}

const TONE: Record<string, string> = { cover: "ring-2 ring-slate-400", story: "ring-2 ring-sky-400", "back-matter": "ring-2 ring-slate-300" }

function Labels({ rec, file }: { rec: SetupRecommendation; file: File | null }) {
  const body = rec.pageLabels.filter((l) => ["story", "lesson", "exercise", "informational"].includes(l.type))
  return (
    <Card step="3" title="Reading A: label every page" kind="ai" aside={<span className="text-[12.5px] text-muted-foreground">the proposal</span>}>
      <p className="mb-3 max-w-[820px] text-[14px] text-muted-foreground">
        The model looks at each page on its own and gives it a type (cover, story, lesson, exercise, informational, front or back matter, blank), where its words sit (on the picture, beside it, text only, no text) and whether it has a figure that carries meaning. The book facts are then <b>counted</b> from the labels with fixed thresholds.
      </p>
      <div className="flex flex-wrap gap-3">
        {rec.pageLabels.map((l) => (
          <Page key={l.page} file={file} page={l.page} width={88} label={l.type} tone={TONE[l.type]} />
        ))}
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full min-w-[620px] text-left text-[13.5px]">
          <thead className="bg-muted/50 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Fact</th>
              <th className="px-3 py-2 font-semibold">Counted from the labels</th>
              <th className="px-3 py-2 font-semibold">Threshold</th>
              <th className="px-3 py-2 font-semibold">Result</th>
            </tr>
          </thead>
          <tbody className="[&_td]:px-3 [&_td]:py-2 [&_tr]:border-t [&_tr]:border-border/60">
            <tr>
              <td className="font-semibold">genre</td>
              <td>
                {body.length} body pages (cover and back page don't vote): {body.filter((l) => l.type === "story").length} story
              </td>
              <td className="text-muted-foreground">most common type, needs 60%</td>
              <td>
                <Tag tone="info">story</Tag> 100%
              </td>
            </tr>
            <tr>
              <td className="font-semibold">exercises</td>
              <td>0 exercise pages</td>
              <td className="text-muted-foreground">0 → none, under half → some, else many</td>
              <td>
                <Tag tone="info">none</Tag>
              </td>
            </tr>
            <tr>
              <td className="font-semibold">composition</td>
              <td>where the words sit, on the body pages with text</td>
              <td className="text-muted-foreground">most common placement, needs 60%</td>
              <td>
                <Tag tone="info">beside the picture</Tag>
              </td>
            </tr>
            <tr>
              <td className="font-semibold">diagrams</td>
              <td>0 pages with a figure that carries meaning</td>
              <td className="text-muted-foreground">0 → none, under a third → some, else many</td>
              <td>
                <Tag tone="info">none</Tag>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {rec.pageRange && (
        <Why>
          The labels also give the pages to import: the first body page followed by another body page starts it, the last body page ends it. Here: <b>pages {rec.pageRange.start}–{rec.pageRange.end}</b>, the cover kept, page 12 (credits) left out. The user can always change the range.
        </Why>
      )}
      <p className="mt-2 text-[12.5px] text-muted-foreground">The recorded run keeps each page's type but not its placement or figure flag, so the per-page placement count can't be shown. Keeping them is one of the review fixes in progress.</p>
    </Card>
  )
}

function Questions({ rec, file }: { rec: SetupRecommendation; file: File | null }) {
  return (
    <Card step="4" title="Reading B: four plain questions" kind="ai" aside={<span className="text-[12.5px] text-muted-foreground">the second opinion</span>}>
      <p className="mb-3 max-w-[820px] text-[14px] text-muted-foreground">The model sees the 6 pages together and answers four questions a teacher could answer from the paper book, picking one of the given answers and saying why in its own words. It is also told the measurement (for example, how much text sits on pictures).</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {FACTS.map((id) => {
          const f = rec.facts.find((x) => x.id === id)!
          return (
            <div key={id} className="rounded-xl bg-muted/40 p-3.5">
              <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{id}</div>
              <div className="mt-1 text-[14px] font-semibold">{ASKED[id].ask}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Tag tone="info">{f.secondOpinion}</Tag>
                <span className="text-[12.5px] text-muted-foreground">“{ASKED[id].answer[f.secondOpinion ?? ""]}”</span>
              </div>
              {f.reason && <p className="mt-2 text-[13.5px] leading-snug">Why, in the model's words: “{f.reason}”</p>}
              <div className="mt-2">
                <Pages file={file} pages={f.evidencePages} width={44} />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function Compare({ rec }: { rec: SetupRecommendation }) {
  return (
    <Card step="5" title="Compare the two readings" kind="rules">
      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full min-w-[520px] text-left text-[13.5px]">
          <thead className="bg-muted/50 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Fact</th>
              <th className="px-3 py-2 font-semibold">A · labels (proposal)</th>
              <th className="px-3 py-2 font-semibold">B · questions</th>
              <th className="px-3 py-2 font-semibold">Agree?</th>
            </tr>
          </thead>
          <tbody>
            {rec.facts.map((f) => (
              <tr key={f.id} className="border-t border-border/60">
                <td className="px-3 py-2 font-semibold">{f.id}</td>
                <td className="px-3 py-2">
                  <Tag tone="info">{f.value}</Tag>
                </td>
                <td className="px-3 py-2">
                  <Tag tone={f.secondOpinion === f.value ? "good" : "warn"}>{f.secondOpinion}</Tag>
                </td>
                <td className="px-3 py-2">{f.secondOpinion === f.value ? "✓ yes" : "✗ no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Why>
        Both readings agree on all four facts. Agreement is the engine's "I'm sure": in the experiments the model's own confidence caught 0 of 7 wrong facts, while a disagreement between two readings that look at the book differently caught 5 of 5. Reading A's answers are used; reading B only decides whether to ask.
      </Why>
    </Card>
  )
}

/** How the rulebook got to each of Raven's settings, in order of the checks it makes. */
const PATH: Record<SetupSettingId, string> = {
  preset: "genre = story → Storybook. The preset follows the genre one to one.",
  renderStrategy: "Not Reference (→ Single Column), not Textbook (→ Dynamic). A story, so the composition decides: words on the picture → Fixed Layout (or Overlay for a scan); words beside the picture → Two Columns Story; mostly words → Dynamic. Raven's words sit beside the picture → Two Columns Story.",
  pageGrouping: "Measured: pages are already wide (each holds an opening) → Single Page. Split spreads would give Spread.",
  sectioningMode: "Dynamic only for a Textbook with exercises. A story → Per Page.",
  activitiesGenerator: "On only for a Textbook with exercises (Storybook drops activity sections anyway). No exercises → Off.",
  figureExtraction: "Auto when there's a real text layer and diagrams (from the AI or measured vector paths). Digital text but no diagrams → Off.",
}

function Rules({ rec, m }: { rec: SetupRecommendation; m: Measure }) {
  const { i18n } = useLingui()
  const key = (o: Partial<Record<SetupBookFactId, string>>) => FACTS.map((id) => o[id] ?? rec.facts.find((f) => f.id === id)!.value).join("|")
  const whatIf: { change: string; facts: Partial<Record<SetupBookFactId, string>> }[] = [
    { change: "words on the picture", facts: { composition: "text-in-art" } },
    { change: "mostly words", facts: { composition: "text-mostly" } },
    { change: "a schoolbook with some exercises", facts: { genre: "textbook", exercises: "some" } },
    { change: "a few labelled diagrams", facts: { diagrams: "some" } },
  ]
  const now = rec.settingsByFacts[key({})]!
  return (
    <Card step="6" title="Rulebook: facts → settings" kind="rules" aside={<span className="text-[12.5px] text-muted-foreground">no AI · same facts, same settings</span>}>
      <p className="mb-3 max-w-[820px] text-[14px] text-muted-foreground">A fixed function turns the measured facts and the four book facts into the six wizard settings. Each setting records the rule that fired, which is what the Add Book screen explains in plain words.</p>
      <div className="flex flex-col gap-2">
        {SETTINGS.map((id) => {
          const s = rec.settings[id]!
          const why = RULE_WHY[s.rule]
          return (
            <div key={id} className="grid gap-2 rounded-xl bg-muted/40 p-3 sm:grid-cols-[180px_1fr]">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{WIZARD_NAME[id]}</div>
                <div className="mt-0.5 text-[15px] font-bold">{wizardValue(id, s.value)}</div>
                <code className="text-[11.5px] text-muted-foreground">{s.rule}</code>
              </div>
              <div className="text-[13.5px] leading-snug">
                <div>{PATH[id]}</div>
                {why && <div className="mt-1 text-muted-foreground">Shown to the user: “{i18n._(why)}”</div>}
              </div>
            </div>
          )
        })}
      </div>
      <h3 className="mb-2 mt-5 text-[14px] font-bold">What if the readings had said something else?</h3>
      <p className="mb-2 text-[13px] text-muted-foreground">The engine sends the settings for all 81 combinations of the four facts, so these come straight from Raven's response. Only what would change is listed.</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {whatIf.map((w) => {
          const row = rec.settingsByFacts[key(w.facts)]!
          const diff = SETTINGS.filter((id) => row[id]?.value !== now[id]?.value)
          return (
            <div key={w.change} className="rounded-xl p-3 ring-1 ring-border">
              <div className="text-[13.5px] font-semibold">If Raven were {w.change}</div>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-[13px]">
                {diff.length ? (
                  diff.map((id) => (
                    <li key={id}>
                      {WIZARD_NAME[id]}: <span className="text-muted-foreground line-through">{wizardValue(id, now[id]?.value)}</span> → <b>{wizardValue(id, row[id]?.value)}</b>
                    </li>
                  ))
                ) : (
                  <li className="text-muted-foreground">No setting changes.</li>
                )}
              </ul>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[12.5px] text-muted-foreground">
        Page Grouping never changes in these rows: it comes from the measurement ({m.measured.pageStorage.value}), not from the AI.
      </p>
    </Card>
  )
}

function AskOrNot({ rec }: { rec: SetupRecommendation }) {
  const body = rec.pageLabels.filter((l) => ["story", "lesson", "exercise", "informational"].includes(l.type)).length
  return (
    <Card step="7" title="Ask the user or not" kind="user">
      <p className="mb-3 max-w-[820px] text-[14px] text-muted-foreground">
        A fact is put to the user only when another answer would change a setting <b>and</b> either the two readings disagree, or reading A saw fewer than 2 body pages. Raven had {body} body pages.
      </p>
      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full min-w-[560px] text-left text-[13.5px]">
          <thead className="bg-muted/50 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Fact</th>
              <th className="px-3 py-2 font-semibold">Could change a setting?</th>
              <th className="px-3 py-2 font-semibold">Readings disagree?</th>
              <th className="px-3 py-2 font-semibold">Asked?</th>
            </tr>
          </thead>
          <tbody>
            {rec.facts.map((f) => (
              <tr key={f.id} className="border-t border-border/60 align-top">
                <td className="px-3 py-2 font-semibold">{f.id}</td>
                <td className="px-3 py-2">
                  {f.matters ? "yes" : "no"}
                  {f.id === "exercises" && <div className="text-[12px] text-muted-foreground">In a story Activities stay Off and sections stay Per Page whatever the answer.</div>}
                  {f.affectsLocked && <div className="text-[12px] text-muted-foreground">Touches a setting fixed at import (Figure Extraction).</div>}
                </td>
                <td className="px-3 py-2">{f.secondOpinion !== f.value ? "yes" : "no"}</td>
                <td className="px-3 py-2">{f.ask ? <Tag tone="warn">asked</Tag> : <span className="text-muted-foreground">no</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Why>Nothing to ask, so the Add Book screen says what it found, shows the setup in plain words and the Create button. The user can still open any setting or "Set it up myself".</Why>
    </Card>
  )
}

function Result({ rec, m }: { rec: SetupRecommendation; m: Measure }) {
  const same = m.runs.every((r) => SETTINGS.every((id) => r.settings[id] === m.runs[0]!.settings[id]))
  return (
    <Card step="8" title="Result" kind="rules">
      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full min-w-[560px] text-left text-[13.5px]">
          <thead className="bg-muted/50 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Setting</th>
              <th className="px-3 py-2 font-semibold">Engine</th>
              <th className="px-3 py-2 font-semibold">Your right setting</th>
              <th className="px-3 py-2 font-semibold">Runs that match</th>
            </tr>
          </thead>
          <tbody>
            {SETTINGS.map((id) => {
              const ok = rec.settings[id]!.value === m.right[id]
              const n = m.runs.filter((r) => r.settings[id] === m.right[id]).length
              return (
                <tr key={id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-semibold">{WIZARD_NAME[id]}</td>
                  <td className="px-3 py-2">{wizardValue(id, rec.settings[id]!.value)}</td>
                  <td className="px-3 py-2">{wizardValue(id, m.right[id])}</td>
                  <td className={cn("px-3 py-2 font-semibold", ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>
                    {ok ? "✓" : "✗"} {n}/{m.runs.length}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <h3 className="mb-2 mt-5 text-[14px] font-bold">Is it consistent?</h3>
      <div className="overflow-x-auto rounded-xl ring-1 ring-border">
        <table className="w-full min-w-[560px] text-left text-[13px] tabular-nums">
          <thead className="bg-muted/50 text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Run</th>
              <th className="px-3 py-2 font-semibold">Facts (A = B?)</th>
              <th className="px-3 py-2 font-semibold">Asked</th>
              <th className="px-3 py-2 font-semibold">Time</th>
              <th className="px-3 py-2 font-semibold">Tokens in / out</th>
            </tr>
          </thead>
          <tbody>
            {m.runs.map((r) => (
              <tr key={`${r.model}-${r.run}`} className="border-t border-border/60">
                <td className="px-3 py-1.5">
                  {r.model} #{r.run}
                </td>
                <td className="px-3 py-1.5">{FACTS.every((f) => r.facts[f][0] === r.facts[f][1]) ? "all 4 agree" : FACTS.filter((f) => r.facts[f][0] !== r.facts[f][1]).join(", ") + " differ"}</td>
                <td className="px-3 py-1.5">{r.asked}</td>
                <td className="px-3 py-1.5">{ms(r.totalMs)}</td>
                <td className="px-3 py-1.5">
                  {num(r.tokensIn)} / {num(r.tokensOut)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Why>
        {same ? "All 6 runs, on both models, gave the same facts and the same settings, and none asked a question." : "The runs didn't all give the same settings."} Raven is the easy case: real text, clear pages, both readings agree. The hard ones are books where the readings disagree on where the words sit (Volcanoes, Capítulo 01) or where a schoolbook's tasks aren't answered in the book (Elements of Computing Systems).
      </Why>
    </Card>
  )
}
