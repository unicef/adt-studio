import { PNG } from "pngjs"
import type { PositionedTextOutput, TypeScale } from "@adt/types"

export interface BookOutlineEvidencePage {
  pageId: string
  pageNumber: number
  text: string
  imageBase64: string
  positionedText?: PositionedTextOutput
}

export interface HeadingCandidateEvidence {
  candidateId: string
  pageId: string
  pageNumber: number
  text: string
  sourceTextIds: string[]
  fontSizePx: number | null
  fontWeight: number | null
  fontFamily: string | null
  color: string | null
  topRatio: number | null
  leftRatio: number | null
  widthRatio: number | null
  centered: boolean
  sizeToBodyRatio: number | null
  headingLikelihood: number
}

export interface BookOutlineProofSheet {
  sheetId: string
  pageIds: string[]
  pageNumbers: number[]
  imageBase64: string
}

/**
 * Compact evidence-only hierarchy recovered from table-of-contents rows.
 * These rows guide matching in-book headings but are never outline entries.
 */
export interface TocHierarchyEntryEvidence {
  tocPageId: string
  tocPageNumber: number
  title: string
  suggestedLevel: number
  indentRatio: number | null
  confidence: number
}

export interface BookOutlineEvidence {
  pages: Array<{ pageId: string; pageNumber: number; text: string }>
  candidates: HeadingCandidateEvidence[]
  tocHierarchy: TocHierarchyEntryEvidence[]
  proofSheets: BookOutlineProofSheet[]
  typeScale: TypeScale | null
}

/** Keep each page's prompt contribution bounded without discarding both ends. */
export const BOOK_OUTLINE_MAX_PAGE_TEXT_CHARS = 12_000
/** Positioned candidates already carry the page's useful text and typography. */
export const BOOK_OUTLINE_MAX_POSITIONED_PAGE_TEXT_CHARS = 600
export const BOOK_OUTLINE_MAX_CANDIDATES_PER_PAGE = 16

function boundedPageText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const marker = "\n\n[... middle of page text omitted for outline input ...]\n\n"
  const available = maxChars - marker.length
  const leading = Math.ceil(available / 2)
  const trailing = Math.floor(available / 2)
  return `${text.slice(0, leading)}${marker}${text.slice(-trailing)}`
}

interface GroupedParagraph {
  text: string[]
  textIds: string[]
  top: number
  left: number
  width: number | null
  maxFontSize: number | null
  maxFontWeight: number | null
  fontFamily: string | null
  color: string | null
  centered: boolean
  order: number
}

interface RankedParagraph {
  group: GroupedParagraph
  text: string
  likelihood: number
}

interface RawTocHierarchyEntry {
  tocPageId: string
  tocPageNumber: number
  title: string
  indentRatio: number | null
}

