/**
 * Measured book facts (no AI), derived from the @adt/pdf book profile. Each
 * fact carries the numbers it came from and the pages that show it, so a
 * person can check it. Ported from experiments/setup-recommender/facts.ts.
 */
import type { BookPageProfile, BookProfile } from "@adt/pdf"
import { detectSpreads } from "../spread-detection.js"

export type PageStorage = "single-pages" | "spreads-as-separate-pages" | "spreads-as-wide-pages"
export type TextLayer = "digital" | "scanned" | "scanned-with-ocr" | "mixed"

export interface MeasuredFacts {
  pageStorage: { value: PageStorage; evidence: number[]; seams: number; pairs: number; wideShare: number }
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

export function measureFacts(b: BookProfile): MeasuredFacts {
  const pages = interior(b.pages)
  const n = pages.length

  // Page storage: wide pages already hold a spread; seams that continue across
  // facing pages mean the spread was split into two PDF pages.
  const wideShare = pages.filter((p) => p.width / p.height > 1.2).length / Math.max(1, n)
  const pairs = Math.max(1, Math.floor(b.pages.length / 2))
  const seams = detectSpreads(b.edges).filter((s) => s.confidence >= 0.7)
  let pageStorage: MeasuredFacts["pageStorage"]
  if (wideShare >= 0.6) {
    pageStorage = {
      value: "spreads-as-wide-pages",
      evidence: pages.filter((p) => p.width / p.height > 1.2).slice(0, 3).map((p) => p.page),
      seams: seams.length,
      pairs,
      wideShare,
    }
  } else if (seams.length >= Math.max(2, 0.25 * pairs)) {
    pageStorage = {
      value: "spreads-as-separate-pages",
      evidence: seams.slice(0, 2).flatMap((s) => [s.lead, s.lead + 1]),
      seams: seams.length,
      pairs,
      wideShare,
    }
  } else {
    pageStorage = { value: "single-pages", evidence: [], seams: seams.length, pairs, wideShare }
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
  else if (ocr.length >= 2) textLayer = { value: "mixed", evidence: ocr.slice(0, 3).map((p) => p.page), ...layerBase }
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
