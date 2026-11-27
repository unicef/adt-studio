/**
 * Measured book facts (no AI), derived from the @adt/pdf book profile. Each
 * fact carries the numbers it came from and the pages that show it, so a
 * person can check it. Ported from experiments/setup-recommender/facts.ts (branch exp/333-setup-recommender).
 */
import type { BookPageProfile, BookProfile } from "@adt/pdf"
import { detectSpreads } from "../spread-detection.js"

export type PageStorage = "single-pages" | "spreads-as-separate-pages" | "spreads-as-wide-pages"
export type TextLayer = "digital" | "scanned" | "scanned-with-ocr" | "mixed"

export interface MeasuredFacts {
  pageStorage: {
    value: PageStorage
    /** How split spreads showed: one picture continuing across the fold, or a text page facing a picture page. */
    via: "joined-pictures" | "text-facing-picture" | null
    evidence: number[]
    seams: number
    pairs: number
    wideShare: number
  }
  textLayer: { value: TextLayer; evidence: number[]; scannedPages: number; ocrPages: number; pages: number }
  textOverPictures: { value: boolean; share: number; evidence: number[] }
  pictureHeavy: { value: boolean; medianCoverage: number }
  textDensity: { medianChars: number; class: "sparse" | "medium" | "dense" }
  vectorDiagrams: { value: boolean; pagesWithDiagrams: number; evidence: number[] }
  exerciseCues: { value: boolean; pagesWithCues: number; evidence: number[] }
  language: { pdfTag: string | null; guess: string | null }
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const top = (pages: BookPageProfile[], score: (p: BookPageProfile) => number, n = 3) =>
  [...pages]
    .filter((p) => score(p) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, n)
    .map((p) => p.page)
    .sort((a, b) => a - b)

/** Interior pages: skip cover and back cover when the book is long enough. */
const interior = (pages: BookPageProfile[]) => (pages.length >= 7 ? pages.slice(1, -1) : pages)

// Exercise cues across en / pt / es / fr: answer blanks, checkboxes, and instruction verbs.
const BLANK = /_{4,}|\.{6,}|\(\s{1,3}\)|\[\s{1,3}\]|☐|□/g
const INSTRUCTION =
  /(?<![\p{L}])(complete|circle|match|write|answer|fill in|underline|draw|colou?r|choose|solve|calculate|explain|discuss|complet[ea]m?|circule|ligue|escrevam?|respondam?|marque|pinte|desenhe|sublinhe|observe|identifique|compare|resolva|calcule|leia|copie|numere|escribe|responde|une|rodea|subraya|dibuja|colorea|elige|resuelve|compl[eè]te[sz]?|entoure|relie|[ée]cris|r[ée]ponds|souligne|dessine|colorie|coche|r[ée]sous)(?![\p{L}])/giu
// Numbered or lettered items at line start: "1)", "2.", "a)", "b."
const ITEM = /^\s*(\d{1,2}|[a-h])[).]\s/gimu

export function exerciseScore(p: BookPageProfile): number {
  const blanks = (p.text.match(BLANK) ?? []).length
  const verbs = (p.text.match(INSTRUCTION) ?? []).length
  const items = (p.text.match(ITEM) ?? []).length
  const questions = (p.text.match(/\?/g) ?? []).length
  const hit = blanks >= 2 || (blanks >= 1 && verbs >= 1) || verbs >= 3 || (items >= 3 && (verbs >= 1 || questions >= 2))
  return hit ? blanks + verbs + items : 0
}

function guessLanguage(text: string): string | null {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  if (words.length < 30) return null
  const stop: Record<string, string[]> = {
    en: ["the", "and", "of", "to", "is", "in", "it", "that", "with"],
    pt: ["de", "que", "não", "uma", "para", "com", "os", "as", "do", "da", "é"],
    es: ["de", "que", "el", "la", "los", "las", "una", "por", "con", "es", "del", "y"],
    fr: ["le", "la", "les", "des", "et", "une", "est", "que", "dans", "du", "pour"],
  }
  let best: string | null = null
  let bestScore = 0
  for (const [lang, list] of Object.entries(stop)) {
    const set = new Set(list)
    const score = words.filter((w) => set.has(w)).length / words.length
    if (score > bestScore) [best, bestScore] = [lang, score]
  }
  return bestScore > 0.03 ? best : null
}

// A page that is mostly words, and one that is mostly picture.
const isTextPage = (p: BookPageProfile) => p.visibleChars >= 100 && p.imageCoverage < 0.25
const isPicturePage = (p: BookPageProfile) => p.visibleChars < 40 && (p.maxImageCoverage >= 0.7 || p.ink >= 0.5)
/** Share of facing pairs that must show a spread. */
const SPREAD_SHARE = 0.25
/** How many times more often the spread side of the fold must show it than the other side. */
const PARITY_CONTRAST = 2

/**
 * Split spreads: a two-page opening printed as two PDF pages. Openings are
 * facing pages, so in a book of spreads every opening starts on the same side
 * of the fold (all even pages, or all odd ones). A pair counts as an opening
 * when one picture continues across the fold, or when a text page faces a
 * picture page (the classic picture-book layout, where nothing crosses the
 * fold). Pictures that merely happen to sit next to text land on both sides
 * of the fold alike, so the side holding the openings must show them at least
 * PARITY_CONTRAST times as often as the other, and in SPREAD_SHARE of its pairs.
 */
