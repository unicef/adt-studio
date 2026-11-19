/**
 * Offline (no LLM calls). Turns saved runs into small JSON files the designer's prototypes load,
 * and measures what each UX flow costs the user (questions to answer) and the loader (time).
 *   tsx export-prototype-data.ts <pdf-dir> <dataset.json> <results-dir> <out-dir> [proposal-variant] [check-variant]
 * Defaults: proposal e5-page-types, check e4-one-call (the pair the round-1/2 screens were built on).
 * Whole books (round 3): `... datasets/whole.json results/whole prototypes/data e12-sampled e13-plain-words-middle`.
 * index.json is merged by book id, so several datasets can be exported into one folder.
 * Writes:
 *   <out-dir>/engine.json       facts and settings catalogue: plain questions, yes/no forms for a
 *                               teaching chat, what each fact can change, rule text per value
 *   <out-dir>/<book>.json       one book: measured facts, AI answers (+reasons, cited pages), page
 *                               labels, flags, settings with the rule behind each, "what if" previews,
 *                               questions that matter, description parses, old one-shot picks
 *   <out-dir>/index.json        book list
 *   <out-dir>/pages/<book>/pN.png  small thumbnails of the pages the AI cites
 *   <results-dir>/flows.json    questions per flow, parser stability, describe-in-parallel cross-check,
 *                               loader time
 * Uses run 1 of E4 (one call, 4 questions) and E5 (page labels) as "the AI's reading", and E4 vs E5
 * disagreement as the flag (the only flag that caught every wrong fact so far).
 * Nothing here changes rules.ts or facts.ts; "questions that matter" are read off the rulebook as it is.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { DECISIONS, loadDataset } from "./dataset.ts"
import type { DeterministicFacts } from "./facts.ts"
import { renderPages } from "./profile.ts"
import { QUESTIONS, type QuestionId } from "./questions.ts"
import { decide, type Explained, type SemanticFacts } from "./rules.ts"
import { PLAIN_QUESTIONS } from "./variants/e10-plain-words.ts"
import { suggestRange } from "./variants/e12-whole-book.ts"
import { LANGS, MEASURED_I18N, PHRASES, QUESTIONS_I18N, SETTINGS_I18N, SHORT_I18N, all as say } from "./prototype-words.ts"

const [pdfDir, datasetFile, resultsDir, outDir, PROPOSAL = "e5-page-types", CHECK = "e4-one-call"] = process.argv.slice(2)
const dataset = loadDataset(datasetFile)
const FACTS = Object.keys(QUESTIONS) as QuestionId[]
type Run = { bookId: string; variant: string; run: number; facts: DeterministicFacts; settings: Explained; trace: any; usage: any; ms: number; profileMs?: number }
const runs: Run[] = readdirSync(resultsDir).filter((f) => /\.run\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(resultsDir, f), "utf8")))
const find = (bookId: string, variant: string, run = 1) => runs.find((r) => r.bookId === bookId && r.variant === variant && r.run === run)

// ---------- catalogue (hand-written plain words; the rule text comes from rules.ts at runtime) ----------
const TEACH: Record<QuestionId, { why: string; yesNo: Record<string, string> }> = {
  genre: {
    why: "Decides the starting preset, and with it how pages are laid out and whether exercises become activities.",
    yesNo: {
      story: "Is this a story that readers follow from start to end?",
      textbook: "Is this a schoolbook, with lessons and tasks for learners?",
      reference: "Is this something people read to find information, like a report, an article or a manual?",
    },
  },
  exercises: {
    why: "Exercises can be turned into interactive activities, and pages that mix reading and exercises get split into sections.",
    yesNo: {
      none: "Is this book only for reading? (Colouring and drawing pages still count as reading.)",
      some: "Does the reader write or mark answers on a few pages?",
      many: "Does the reader write or mark answers on most pages?",
    },
  },
  composition: {
    why: "Decides whether the original page design is kept, or the text is reflowed next to the pictures.",
    yesNo: {
      "text-in-art": "Are the words printed on the pictures themselves?",
      "text-beside-art": "Do the words have their own space, above, below or next to the pictures?",
      "text-mostly": "Is it mostly words, with few or small pictures?",
    },
  },
  diagrams: {
    why: "Diagrams, maps and charts with labels are kept together as one figure so the labels stay readable.",
    yesNo: {
      none: "Are all the pictures plain illustrations or photos (no maps, charts or labelled drawings)?",
      some: "Are there a few maps, charts or labelled drawings?",
      many: "Are there maps, charts or labelled drawings on many pages?",
    },
  },
}
const SETTINGS = {
  preset: { label: "Preset", reversible: true, what: "A bundle of defaults for this kind of book." },
  renderStrategy: { label: "Page layout", reversible: true, what: "How each page is rebuilt: reflowed by the AI, kept as designed, or put in one or two columns." },
  pageGrouping: { label: "Page grouping", reversible: false, what: "Whether facing pages are joined into one screen. Fixed at import." },
  sectioningMode: { label: "Sections", reversible: true, what: "Whether a page is one unit or split into reading and exercise sections." },
  activitiesGenerator: { label: "Activities", reversible: true, what: "Turns the book's exercises into interactive activities." },
  figureExtraction: { label: "Figures", reversible: false, what: "Keeps labelled diagrams together as figures. Fixed at import." },
} as const

/** Which settings a fact can change at all, over every combination of the other facts and of the two measured facts that rules read. */
function influence() {
  const opts = (id: QuestionId) => Object.keys(QUESTIONS[id].options)
  const combos: SemanticFacts[] = []
  for (const g of opts("genre")) for (const e of opts("exercises")) for (const c of opts("composition")) for (const d of opts("diagrams"))
    combos.push({ genre: g, exercises: e, composition: c, diagrams: d } as SemanticFacts)
  const measured: DeterministicFacts[] = []
  for (const tl of ["digital", "scanned"]) for (const vd of [true, false])
    measured.push({ pageStorage: { value: "single-pages" }, textLayer: { value: tl }, vectorDiagrams: { value: vd } } as unknown as DeterministicFacts)
  const out = Object.fromEntries(FACTS.map((f) => [f, new Set<string>()]))
  for (const m of measured) for (const s of combos) for (const f of FACTS) for (const o of opts(f)) {
    const a = decide(m, s), b = decide(m, { ...s, [f]: o } as SemanticFacts)
    for (const d of DECISIONS) if (a[d].value !== b[d].value) out[f].add(d)
  }
  return Object.fromEntries(FACTS.map((f) => [f, DECISIONS.filter((d) => out[f].has(d))]))
}