function parseCssNumber(value: string | undefined): number | null {
  if (!value) return null
  if (value.trim().toLowerCase() === "bold") return 700
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function rounded(value: number | null, digits: number): number | null {
  if (value === null) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function isMostlyUppercase(text: string): boolean {
  const letters = [...text].filter((char) => char.toLocaleLowerCase() !== char.toLocaleUpperCase())
  if (letters.length < 3) return false
  const uppercase = letters.filter((char) => char === char.toLocaleUpperCase()).length
  return uppercase / letters.length >= 0.8
}

function parseTocRow(text: string): string | null {
  const match = text.match(/^(.*?)\s*\.{4,}\s*(?:(?:\d{1,4}|[ivxlcdm]{1,8})\s*)?$/i)
  const title = match?.[1]?.replace(/\s+/g, " ").trim() ?? ""
  return title.length > 0 ? title : null
}

function normalizedTocIndentBands(entries: RawTocHierarchyEntry[]): number[] {
  const indents = [...new Set(
    entries.flatMap((entry) => entry.indentRatio === null ? [] : [entry.indentRatio]),
  )].sort((a, b) => a - b)
  if (indents.length === 0) return []

  // Treat a large horizontal jump as a new TOC column rather than a deeper
  // hierarchy level, then compare indentation within each column.
  const bandStarts: number[] = [indents[0]]
  for (let index = 1; index < indents.length; index++) {
    if (indents[index] - indents[index - 1] > 0.2) {
      bandStarts.push(indents[index])
    }
  }
  return entries.map((entry) => {
    if (entry.indentRatio === null) return Number.NaN
    const bandStart = [...bandStarts]
      .reverse()
      .find((start) => start <= entry.indentRatio!) ?? bandStarts[0]
    return rounded(entry.indentRatio - bandStart, 3) ?? 0
  })
}

function buildTocHierarchy(rawEntries: RawTocHierarchyEntry[]): TocHierarchyEntryEvidence[] {
  const normalizedIndents = normalizedTocIndentBands(rawEntries)
  const clusters: number[] = []
  for (const indent of [...normalizedIndents].filter(Number.isFinite).sort((a, b) => a - b)) {
    const current = clusters.at(-1)
    if (current === undefined || indent - current > 0.025) {
      clusters.push(indent)
    }
  }

  return rawEntries.map((entry, index) => {
    const indent = normalizedIndents[index]
    const clusterIndex = Number.isFinite(indent)
      ? clusters.reduce(
          (best, candidate, candidateIndex) =>
            Math.abs(candidate - indent) < Math.abs(clusters[best] - indent)
              ? candidateIndex
              : best,
          0,
        )
      : 0
    return {
      ...entry,
      suggestedLevel: Math.min(6, clusterIndex + 1),
      // Multiple indentation bands make the relationship authoritative enough
      // for deterministic matching. Flat/OCR-only TOCs remain prompt guidance.
      confidence: clusters.length > 1 && Number.isFinite(indent) ? 0.98 : 0.45,
    }
  })
}

interface BuiltHeadingEvidence {
  candidates: HeadingCandidateEvidence[]
  tocHierarchy: TocHierarchyEntryEvidence[]
}

/**
 * Convert positioned text into compact, block-linked evidence. The model sees
 * every reasonably-sized visual text block (up to a per-page safety cap when
 * positioned evidence exists), not only blocks a local heuristic has already
 * decided are headings. OCR-only pages retain every line because no local
 * typography signal can safely rank one above another.
 */
function buildHeadingEvidence(
  pages: BookOutlineEvidencePage[],
  typeScale: TypeScale | null,
  maxPerPage = BOOK_OUTLINE_MAX_CANDIDATES_PER_PAGE,
): BuiltHeadingEvidence {
  const output: HeadingCandidateEvidence[] = []
  const rawTocHierarchy: RawTocHierarchyEntry[] = []

  for (const page of pages) {
    const positioned = page.positionedText
    const groups = new Map<string, GroupedParagraph>()

    if (positioned) {
      for (let index = 0; index < positioned.drawItems.length; index++) {
        const item = positioned.drawItems[index]
        if (item.kind !== "paragraph") continue
        const text = normalizedText(item.text)
        if (!text || text.length > 320) continue

        const key = item.mergedParagraphId ?? item.textId
        let group = groups.get(key)
        if (!group) {
          group = {
            text: [],
            textIds: [],
            top: item.top,
            left: item.left,
            width: item.blockBounds?.width ?? null,
            maxFontSize: null,
            maxFontWeight: null,
            fontFamily: null,
            color: null,
            centered: item.textAlign === "center",
            order: index,
          }
          groups.set(key, group)
        }
        group.text.push(text)
        group.textIds.push(item.textId)
        group.top = Math.min(group.top, item.top)
        group.left = Math.min(group.left, item.left)
        group.width = Math.max(group.width ?? 0, item.blockBounds?.width ?? 0) || null
        group.centered ||= item.textAlign === "center"

        for (const segment of item.segments) {
          const size = parseCssNumber(segment.style?.["font-size"])
          if (size !== null) group.maxFontSize = Math.max(group.maxFontSize ?? 0, size)
          const weight = parseCssNumber(segment.style?.["font-weight"])
          if (weight !== null) group.maxFontWeight = Math.max(group.maxFontWeight ?? 0, weight)
          group.fontFamily ??= segment.style?.["font-family"] ?? null
          group.color ??= segment.style?.color ?? null
        }
      }
    }

    // Some scanned books have no positioned text. Keep the outline step useful
    // by falling back to compact OCR lines with no visual-style claims. The
    // same per-page limit still applies: a malformed OCR page must not make the
    // whole-book request unbounded.
    if (groups.size === 0) {
      const lines = page.text
        .split(/\r?\n/)
        .map(normalizedText)
        .filter((line) => line.length > 0 && line.length <= 320)
      for (let index = 0; index < lines.length; index++) {
        groups.set(`raw-${index + 1}`, {
          text: [lines[index]],
          textIds: [],
          top: index,
          left: 0,
          width: null,
          maxFontSize: null,
          maxFontWeight: null,
          fontFamily: null,
          color: null,
          centered: false,
          order: index,
        })
      }
    }

    const bodyPx = typeScale?.bodyPx ?? null
    const allRanked: RankedParagraph[] = [...groups.values()].map((group) => {
      const text = normalizedText(group.text.join(" "))
      const ratio = bodyPx && group.maxFontSize ? group.maxFontSize / bodyPx : null
      let likelihood = 0
      if (ratio !== null) likelihood += Math.max(0, Math.min(4, (ratio - 1) * 5))
      if ((group.maxFontWeight ?? 0) >= 600) likelihood += 1.2
      if (group.centered) likelihood += 0.7
      if (text.length <= 120) likelihood += 0.4
      if (isMostlyUppercase(text)) likelihood += 0.5
      if (positioned && group.top / Math.max(1, positioned.pageHeight) <= 0.2) likelihood += 0.3
      if (text.length > 220) likelihood -= 1
      return { group, text, likelihood }
    })

    // A TOC's navigation rows are links/list items, not headings in the
    // document's semantic outline. They also dominate candidate and output
    // tokens on textbook front matter. Long dot leaders are a strong,
    // language-independent signal; once a page has several, discard their
    // separate terminal page-number blocks too. Keep the page's own heading
    // (for example "Contents" / "Sumário").
    const hasDotLeader = (text: string) => /\.{4,}/.test(text)
    const likelyTableOfContents =
      allRanked.filter(({ text }) => hasDotLeader(text)).length >= 3
    if (likelyTableOfContents) {
      for (const { group, text } of allRanked) {
        const title = parseTocRow(text)
        if (!title) continue
        rawTocHierarchy.push({
          tocPageId: page.pageId,
          tocPageNumber: page.pageNumber,
          title,
          indentRatio: positioned
            ? rounded(group.left / Math.max(1, positioned.pageWidth), 3)
            : null,
        })
      }
    }
    const ranked = allRanked.filter(({ text }) => {
      if (hasDotLeader(text)) return false
      if (
        likelyTableOfContents &&
        /^(?:\d{1,4}|[ivxlcdm]{1,8})$/i.test(text.trim())
      ) return false
      return true
    })

    // Keep the strongest blocks when a page is unusually dense, then restore
    // source reading order so the book-level model sees a coherent sequence.
    const pageLimit = maxPerPage
    const selected = ranked
      .sort((a, b) => b.likelihood - a.likelihood || a.group.order - b.group.order)
      .slice(0, pageLimit)
      .sort((a, b) => a.group.order - b.group.order)

    selected.forEach(({ group, text, likelihood }, index) => {
      output.push({
        candidateId: `${page.pageId}_hc${String(index + 1).padStart(3, "0")}`,
        pageId: page.pageId,
        pageNumber: page.pageNumber,
        text,
        sourceTextIds: group.textIds,
        fontSizePx: rounded(group.maxFontSize, 2),
        fontWeight: rounded(group.maxFontWeight, 0),
        fontFamily: group.fontFamily,
        color: group.color,
        topRatio: positioned
          ? rounded(group.top / Math.max(1, positioned.pageHeight), 3)
          : null,
        leftRatio: positioned
          ? rounded(group.left / Math.max(1, positioned.pageWidth), 3)
          : null,
        widthRatio:
          positioned && group.width !== null
            ? rounded(group.width / Math.max(1, positioned.pageWidth), 3)
            : null,
        centered: group.centered,
        sizeToBodyRatio:
          bodyPx && group.maxFontSize
            ? rounded(group.maxFontSize / bodyPx, 3)
            : null,
        headingLikelihood: Math.round(Math.max(0, likelihood) * 100) / 100,
      })
    })
  }

  return {
    candidates: output,
    tocHierarchy: buildTocHierarchy(rawTocHierarchy),
  }
}

export function buildHeadingCandidates(
  pages: BookOutlineEvidencePage[],
  typeScale: TypeScale | null,
  maxPerPage = BOOK_OUTLINE_MAX_CANDIDATES_PER_PAGE,
): HeadingCandidateEvidence[] {
  return buildHeadingEvidence(pages, typeScale, maxPerPage).candidates
}

export function buildTocHierarchyEvidence(
  pages: BookOutlineEvidencePage[],
  typeScale: TypeScale | null,
): TocHierarchyEntryEvidence[] {
  return buildHeadingEvidence(pages, typeScale).tocHierarchy
}

function resizeInto(
  source: PNG,
  target: PNG,
  cellX: number,
  cellY: number,
  cellWidth: number,
  cellHeight: number,
): void {
  const scale = Math.min(cellWidth / source.width, cellHeight / source.height)
  const width = Math.max(1, Math.floor(source.width * scale))
  const height = Math.max(1, Math.floor(source.height * scale))
  const offsetX = cellX + Math.floor((cellWidth - width) / 2)
  const offsetY = cellY + Math.floor((cellHeight - height) / 2)

  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(source.height - 1, Math.floor(y / scale))
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(source.width - 1, Math.floor(x / scale))
      const sourceOffset = (sourceY * source.width + sourceX) * 4
      const targetOffset = ((offsetY + y) * target.width + offsetX + x) * 4
      target.data[targetOffset] = source.data[sourceOffset]
      target.data[targetOffset + 1] = source.data[sourceOffset + 1]
      target.data[targetOffset + 2] = source.data[sourceOffset + 2]
      target.data[targetOffset + 3] = 255
    }
  }
}

