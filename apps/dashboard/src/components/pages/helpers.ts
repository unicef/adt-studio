import type { BookPage } from "../../lib/types"

export type ViewportKey = "desktop" | "tablet" | "mobile"

export const VIEWPORTS: { key: ViewportKey; label: string; width: number }[] = [
  { key: "desktop", label: "Desktop", width: 1280 },
  { key: "tablet", label: "Tablet", width: 768 },
  { key: "mobile", label: "Mobile", width: 390 },
]

export interface MergedPage {
  pageNumber: number
  byRun: (BookPage | undefined)[]
}

export function mergePages(perRun: BookPage[][]): MergedPage[] {
  const numbers = [...new Set(perRun.flatMap((pages) => pages.map((p) => p.pageNumber)))].sort((a, b) => a - b)
  const lookups = perRun.map((pages) => new Map(pages.map((p) => [p.pageNumber, p])))
  return numbers.map((pageNumber) => ({ pageNumber, byRun: lookups.map((lookup) => lookup.get(pageNumber)) }))
}

const sectionCount = (page: BookPage | undefined) => (page?.sectionTypes ? String(page.sectionTypes.length) : "–")

export function pageLabel(page: MergedPage): string {
  return `Page ${page.pageNumber} · ${page.byRun.map(sectionCount).join(" / ")} sections`
}

export function pageDiffers(page: MergedPage): boolean {
  const signatures = page.byRun.map((p) => (p?.sectionTypes ? p.sectionTypes.join("|") : null))
  return signatures.some((s) => s !== signatures[0])
}