/** For one book's measured facts and a reading: which facts can still change a setting, and the adaptive order. */
function mattering(m: DeterministicFacts, s: SemanticFacts) {
  const base = decide(m, s)
  const matters = FACTS.filter((f) => Object.keys(QUESTIONS[f].options).some((o) => {
    const alt = decide(m, { ...s, [f]: o } as SemanticFacts)
    return DECISIONS.some((d) => alt[d].value !== base[d].value)
  }))
  return matters // genre first (it drives 4 of 6), then the others in QUESTIONS order
}

/** "What if": settings that change if the user picks another option for a fact. */
function whatIf(m: DeterministicFacts, s: SemanticFacts) {
  const base = decide(m, s)
  return Object.fromEntries(FACTS.map((f) => [f, Object.fromEntries(Object.keys(QUESTIONS[f].options).filter((o) => o !== s[f]).map((o) => {
    const alt = decide(m, { ...s, [f]: o } as SemanticFacts)
    return [o, Object.fromEntries(DECISIONS.filter((d) => alt[d].value !== base[d].value).map((d) => [d, { from: base[d].value, to: alt[d].value, rule: alt[d].rule }]))]
  }))]))
}

const PLAIN: Record<string, Record<string, string>> = {
  genre: { story: "a story", textbook: "learning material", reference: "reference reading" },
  composition: { "text-in-art": "text printed on the pictures", "text-beside-art": "text next to the pictures", "text-mostly": "mostly text" },
  exercises: { none: "no exercises", some: "a few exercises", many: "exercises on most pages" },
  diagrams: { none: "no labelled diagrams", some: "a few labelled diagrams", many: "labelled diagrams throughout" },
}
/** Idea (a): the AI's reading as one sentence, built from the facts with a template (no extra call, same every time). */
function describe(pageCount: number, m: DeterministicFacts, s: SemanticFacts) {
  const storage = m.pageStorage.value === "spreads-as-separate-pages" ? ", with pictures running across facing pages" : m.pageStorage.value === "spreads-as-wide-pages" ? ", stored as wide double pages" : ""
  const scan = m.textLayer.value === "digital" ? "" : " The pages are scanned images."
  const kind = PLAIN.genre[s.genre]
  return `${kind[0].toUpperCase()}${kind.slice(1)}, ${pageCount} pages: ${PLAIN.composition[s.composition]}${storage}, ${PLAIN.exercises[s.exercises]}, ${PLAIN.diagrams[s.diagrams]}.${scan}`
}