/** Build bounded, row-major contact sheets from the extracted full-page PNGs. */
export function buildProofSheets(
  pages: BookOutlineEvidencePage[],
  options: {
    columns?: number
    rows?: number
    cellWidth?: number
    cellHeight?: number
    gap?: number
  } = {},
): BookOutlineProofSheet[] {
  const columns = options.columns ?? 4
  const rows = options.rows ?? 6
  const cellWidth = options.cellWidth ?? 240
  const cellHeight = options.cellHeight ?? 320
  const gap = options.gap ?? 8
  const perSheet = columns * rows
  const sheets: BookOutlineProofSheet[] = []

  for (let start = 0; start < pages.length; start += perSheet) {
    const chunk = pages.slice(start, start + perSheet)
    const usedRows = Math.max(1, Math.ceil(chunk.length / columns))
    const width = columns * cellWidth + (columns + 1) * gap
    const height = usedRows * cellHeight + (usedRows + 1) * gap
    const sheet = new PNG({ width, height, fill: true })
    sheet.data.fill(255)

    chunk.forEach((page, index) => {
      const source = PNG.sync.read(Buffer.from(page.imageBase64, "base64"))
      const column = index % columns
      const row = Math.floor(index / columns)
      resizeInto(
        source,
        sheet,
        gap + column * (cellWidth + gap),
        gap + row * (cellHeight + gap),
        cellWidth,
        cellHeight,
      )
    })

    sheets.push({
      sheetId: `proof-${String(sheets.length + 1).padStart(3, "0")}`,
      pageIds: chunk.map((page) => page.pageId),
      pageNumbers: chunk.map((page) => page.pageNumber),
      imageBase64: PNG.sync.write(sheet).toString("base64"),
    })
  }

  return sheets
}

export function buildBookOutlineEvidence(
  pages: BookOutlineEvidencePage[],
  typeScale: TypeScale | null,
): BookOutlineEvidence {
  const headingEvidence = buildHeadingEvidence(pages, typeScale)
  return {
    pages: pages.map(({ pageId, pageNumber, text, positionedText }) => ({
      pageId,
      pageNumber,
      text: boundedPageText(
        text,
        positionedText
          ? BOOK_OUTLINE_MAX_POSITIONED_PAGE_TEXT_CHARS
          : BOOK_OUTLINE_MAX_PAGE_TEXT_CHARS,
      ),
    })),
    candidates: headingEvidence.candidates,
    tocHierarchy: headingEvidence.tocHierarchy,
    proofSheets: buildProofSheets(pages),
    typeScale,
  }
}