function measureSplitSpreads(b: BookProfile): {
  via: MeasuredFacts["pageStorage"]["via"]
  evidence: number[]
  seams: number
  pairs: number
} {
  const byPage = new Map(b.pages.map((p) => [p.page, p]))
  const seamLeads = new Set(detectSpreads(b.edges).filter((s) => s.confidence >= 0.7).map((s) => s.lead))
  const first = Math.min(...b.pages.map((p) => p.page))
  const last = Math.max(...b.pages.map((p) => p.page))
  const sides = [0, 1].map((parity) => {
    const leads: number[] = []
    for (let lead = first; lead < last; lead++) if (lead % 2 === parity && byPage.has(lead) && byPage.has(lead + 1)) leads.push(lead)
    const seams = leads.filter((l) => seamLeads.has(l))
    const facing = leads.filter((l) => {
      const a = byPage.get(l)!
      const c = byPage.get(l + 1)!
      return (isTextPage(a) && isPicturePage(c)) || (isPicturePage(a) && isTextPage(c))
    })
    const openings = new Set([...seams, ...facing])
    return { pairs: leads.length, seams, facing, openings: openings.size }
  })
  const [side, other] = sides[0].openings >= sides[1].openings ? [sides[0], sides[1]] : [sides[1], sides[0]]
  const pairs = Math.max(1, side.pairs)
  const isSpread =
    side.openings >= Math.max(2, SPREAD_SHARE * pairs) && side.openings >= PARITY_CONTRAST * Math.max(1, other.openings)
  const via = !isSpread ? null : side.seams.length >= side.facing.length ? "joined-pictures" : "text-facing-picture"
  const leads = via === "joined-pictures" ? side.seams : side.facing
  return {
    via,
    evidence: via ? leads.slice(0, 2).flatMap((l) => [l, l + 1]) : [],
    seams: seamLeads.size,
    pairs,
  }
}

/** Share of interior pages that must be scans with OCR for a book to count as mixed. */
export const MIXED_SHARE = 0.1

export function measureFacts(b: BookProfile): MeasuredFacts {
  const pages = interior(b.pages)
  const n = pages.length

  // Page storage: wide pages already hold a spread; seams that continue across
  // facing pages mean the spread was split into two PDF pages.
  const wideShare = pages.filter((p) => p.width / p.height > 1.2).length / Math.max(1, n)
  const spreads = measureSplitSpreads(b)
  let pageStorage: MeasuredFacts["pageStorage"]
  if (wideShare >= 0.6) {
    pageStorage = {
      value: "spreads-as-wide-pages",
      via: null,
      evidence: pages.filter((p) => p.width / p.height > 1.2).slice(0, 3).map((p) => p.page),
      seams: spreads.seams,
      pairs: spreads.pairs,
      wideShare,
    }
  } else if (spreads.via) {
    pageStorage = { value: "spreads-as-separate-pages", via: spreads.via, evidence: spreads.evidence, seams: spreads.seams, pairs: spreads.pairs, wideShare }
  } else {
    pageStorage = { value: "single-pages", via: null, evidence: [], seams: spreads.seams, pairs: spreads.pairs, wideShare }
  }

  // Text layer. A few full-page pictures without text are normal in picture
  // books; only an OCR layer marks them as scans.
  const scanned = pages.filter((p) => p.maxImageCoverage >= 0.85 && p.visibleChars < 20)
  const ocr = scanned.filter((p) => p.invisibleChars >= 20)
  const scannedShare = scanned.length / Math.max(1, n)
  const layerBase = { scannedPages: scanned.length, ocrPages: ocr.length, pages: n }
  let textLayer: MeasuredFacts["textLayer"]
  if (scannedShare >= 0.8)
    textLayer = {
      value: ocr.length >= 0.5 * scanned.length ? "scanned-with-ocr" : "scanned",
      evidence: scanned.slice(0, 3).map((p) => p.page),
      ...layerBase,
    }
  // Mixed only when a real share of the pages are scans with OCR: two scanned
  // pages in a 400-page digital book don't make it a scan. The rulebook then
  // reads the words directly when most pages have a real text layer
  // (rules.ts hasTextLayer).
  else if (ocr.length >= Math.max(2, MIXED_SHARE * n))
    textLayer = { value: "mixed", evidence: ocr.slice(0, 3).map((p) => p.page), ...layerBase }
  else textLayer = { value: "digital", evidence: [], ...layerBase }

  const overPages = pages.filter((p) => p.visibleChars >= 20 && p.textOverImageChars >= 0.5 * p.visibleChars)
  const withText = pages.filter((p) => p.visibleChars >= 20).length
  const overShare = overPages.length / Math.max(1, withText)
  const medianCoverage = median(pages.map((p) => p.imageCoverage))
  const medianChars = median(pages.map((p) => p.visibleChars))
  const diagramPages = pages.filter((p) => p.pathCount >= 40 && p.visibleChars >= 20)
  const cuePages = pages.filter((p) => exerciseScore(p) > 0)

  return {
    pageStorage,
    textLayer,
    textOverPictures: {
      value: overShare >= 0.4,
      share: overShare,
      evidence: top(pages, (p) => (p.visibleChars >= 20 ? p.textOverImageChars : 0)),
    },
    pictureHeavy: { value: medianCoverage >= 0.4, medianCoverage },
    textDensity: { medianChars, class: medianChars < 400 ? "sparse" : medianChars < 1500 ? "medium" : "dense" },
    vectorDiagrams: {
      value: diagramPages.length >= Math.max(2, 0.1 * n),
      pagesWithDiagrams: diagramPages.length,
      evidence: top(pages, (p) => (p.visibleChars >= 20 ? p.pathCount : 0)),
    },
    exerciseCues: {
      value: cuePages.length >= Math.max(2, 0.1 * n),
      pagesWithCues: cuePages.length,
      evidence: top(pages, exerciseScore),
    },
    language: { pdfTag: b.language, guess: guessLanguage(pages.map((p) => p.text).join(" ")) },
  }
}