/** Pages whose E5 label supports a fact value, for citing when the proposal comes from the page labels. */
type Label = { page: number; type: string; textPlacement: string; meaningfulFigure: boolean }
function supporting(labels: Label[], f: QuestionId, v: string): number[] {
  const pick = (ok: (l: Label) => boolean) => labels.filter(ok).map((l) => l.page)
  if (f === "genre") return pick((l) => (v === "story" ? l.type === "story" : v === "textbook" ? l.type === "lesson" || l.type === "exercise" : l.type === "informational"))
  if (f === "exercises") return pick((l) => l.type === "exercise")
  if (f === "diagrams") return pick((l) => l.meaningfulFigure)
  const place = ({ "text-in-art": "on-art", "text-beside-art": "beside-art", "text-mostly": "text-only" } as Record<string, string>)[v]
  return pick((l) => l.textPlacement === place)
}

const semanticOf = (r?: Run): SemanticFacts | undefined => r?.trace?.semantic

/** Plain words for terms users did not understand (round 1, Ana). The UI should use the right column. */
const WORDS = {
  readings: "the two ways the AI looked at the book (page by page, and the book as a whole)",
  preset: "starting kind of book",
  "front matter": "pages before the book starts: title page, contents, foreword",
  sections: "parts of a page (a reading part and a task part)",
  "AI rebuilds the layout": "the page is laid out again so it fits any screen",
  "things to do": "questions the reader writes or marks an answer to: blanks, matching, circling, ticking. Colouring and drawing do not count, because they cannot become interactive questions.",
}

/** Pages the AI read and where the real content starts, from the page labels (no extra call). */
const NON_BODY = ["cover", "front-matter", "back-matter", "blank"]
function coverage(labels: Label[], pageCount: number, plan?: { full: boolean; opening: number[]; middle: number[]; end: number[] }) {
  const body = labels.filter((l) => !NON_BODY.includes(l.type))
  const start = body[0]?.page ?? null
  const lastBody = body.at(-1)?.page ?? Infinity
  const sampled = pageCount > labels.length
  const onlyOpening = body.length < 2
  const range = suggestRange(labels as any, pageCount)
  return {
    pagesRead: labels.map((l) => l.page),
    pageCount,
    sampled,
    bodyPages: body.map((l) => l.page),
    contentStartsAt: start,
    onlyFrontMatter: onlyOpening,
    /** One entry per page read, for the strip: kind = cover | opening | book | end; group = where the sample took it from. */
    strip: labels.map((l) => ({
      page: l.page,
      type: l.type,
      // Pages outside the suggested range take the range's side, so a lone fact page inside the cover reads "opening".
      kind: l.type === "cover" && l.page === 1 ? "cover" : range && l.page < range.start ? "opening" : range && l.page > range.end ? "end" : !NON_BODY.includes(l.type) ? "book" : l.type === "back-matter" || l.page > lastBody ? "end" : "opening",
      group: plan && !plan.full ? (plan.opening.includes(l.page) ? "opening" : plan.end.includes(l.page) ? "end" : "middle") : "all",
    })),
    say: onlyOpening
      ? `All ${labels.length} pages read are the cover, title pages or a foreword. The book itself is not in this file, so the answers below are guesses.`
      : sampled
        ? `Looked at ${labels.length} of ${pageCount} pages.`
        : `Read all ${labels.length} pages. The book starts on page ${start}.`,
    sayI18n: onlyOpening
      ? say("onlyOpening", { n: labels.length })
      : sampled && plan
        ? say("readSample", { read: labels.length, n: pageCount, open: plan.opening.length, middle: plan.middle.length, end: plan.end.length })
        : say("readAll", { n: labels.length }),
    question: onlyOpening ? "These pages come before the book starts. What comes after them?" : null,
    questionI18n: onlyOpening ? say("onlyOpeningQuestion") : null,
  }
}

