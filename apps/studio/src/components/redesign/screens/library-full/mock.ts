/* eslint-disable lingui/no-unlocalized-strings -- preview-only mock catalog (book titles, authors, publishers) */
import type { BookSummary } from "@/api/client"
import { toBookVM } from "../../data"
import type { LibBook } from "./LibraryView"

const now = Date.now()
const ago = (mins: number) => new Date(now - mins * 60_000).toISOString()
const coverUrl = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`

const BASE = ["extract", "sectioning", "storyboard"]
const withOptional = (...opt: string[]) => [...BASE, ...opt]

type Seed = Partial<BookSummary> & { label: string; isbn?: string; hasError?: boolean; pendingComments?: number }

function makeBook(p: Seed): BookSummary {
  return {
    label: p.label,
    title: p.title ?? null,
    authors: p.authors ?? [],
    publisher: p.publisher ?? null,
    languageCode: p.languageCode ?? "en",
    pageCount: p.pageCount ?? 0,
    hasSourcePdf: p.hasSourcePdf ?? true,
    needsRebuild: p.needsRebuild ?? false,
    rebuildReason: p.rebuildReason ?? null,
    completedStages: p.completedStages ?? [],
    createdAt: p.createdAt ?? ago(60 * 24 * 30),
    modifiedAt: p.modifiedAt ?? ago(120),
    part: p.part ?? null,
    split: p.split ?? null,
  }
}

const SEEDS: Seed[] = [
  { label: "intro-algorithms", title: "Introduction to Algorithms", authors: ["Thomas H. Cormen"], publisher: "MIT Press", isbn: "9780262033848", pageCount: 420, completedStages: withOptional("captions", "quizzes", "glossary", "toc"), modifiedAt: ago(45) },
  { label: "campbell-biology", title: "Campbell Biology", authors: ["Lisa A. Urry"], publisher: "Pearson", isbn: "9780134093413", pageCount: 340, completedStages: withOptional("captions", "quizzes", "glossary", "toc", "speech"), modifiedAt: ago(115), pendingComments: 3 },
  { label: "sapiens", title: "Sapiens: A Brief History of Humankind", authors: ["Yuval Noah Harari"], publisher: "Harper", isbn: "9780062316097", pageCount: 290, completedStages: withOptional("captions", "quizzes"), modifiedAt: ago(90) },
  { label: "prisoners-of-geography", title: "Prisoners of Geography", authors: ["Tim Marshall"], publisher: "Elliott & Thompson", isbn: "9781783962433", pageCount: 210, completedStages: ["extract", "sectioning"], modifiedAt: ago(200) },
  { label: "selfish-gene", title: "The Selfish Gene", authors: ["Richard Dawkins"], publisher: "Oxford", isbn: "9780198788607", pageCount: 240, completedStages: withOptional("captions", "glossary"), modifiedAt: ago(500) },
  { label: "guns-germs-and-steel", title: "Guns, Germs, and Steel", authors: ["Jared Diamond"], publisher: "W. W. Norton", isbn: "9780393317558", pageCount: 320, completedStages: ["extract"], modifiedAt: ago(300) },
  { label: "national-geographic-atlas", title: "National Geographic Atlas of the World", authors: ["National Geographic"], publisher: "National Geographic", isbn: "9781426220586", pageCount: 180, completedStages: withOptional("toc", "glossary", "quizzes", "translate"), languageCode: "es", modifiedAt: ago(360) },
  { label: "thinking-fast-and-slow", title: "Thinking, Fast and Slow", authors: ["Daniel Kahneman"], publisher: "Farrar, Straus and Giroux", isbn: "9780374533557", pageCount: 260, completedStages: withOptional("quizzes"), modifiedAt: ago(720) },
  { label: "chemistry-central-science", title: "Chemistry: The Central Science", authors: ["Theodore E. Brown"], publisher: "Pearson", isbn: "9780134414232", pageCount: 280, completedStages: withOptional("captions", "quizzes"), modifiedAt: ago(60 * 48) },
  { label: "molecular-biology-cell", title: "Molecular Biology of the Cell", authors: ["Bruce Alberts"], publisher: "Garland Science", isbn: "9780815344322", pageCount: 500, completedStages: ["extract"], modifiedAt: ago(1000), hasError: true },
  { label: "calculus-early-transcendentals", title: "Calculus: Early Transcendentals", authors: ["James Stewart"], publisher: "Cengage", isbn: "9781285741550", pageCount: 260, completedStages: ["extract", "sectioning"], modifiedAt: ago(60 * 26), split: { totalPages: 260, exportedParts: 3, splitPages: 260, mergedPages: 90, fullySplit: true, fullyMerged: false } },
  { label: "principles-economics", title: "Principles of Economics", authors: ["N. Gregory Mankiw"], publisher: "Cengage", isbn: "9781305585126", pageCount: 300, completedStages: withOptional("captions", "quizzes", "glossary"), needsRebuild: true, rebuildReason: "Source PDF changed", modifiedAt: ago(60 * 24) },
  { label: "brief-history-time", title: "A Brief History of Time", authors: ["Stephen Hawking"], publisher: "Bantam", isbn: "9780553380163", pageCount: 210, completedStages: withOptional("captions", "quizzes", "glossary", "toc", "translate", "speech", "validation", "preview", "export"), modifiedAt: ago(60 * 66), pendingComments: 4 },
  { label: "university-physics", title: "University Physics with Modern Physics", authors: ["Hugh D. Young"], publisher: "Pearson", isbn: "9780135159552", pageCount: 300, completedStages: withOptional("captions", "translate", "speech", "validation", "preview", "export"), modifiedAt: ago(60 * 72), pendingComments: 2 },
  { label: "organic-chemistry", title: "Organic Chemistry", authors: ["Jonathan Clayden"], publisher: "Oxford", isbn: "9780199270293", pageCount: 360, completedStages: ["extract", "sectioning"], languageCode: "pt-BR", modifiedAt: ago(2000) },
  { label: "cosmos", title: "Cosmos", authors: ["Carl Sagan"], publisher: "Ballantine Books", isbn: "9780345539434", pageCount: 220, completedStages: withOptional("captions"), needsRebuild: true, rebuildReason: "Source PDF changed", modifiedAt: ago(60 * 96) },
  { label: "grays-anatomy", title: "Gray's Anatomy", authors: ["Henry Gray"], publisher: "Elsevier", isbn: "9780702052309", pageCount: 480, completedStages: withOptional("captions", "glossary", "toc", "validation", "preview", "export"), modifiedAt: ago(60 * 100), pendingComments: 7 },
  { label: "astrophysics-in-a-hurry", title: "Astrophysics for People in a Hurry", authors: ["Neil deGrasse Tyson"], publisher: "W. W. Norton", isbn: "9780393609394", pageCount: 160, completedStages: withOptional("captions", "quizzes"), languageCode: "fr", modifiedAt: ago(60 * 30) },
  { label: "elements-of-style", title: "The Elements of Style", authors: ["William Strunk Jr."], publisher: "Pearson", pageCount: 0, completedStages: [], modifiedAt: ago(18) },
]

export function mockLibrary(locale = "en"): LibBook[] {
  return SEEDS.map((seed) => {
    const vm = toBookVM(makeBook(seed), locale)
    return {
      ...vm,
      cover: { ...vm.cover, src: seed.isbn ? coverUrl(seed.isbn) : null },
      hasError: seed.hasError,
      pendingComments: seed.pendingComments,
    }
  })
}