/** Suggested page range with its sentences (Ana's page picker: keep the cover, skip opening and end pages). */
function rangeFor(labels: Label[], pageCount: number) {
  const r = suggestRange(labels as any, pageCount)
  if (!r) return { suggested: null, say: [say("startUnknown")] }
  const lines = [
    ...(r.keepCover ? [say("keepCover")] : []),
    say(r.startExact ? "startsOn" : "startsOnOrBefore", { start: r.start }),
    ...r.skipped.map((x) => x.why === "end" && !r.endExact ? say("skipEndAtLeast", x) : x.from === x.to ? say("skipOne", x) : say("skipMany", x)),
  ]
  return { suggested: r, say: lines }
}

/** A page of the book itself for the layout preview: the body page nearest the middle whose text placement is the
 *  book's usual one. Falls back to the page with the most text (isBody false) when no body page was read. */
function previewPage(labels: Label[], s: SemanticFacts) {
  const place = ({ "text-in-art": "on-art", "text-beside-art": "beside-art", "text-mostly": "text-only" } as Record<string, string>)[s.composition]
  const body = labels.filter((l) => !NON_BODY.includes(l.type))
  const kind = (l: Label) => ({ story: "story", lesson: "textbook", exercise: "textbook", informational: "reference" } as Record<string, string>)[l.type]
  // Prefer pages of the book's kind with its usual text placement, then either one, then any body page.
  const pools = [body.filter((l) => l.textPlacement === place && kind(l) === s.genre), body.filter((l) => l.textPlacement === place), body]
  const pool = pools.find((x) => x.length) ?? []
  if (pool.length) {
    const mid = pool[Math.floor(pool.length / 2)]
    return { page: mid.page, isBody: true, why: `From the middle of the pages we read (labelled ${mid.type}); the words are ${({ "on-art": "on the picture", "beside-art": "beside the picture", "text-only": "plain text", "no-text": "absent" } as Record<string, string>)[mid.textPlacement]}.` }
  }
  const other = labels.filter((l) => l.type !== "cover" && l.textPlacement !== "no-text")
  return other.length ? { page: other[Math.floor(other.length / 2)].page, isBody: false, why: "Only opening pages were read, so the preview uses one of them." } : null
}

/** Round 3 question card: every question in one counted list (El Viaje's maps question included), no answer
 *  pre-picked, both guesses named, and for each option every setting that differs between the options. */
const LOCKED_SETTINGS = DECISIONS.filter((d) => !SETTINGS[d].reversible)
function questionCard(m: DeterministicFacts, proposal: SemanticFacts, check: SemanticFacts, askList: QuestionId[], onlyOpening: boolean, checkRun: Run, labels: Label[]) {
  const questions = askList.map((f, i) => {
    const opts = Object.keys(QUESTIONS[f].options)
    const outcome = Object.fromEntries(opts.map((o) => [o, decide(m, { ...proposal, [f]: o } as SemanticFacts)]))
    const varying = DECISIONS.filter((d) => new Set(opts.map((o) => outcome[o][d].value)).size > 1)
    const locked = varying.some((d) => LOCKED_SETTINGS.includes(d))
    const pagesFor = supporting(labels, f, proposal[f])
    return {
      n: i + 1,
      of: askList.length,
      fact: f,
      ask: QUESTIONS_I18N[f].ask,
      why: onlyOpening ? "opening-only" : "guesses-differ",
      whyText: onlyOpening
        ? say("onlyOpeningQuestion")
        : { en: `Our two guesses differ: page by page it looks like “${SHORT_I18N[f][proposal[f]].en}”, read as a whole like “${SHORT_I18N[f][check[f]].en}”.`, "pt-BR": `Nossos dois palpites diferem: página por página parece “${SHORT_I18N[f][proposal[f]]["pt-BR"]}”, lido como um todo parece “${SHORT_I18N[f][check[f]]["pt-BR"]}”.`, es: `Nuestras dos suposiciones difieren: página por página parece «${SHORT_I18N[f][proposal[f]].es}», leído entero parece «${SHORT_I18N[f][check[f]].es}».` },
      /** Never pre-pick: either the guesses differ, or they rest on opening pages only. */
      default: null,
      guesses: [
        { by: "pages", answer: proposal[f], name: SHORT_I18N[f][proposal[f]], pages: pagesFor },
        { by: "whole", answer: check[f], name: SHORT_I18N[f][check[f]], pages: checkRun.trace.answers[f].evidencePages, reason: checkRun.trace.answers[f].reason },
      ],
      /** What "I'm not sure, use your guess" picks: the page-by-page guess (54/54 on the PoC set vs 48/54). */
      useGuess: { answer: proposal[f], text: Object.fromEntries(LANGS.map((l) => [l, PHRASES.useGuess[l].replace("{answer}", SHORT_I18N[f][proposal[f]][l])])) },
      locked,
      lockedNote: locked ? PHRASES.lockedGuess : null,
      /** Locked questions only: the option the designer's "not sure" picks (Figures auto, "keep labelled drawings
       *  whole"). From reading the pipeline, not tested: auto groups text with VECTOR drawings, so on books without
       *  them it changes little; on picture books whose speech bubbles are vector shapes it may add figure
       *  candidates that the meaningfulness filter then has to drop. */
      safeChoice: locked ? opts.find((o) => outcome[o].figureExtraction.value === "auto") ?? null : null,
      /** Settings that differ between this question's options (the others stay as they are). Recompute live with decide() once earlier questions are answered. */
      varies: varying,
      options: opts.map((o) => ({
        value: o,
        name: SHORT_I18N[f][o],
        text: QUESTIONS_I18N[f].options[o],
        guessedBy: [proposal[f] === o ? "pages" : null, check[f] === o ? "whole" : null].filter(Boolean),
        changes: varying.map((d) => ({ setting: d, label: SETTINGS_I18N[d].label, value: outcome[o][d].value, valueText: SETTINGS_I18N[d].values[outcome[o][d].value], locked: LOCKED_SETTINGS.includes(d) })),
        sameSettingsAs: opts.filter((x) => x !== o && varying.every((d) => outcome[x][d].value === outcome[o][d].value)),
      })),
    }
  })
  const settings = decide(m, proposal)
  return {
    status: questions.length ? "ask" : "looks-right",
    statusText: questions.length ? say(questions.length === 1 ? "questionsOne" : "questionsMany", { n: questions.length }) : say("looksRight"),
    questions,
    /** The settings fixed at import, where each comes from, and whether a question in the card decides it. */
    lockedSettings: LOCKED_SETTINGS.map((d) => ({
      setting: d,
      label: SETTINGS_I18N[d].label,
      value: settings[d].value,
      valueText: SETTINGS_I18N[d].values[settings[d].value],
      from: d === "pageGrouping" || m.vectorDiagrams.value || m.textLayer.value !== "digital" ? "measured" : "ai",
      askedIn: questions.filter((q) => q.varies.includes(d)).map((q) => q.n),
    })),
  }
}

// ---------- per-book files ----------
mkdirSync(path.join(outDir, "pages"), { recursive: true })
const inf = influence()
const askingFile = path.join(resultsDir, "asking.json")
const asking = (() => { try { return JSON.parse(readFileSync(askingFile, "utf8")) } catch { return null } })()
const flows: any = { books: [] as any[] }
const index: any[] = []
for (const b of dataset.books) {
  const e4 = find(b.id, CHECK), e5 = find(b.id, PROPOSAL), e1 = find(b.id, "e1-measure")
  if (!e4 || !e5 || !e1) continue
  const m = e1.facts
  const s4 = semanticOf(e4)!, s5 = semanticOf(e5)!
  // The proposal: E5's page counts (the most accurate mini reading); flag where E4 reads it differently.
  const proposal = s5
  const disagree = FACTS.filter((f) => s4[f] !== s5[f])
  const anyFlag = FACTS.filter((f) => disagree.includes(f) || (e5.trace.flags as string[]).includes(f))
  const truth = b.facts as Record<string, string[]>
  const settings = decide(m, proposal)
  const matters = mattering(m, proposal)
  const cited = [...new Set(FACTS.flatMap((f) => e4.trace.answers[f].evidencePages as number[]))].sort((x, y) => x - y)
  const labels: Label[] = [...e5.trace.pageLabels].sort((x: Label, y: Label) => x.page - y.page)
  const pageCount: number = e5.trace.plan ? e5.trace.plan.all.at(-1) : labels.length
  const sampled = pageCount > labels.length
  const preview = previewPage(labels, proposal)
  // Whole books: thumbnails of every sampled page (the strip), kept out of git (copyrighted, see datasets/whole.json).
  const pagesDir = sampled ? "pages-local" : "pages"
  const thumbs = [...new Set([1, ...cited, ...(m.pageStorage.evidence ?? []).slice(0, 2), ...(preview ? [preview.page] : []), ...(sampled ? labels.map((l) => l.page) : [])])].filter((p) => p <= pageCount).sort((x, y) => x - y)
  const pngs = renderPages(readFileSync(path.join(pdfDir, `${b.id}.pdf`)), thumbs, sampled ? 160 : 240)
  mkdirSync(path.join(outDir, pagesDir, b.id), { recursive: true })
  for (const [p, png] of pngs) writeFileSync(path.join(outDir, pagesDir, b.id, `p${p}.png`), png)
  const e9 = Object.fromEntries(["short", "vague", "rich"].map((style) => {
    const r = find(b.id, `e9-describe-${style}`)
    return [style, r ? { description: r.trace.description, parsed: r.trace.parsed, settledByDescription: r.trace.settledByDescription, stillToAsk: matters.filter((f) => !r.trace.settledByDescription.includes(f)) } : null]
  }))
  const e0 = find(b.id, "e0-poc")
  const askList: QuestionId[] = e5.trace.counts.body < 2 ? matters : matters.filter((f) => disagree.includes(f) && DECISIONS.some((d) => decide(m, { ...proposal, [f]: s4[f] } as SemanticFacts)[d].value !== settings[d].value))
  const book = {
    id: b.id,
    pageCount,
    engine: { proposal: PROPOSAL, check: CHECK, run: 1 },
    thumbnails: Object.fromEntries(thumbs.map((p) => [p, `${pagesDir}/${b.id}/p${p}.png`])),
    summary: describe(pageCount, m, proposal),
    measured: {
      pageStorage: { ...m.pageStorage, irreversible: true, plain: MEASURED_I18N.pageStorage[m.pageStorage.value] },
      textLayer: { ...m.textLayer, plain: MEASURED_I18N.textLayer[m.textLayer.value] },
      language: m.language,
      numbers: { medianChars: m.textDensity.medianChars, pictureCoverage: m.pictureHeavy.medianCoverage, textOverPicturesShare: m.textOverPictures.share, exerciseCuePages: m.exerciseCues.pagesWithCues, diagramPages: m.vectorDiagrams.pagesWithDiagrams },
    },
    facts: Object.fromEntries(FACTS.map((f) => [f, {
      question: QUESTIONS[f].ask,
      proposed: proposal[f],
      proposedPlain: PLAIN[f][proposal[f]],
      teachingQuestion: TEACH[f].yesNo[proposal[f]],
      plainQuestion: PLAIN_QUESTIONS[f].ask,
      plainOptions: PLAIN_QUESTIONS[f].options,
      /** True when this answer rests only on pages before the book starts (see coverage). */
      unsupported: e5.trace.counts.body < 2 && matters.includes(f),
      reason: e4.trace.answers[f].answer === proposal[f]
        ? e4.trace.answers[f].reason
        : supporting(e5.trace.pageLabels, f, proposal[f]).length === 0 && f === "genre"
          ? "Most pages shown are front matter, so this is the AI's guess for the whole book."
          : `Counted from the page labels: ${supporting(e5.trace.pageLabels, f, proposal[f]).length} of ${e5.trace.pageLabels.length} pages.`,
      citedPages: e4.trace.answers[f].answer === proposal[f] ? e4.trace.answers[f].evidencePages : supporting(e5.trace.pageLabels, f, proposal[f]),
      secondReadingReason: e4.trace.answers[f].answer === proposal[f] ? null : e4.trace.answers[f].reason,
      selfConfidence: e4.trace.answers[f].confidence,
      secondReading: s4[f],
      flag: disagree.includes(f)
        ? f === "genre" && e5.trace.counts.body < 2
          ? `No story, lesson or information pages were read, so the page-by-page reading guessed ${proposal[f]} for the whole book; the whole-book reading says ${s4[f]}.`
          : `Two readings disagree: page by page it is ${proposal[f]}, read as a whole it is ${s4[f]}.`
        : (e5.trace.flags as string[]).includes(f) ? "The page labels are split on this." : null,
      matters: matters.includes(f),
      trueAnswer: truth?.[f] ?? null,
    }])),
    coverage: coverage(labels, pageCount, e5.trace.plan),
    /** Suggested pages to import (keep the cover, skip opening and end pages), with sentences in 3 languages. */
    range: rangeFor(labels, pageCount),
    /** A page of the book itself for the layout previews (not the foreword); isBody false = only opening pages were read. */
    previewPage: preview,
    /** Questions to ask: designer's rule (ask if the other reading's answer would change a setting), plus every
     *  fact that matters when only front matter was read. See results/poc/asking.json for all runs. */
    ask: askList,
    askAcrossRuns: asking?.pairs.find((p: any) => p.proposal === PROPOSAL && p.check === CHECK)?.books.find((x: any) => x.id === b.id)?.perRule["changes+cover"] ?? null,
    pageLabels: e5.trace.pageLabels,
    pageCounts: e5.trace.counts,
    settings: Object.fromEntries(DECISIONS.map((d) => [d, { ...settings[d], irreversible: !SETTINGS[d].reversible, knownGood: b.labels[d] ?? null }])),
    whatIf: whatIf(m, proposal),
    questionOrder: matters,
    describeFirst: e9,
    /** Round 3: the questions to put in the main card, in order, everything a card needs. status "looks-right" = none. */
    ...questionCard(m, proposal, s4, askList, e5.trace.counts.body < 2, e4, labels),
    oldOneShot: e0 ? Object.fromEntries(DECISIONS.map((d) => [d, e0.settings[d].value])) : null,
  }
  writeFileSync(path.join(outDir, `${b.id}.json`), JSON.stringify(book, null, 1))
  index.push({ id: b.id, file: `${b.id}.json`, dataset: dataset.name, pageCount, wholeBook: sampled, engine: `${PROPOSAL} + ${CHECK}`, summary: book.summary, flags: anyFlag, questionsThatMatter: matters.length, ask: book.ask, status: book.status, questionCount: book.questions.length })
  flows.books.push({
    id: b.id, factsThatMatter: matters, flaggedByCrossCheck: disagree,
    wrongInProposal: FACTS.filter((f) => truth && !truth[f].includes(proposal[f])),
    questions: { confirmAllFacts: 4, adaptiveFacts: matters.length, teachingChatSettings: 6, flaggedOnly: anyFlag.length, flaggedThatMatter: anyFlag.filter((f) => matters.includes(f)).length, genreFirst: 1 + anyFlag.filter((f) => f !== "genre").length,
      describeFirst: Object.fromEntries(Object.entries(e9).map(([k, v]) => [k, v ? v.stillToAsk.length : null])) },
  })
}

// ---------- describe-first: parser stability and the "parallel" variant ----------
const parse = (bookId: string, style: string, run: number) => find(bookId, `e9-describe-${style}`, run)?.trace.parsed
const stability: any[] = []
for (const style of ["short", "vague"]) for (const b of dataset.books) {
  const p1 = parse(b.id, style, 1), p2 = parse(b.id, style, 2)
  if (!p1 || !p2) continue
  for (const f of FACTS) stability.push({ style, book: b.id, fact: f, same: p1[f].status === p2[f].status && (p1[f].status === "unknown" || p1[f].answer === p2[f].answer) })
}
// Parallel describe-first (offline): run E4 on the pages while the user types; the stated facts replace
// E4's answers; where they differ, show "You said X, the pages look like Y".
const parallel: any[] = []
let statedTotal = 0, statedRight = 0
for (const b of dataset.books) for (const style of ["short", "vague", "rich"]) {
  const r = find(b.id, `e9-describe-${style}`), e4 = find(b.id, "e4-one-call")
  if (!r || !e4) continue
  const truth = b.facts as Record<string, string[]>
  for (const f of r.trace.settledByDescription as QuestionId[]) { statedTotal++; if (truth[f].includes(r.trace.parsed[f].answer)) statedRight++ }
  const conflicts = (r.trace.settledByDescription as QuestionId[]).filter((f) => e4.trace.semantic[f] !== r.trace.parsed[f].answer)
    .map((f) => ({ fact: f, userSaid: r.trace.parsed[f].answer, pagesSay: e4.trace.semantic[f], userRight: truth[f].includes(r.trace.parsed[f].answer) }))
  parallel.push({ book: b.id, style, conflicts })
}
const e9Runs = runs.filter((r) => r.variant.startsWith("e9-"))
flows.describeFirst = {
  note: "Descriptions written by us, knowing the books. 'stated' facts are taken as the user's answer.",
  statedFacts: { total: statedTotal, right: statedRight },
  settledPerBook: Object.fromEntries(["short", "vague", "rich"].map((st) => {
    const rs = e9Runs.filter((r) => r.variant === `e9-describe-${st}`)
    return [st, rs.reduce((a, r) => a + r.trace.settledByDescription.length, 0) / Math.max(1, rs.length)]
  })),
  parserStability: { same: stability.filter((x) => x.same).length, total: stability.length, changed: stability.filter((x) => !x.same) },
  parallelConflicts: parallel.filter((p) => p.conflicts.length),
}

// ---------- loader time ----------
const ms = (v: string) => runs.filter((r) => r.variant === v).map((r) => Math.round(r.ms + (r.profileMs ?? 0))).sort((a, b) => a - b)
flows.loaderMs = Object.fromEntries(["e1-measure", "e4-one-call", "e5-page-types", "e6-text-only", "e9-describe-short", "e9-describe-vague", "e10-plain-words", "e11-page-types-text", "e12-sampled", "e12t-sampled-text", "e13-plain-words-middle", "e0-poc"].map((v) => {
  const xs = ms(v)
  return [v, { median: xs[Math.floor(xs.length / 2)], max: xs.at(-1), n: xs.length }]
}))
flows.influence = inf

writeFileSync(path.join(outDir, "engine.json"), JSON.stringify({
  note: "Facts the user can confirm, and the settings they drive. Measured facts (page storage, text layer) are never asked; they decide the two settings fixed at import.",
  facts: Object.fromEntries(FACTS.map((f) => [f, { question: QUESTIONS[f].ask, options: QUESTIONS[f].options, plain: PLAIN[f], teachingQuestions: TEACH[f].yesNo, why: TEACH[f].why, drives: inf[f] }])),
  settings: SETTINGS,
  words: WORDS,
  /** Round 3: every user-facing string in en, pt-BR and es (developer's translations; have them checked). */
  i18n: { languages: LANGS, questions: QUESTIONS_I18N, short: SHORT_I18N, settings: SETTINGS_I18N, measured: MEASURED_I18N, phrases: PHRASES },
  questionCard: "Per book: status, statusText, questions[] (n, of, ask, why, whyText, default=null, guesses[], useGuess, locked, varies, options[].changes), lockedSettings[]. Options list every setting that differs between the options, with the other facts held at our guess.",
  questionOrder: "genre first; then only facts that can still change a setting for this book (per book: questionOrder)",
}, null, 1))
// Merge by id so the PoC and the whole-book exports share one index.
const previous: any[] = (() => { try { return JSON.parse(readFileSync(path.join(outDir, "index.json"), "utf8")) } catch { return [] } })()
const merged = [...previous.filter((x) => !index.some((y) => y.id === x.id)), ...index]
writeFileSync(path.join(outDir, "index.json"), JSON.stringify(merged, null, 1))
writeFileSync(path.join(resultsDir, "flows.json"), JSON.stringify(flows, null, 1))
console.log(JSON.stringify({ influence: inf, books: flows.books.map((x: any) => ({ id: x.id.slice(0, 20), q: x.questions, wrong: x.wrongInProposal, flags: x.flaggedByCrossCheck })), describeFirst: { ...flows.describeFirst, parserStability: { ...flows.describeFirst.parserStability, changed: flows.describeFirst.parserStability.changed.length } }, loaderMs: flows.loaderMs }, null, 1))
console.log("changed parses:", JSON.stringify(flows.describeFirst.parserStability.changed))
