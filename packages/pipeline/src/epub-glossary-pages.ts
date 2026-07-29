/**
 * In-flow glossary pages for EPUB exports (`epub_glossary.mode: page | both`).
 *
 * The EPUB 3 doc-glossary model (epub-glossary.ts) depends on reader support
 * that Apple Books and most non-BookFusion readers don't implement — the
 * glossref popovers never appear and the non-linear glossary.xhtml is
 * unreachable. This module lowers the glossary to plain content pages
 * inserted into the linear reading order instead:
 *
 *   - The user picks placements ("after page N" / end of book). Each
 *     placement collects the terms used since the previous one, so a
 *     placement per chapter yields per-chapter glossaries; the default
 *     single `end` placement yields a classic back-of-book glossary.
 *   - In-text glossrefs link to the term's entry on the owning glossary
 *     page; each entry carries `epub:type="backlink"` anchors ("p. N")
 *     to every occurrence so the reader can return to where they came from
 *     even without the reader's own back affordance.
 *   - Entries show the word, an optional picture, optional emojis, and —
 *     when a sign-language video is attached to the glossary item — a native
 *     `<video>` element, which works in EPUB readers without the stripped
 *     ADT runtime.
 *   - Fixed-layout books get pre-paginated chunks matching the book
 *     viewport; reflowable books get one flowing document per placement.
 */
import type { GlossaryBacklink, GlossaryEntry } from "./epub-glossary.js"

const XHTML_NS = "http://www.w3.org/1999/xhtml"
const EPUB_NS = "http://www.idpf.org/2007/ops"

/** Minimal page shape needed for placement planning (packaging PageEntry). */
export interface PlacementPage {
  page_number?: number
}

export type GlossaryPagePlacement = number | "end"

// ---------------------------------------------------------------------------
// Placement planning
// ---------------------------------------------------------------------------

/**
 * Resolve user placements ("after physical page N" / "end") to window
 * boundaries: sorted, deduped indices into `pages`, where boundary `b` means
 * "this window covers pages[0..b] (minus earlier windows) and its glossary
 * page is inserted after pages[b]".
 *
 * A numeric placement lands after the last section of that physical page,
 * extended past any directly following unnumbered pages (interleaved quiz
 * pages belong to the content they follow). Placements before the first
 * numbered page resolve to boundary 0 rather than being dropped, so the
 * window simply ends up empty and emits nothing.
 */
export function planGlossaryBoundaries(
  pages: PlacementPage[],
  placements: GlossaryPagePlacement[],
): number[] {
  if (pages.length === 0) return []
  const resolved = new Set<number>()
  const effective = placements.length > 0 ? placements : ["end" as const]
  for (const placement of effective) {
    if (placement === "end") {
      resolved.add(pages.length - 1)
      continue
    }
    let idx = 0
    for (let i = 0; i < pages.length; i++) {
      const n = pages[i].page_number
      if (n != null && n <= placement) idx = i
    }
    // Carry interleaved unnumbered pages (quizzes) along with their content.
    while (idx + 1 < pages.length && pages[idx + 1].page_number == null) idx += 1
    resolved.add(idx)
  }
  return Array.from(resolved).sort((a, b) => a - b)
}

/**
 * Window owning a page: the first boundary at or after it. Pages after the
 * last boundary fold into the last window so every in-text glossref has a
 * resolvable target.
 */
export function windowIndexForPage(boundaries: number[], pageIndex: number): number {
  for (let w = 0; w < boundaries.length; w++) {
    if (pageIndex <= boundaries[w]) return w
  }
  return boundaries.length - 1
}

// ---------------------------------------------------------------------------
// Page document building
// ---------------------------------------------------------------------------

export interface GlossaryPageEntry {
  entry: GlossaryEntry
  /** Occurrences within this window, used for the "return to text" links. */
  backlinks: GlossaryBacklink[]
}

export interface BuildGlossaryPagesInput {
  language: string
  /** Localised page title (e.g. "Glossary" / "Glosario"). */
  heading: string
  /** Entries per window, parallel to the boundaries array. */
  windows: GlossaryPageEntry[][]
  /**
   * Book viewport for fixed-layout (pre-paginated) exports. When set,
   * entries are chunked across multiple viewport-sized pages; when absent a
   * single reflowable document per window is emitted.
   */
  fixedViewport?: { width: number; height: number }
  /** Glossary item sourceId → OEBPS-relative sign-language video href. */
  videoHrefBySourceId?: Map<string, string>
  /** Localised label for the sign-language toggle button. */
  signLanguageLabel?: string
}

export interface GlossaryPageFile {
  /** Spine/section id (`glp001` …). */
  sectionId: string
  /** OEBPS-relative filename (`glp001.xhtml`). */
  filename: string
  xhtml: string
  windowIndex: number
  /** True for the first file of its window (TOC/landmark target). */
  isWindowStart: boolean
  /** True when the page carries the sign-language toggle script — the OPF
   *  manifest item must then declare the `scripted` property. */
  hasScript: boolean
}

export interface BuildGlossaryPagesResult {
  files: GlossaryPageFile[]
  /** `${windowIndex}:${entryId}` → `glp001.xhtml#gl_001`. */
  hrefByWindowEntry: Map<string, string>
}

/**
 * Placeholder href emitted while wrapping page terms, before chunking has
 * decided which glossary page file an entry lands on. Resolved by
 * `resolveGlossaryPageHrefs` once the files exist.
 */
export function glossaryPageHrefPlaceholder(windowIndex: number, entryId: string): string {
  return `__glp:${windowIndex}:${entryId}__`
}

/** Rewrite placeholder hrefs to their final `file#fragment` targets. */
export function resolveGlossaryPageHrefs(
  xhtml: string,
  hrefByWindowEntry: Map<string, string>,
): string {
  return xhtml.replace(/__glp:(\d+):([A-Za-z0-9_.-]+)__/g, (match, windowIdx, entryId) => {
    return hrefByWindowEntry.get(`${windowIdx}:${entryId}`) ?? match
  })
}

/**
 * Build the glossary page documents for every window. Entries are sorted
 * alphabetically within a window. Empty windows emit no files (their pages
 * had no glossary terms, so nothing links there either).
 */
export function buildGlossaryPages(input: BuildGlossaryPagesInput): BuildGlossaryPagesResult {
  const { language, heading, windows, fixedViewport, videoHrefBySourceId } = input
  const signLanguageLabel = input.signLanguageLabel ?? "Sign language"

  const files: GlossaryPageFile[] = []
  const hrefByWindowEntry = new Map<string, string>()
  let pageCounter = 0

  for (let w = 0; w < windows.length; w++) {
    const entries = [...windows[w]]
    if (entries.length === 0) continue
    entries.sort((a, b) => a.entry.word.localeCompare(b.entry.word, language || undefined))

    const chunks = fixedViewport
      ? packEntriesForFixedViewport(entries, fixedViewport, videoHrefBySourceId)
      : [entries]

    for (let c = 0; c < chunks.length; c++) {
      pageCounter += 1
      const sectionId = `glp${String(pageCounter).padStart(3, "0")}`
      const filename = `${sectionId}.xhtml`
      for (const e of chunks[c]) {
        hrefByWindowEntry.set(`${w}:${e.entry.id}`, `${filename}#${e.entry.id}`)
      }
      const hasScript = chunks[c].some((e) => videoHrefBySourceId?.has(e.entry.sourceId))
      files.push({
        sectionId,
        filename,
        windowIndex: w,
        isWindowStart: c === 0,
        hasScript,
        xhtml: renderGlossaryPageXhtml({
          language,
          heading,
          entries: chunks[c],
          fixedViewport,
          videoHrefBySourceId,
          signLanguageLabel,
        }),
      })
    }
  }

  return { files, hrefByWindowEntry }
}

// ---------------------------------------------------------------------------
// Fixed-layout packing
// ---------------------------------------------------------------------------
//
// Pre-paginated pages clip at the viewport, so a card that doesn't fit is
// simply cut off mid-image in the reader. Instead of a fixed entries-per-page
// count (which ignores how much taller a card with a picture/video is than a
// text-only one), every card's height is *predicted* from the same rem-based
// metrics the stylesheet uses, and entries are packed onto a page until the
// viewport budget is spent. Because both the CSS and the estimate derive from
// the CARD/PAGE constants below, the prediction stays honest as long as they
// change together.

/** Layout metrics in rem — single source for the stylesheet AND the height
 *  estimator. Keep the two in sync by only ever editing these constants. */
const CARD = {
  padY: 0.9,
  padX: 1.0,
  gapBelow: 0.9,
  /** Headword line: 1.15rem font × 1.3 line-height. */
  termLine: 1.15 * 1.3,
  defMarginTop: 0.35,
  defLineHeight: 1.45,
  /** Average glyph advance at 1rem for the bundled serif — deliberately
   *  generous so line-count estimates round up, never down. */
  avgCharWidthRem: 0.55,
  /** Picture chip floated to the right of the text column. */
  imageBox: 6.8,
  imageGap: 0.9,
  /** Sign-language toggle: pill button row, then the video that expands
   *  below it when opened. */
  slButtonMarginTop: 0.6,
  slButtonRow: 2.0,
  videoMarginTop: 0.6,
  videoHeight: 9,
  backlinkMarginTop: 0.6,
  /** Backlink row: 0.85rem font × ~1.3 line-height. */
  backlinkLine: 1.1,
} as const

const PAGE = {
  pad: 1.5,
  /** Heading: 1.6rem font × 1.3 line-height. */
  headingLine: 1.6 * 1.3,
  headingMarginBottom: 1.0,
  /** Fraction of the remaining height we allow the packer to fill — the
   *  8% reserve absorbs estimate error (font metrics, rounding). */
  fill: 0.92,
} as const

/** Root font-size for a pre-paginated page, so all rem metrics scale with
 *  the book's page size. */
export function fixedRootFontPx(viewport: { width: number; height: number }): number {
  return Math.max(10, Math.round(viewport.height / 45))
}

/**
 * Predicted rendered height of one card in rem, from the CARD metrics.
 * `contentWidthRem` is the text column width (page minus paddings), used to
 * estimate how many lines the definition and backlinks wrap to.
 *
 * A card with a sign-language video is budgeted with its video OPEN: the
 * toggle expands in-flow, and on a pre-paginated page that expansion must
 * never push the following card across the page boundary — so the packer
 * reserves the space up front.
 */
export function estimateCardHeightRem(
  entry: GlossaryPageEntry,
  contentWidthRem: number,
  hasVideo: boolean,
): number {
  const hasImage = Boolean(entry.entry.image)
  // The floated picture narrows the text column it sits beside.
  const columnRem = hasImage
    ? Math.max(8, contentWidthRem - CARD.imageBox - CARD.imageGap)
    : contentWidthRem
  const charsPerLine = Math.max(10, columnRem / CARD.avgCharWidthRem)
  const defLines = Math.max(1, Math.ceil(entry.entry.definition.length / charsPerLine))
  let h =
    2 * CARD.padY +
    CARD.termLine +
    CARD.defMarginTop +
    defLines * CARD.defLineHeight
  if (hasVideo) {
    h += CARD.slButtonMarginTop + CARD.slButtonRow + CARD.videoMarginTop + CARD.videoHeight
  }
  if (entry.backlinks.length > 0) {
    // Each link ≈ label width + separator dot; wraps against the column.
    const linksWidthRem = entry.backlinks.reduce(
      (sum, bl) => sum + bl.label.length * 0.5 + 1.1,
      0,
    )
    const lines = Math.max(1, Math.ceil(linksWidthRem / columnRem))
    h += CARD.backlinkMarginTop + lines * CARD.backlinkLine
  }
  // The floated picture sets a floor: the card is at least tall enough to
  // contain its chip (the ::after clearfix guarantees this in CSS).
  if (hasImage) {
    h = Math.max(h, 2 * CARD.padY + CARD.imageBox + 0.5)
  }
  return h + CARD.gapBelow
}

/**
 * Greedy packer: fill each pre-paginated page with cards until the next one
 * would cross the viewport budget. Order is preserved (entries arrive
 * alphabetically sorted); every page holds at least one card, so a single
 * oversized card degrades to `overflow: hidden` clipping rather than
 * spilling onto the next entry's page.
 */
export function packEntriesForFixedViewport(
  entries: GlossaryPageEntry[],
  viewport: { width: number; height: number },
  videoHrefBySourceId?: Map<string, string>,
): GlossaryPageEntry[][] {
  const rootPx = fixedRootFontPx(viewport)
  const widthRem = viewport.width / rootPx
  const heightRem = viewport.height / rootPx
  const contentWidthRem = widthRem - 2 * PAGE.pad - 2 * CARD.padX
  const usable =
    (heightRem - 2 * PAGE.pad - PAGE.headingLine - PAGE.headingMarginBottom) * PAGE.fill

  const chunks: GlossaryPageEntry[][] = []
  let current: GlossaryPageEntry[] = []
  let used = 0
  for (const e of entries) {
    const h = estimateCardHeightRem(
      e,
      contentWidthRem,
      videoHrefBySourceId?.has(e.entry.sourceId) ?? false,
    )
    if (current.length > 0 && used + h > usable) {
      chunks.push(current)
      current = []
      used = 0
    }
    current.push(e)
    used += h
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

// ---------------------------------------------------------------------------
// XHTML rendering
// ---------------------------------------------------------------------------

interface RenderPageInput {
  language: string
  heading: string
  entries: GlossaryPageEntry[]
  fixedViewport?: { width: number; height: number }
  videoHrefBySourceId?: Map<string, string>
  signLanguageLabel: string
}

/**
 * Progressive enhancement for the sign-language toggles. The markup ships a
 * `<details>` disclosure with a plain `<video controls>` inside, so a reader
 * without scripting still gets a working open/close button and a playable
 * video. Where scripting runs (Apple Books does), the script strips the
 * native controls and plays/stops the video on toggle — press the hands
 * button to watch, press again to close. ES5 + CDATA so the tiniest reader
 * engines and strict XML parsers both stay happy.
 */
const SIGN_LANGUAGE_SCRIPT = `  <script>//<![CDATA[
document.addEventListener("DOMContentLoaded", function () {
  var toggles = document.querySelectorAll("details.glp-sl");
  for (var i = 0; i < toggles.length; i++) (function (d) {
    var v = d.querySelector("video");
    if (!v) return;
    v.removeAttribute("controls");
    d.addEventListener("toggle", function () {
      if (d.open) {
        try { v.currentTime = 0; } catch (e) {}
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else {
        v.pause();
      }
    });
  })(toggles[i]);
});
//]]></script>`

/**
 * Card-based glossary list. Kept as a `<dl>` inside
 * `<section epub:type="glossary" role="doc-glossary">` so the document stays
 * semantically a glossary for assistive tech, with each dt/dd pair wrapped in
 * a `<div>` group (valid per the HTML dl content model) to give cards a
 * styling/anchor root.
 *
 * Card anatomy: the picture floats to the RIGHT of the whole card (emitted
 * first inside the dt so the float starts at the headword line; the term,
 * definition and backlinks wrap beside it). A sign-language video sits
 * behind a hands-button `<details>` toggle instead of an always-visible
 * player.
 */
function renderGlossaryPageXhtml(input: RenderPageInput): string {
  const { language, heading, entries, fixedViewport, videoHrefBySourceId, signLanguageLabel } =
    input

  let hasVideo = false
  const cards = entries
    .map(({ entry, backlinks }) => {
      const emoji = entry.emoji
        ? `<span class="glp-emoji" aria-hidden="true">${escapeXml(entry.emoji)}</span>`
        : ""
      // The headword sits right beside the picture; alt text would only
      // duplicate it for screen readers, so the image is decorative.
      const image = entry.image
        ? `<img class="glp-image" src="${escapeXml(entry.image)}" alt=""/>`
        : ""
      const videoHref = videoHrefBySourceId?.get(entry.sourceId)
      if (videoHref) hasVideo = true
      // `controls` is the no-script fallback — the page script removes it
      // and drives play/stop from the details toggle instead.
      const signLanguage = videoHref
        ? `\n        <details class="glp-sl">
          <summary><i class="fa fa-sign-language glp-sl-hands" aria-hidden="true"></i>${escapeXml(signLanguageLabel)}</summary>
          <video class="glp-video" controls="controls" loop="loop" playsinline="playsinline" preload="metadata" src="${escapeXml(videoHref)}"></video>
        </details>`
        : ""
      const links =
        backlinks.length > 0
          ? `\n        <nav class="glp-backlinks"><ol>${backlinks
              .map(
                (bl) =>
                  `<li><a epub:type="backlink" href="${escapeXml(bl.href)}">${escapeXml(bl.label)}</a></li>`,
              )
              .join("")}</ol></nav>`
          : ""
      // Valid dl content model: the div-in-dl group holds exactly dt then
      // dd; definition/video/backlinks live inside the dd.
      return `      <div class="glp-card" id="${escapeXml(entry.id)}">
        <dt class="glp-term">${image}<dfn>${escapeXml(entry.word)}</dfn>${emoji}</dt>
        <dd class="glp-detail">
        <p class="glp-definition">${escapeXml(entry.definition)}</p>${signLanguage}${links}
        </dd>
      </div>`
    })
    .join("\n")

  const viewportMeta = fixedViewport
    ? `\n  <meta name="viewport" content="width=${fixedViewport.width}, height=${fixedViewport.height}"/>`
    : ""

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML_NS}" xmlns:epub="${EPUB_NS}" lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8"/>${viewportMeta}
  <title>${escapeXml(heading)}</title>
  <link href="assets/fonts.css" rel="stylesheet"/>
  <link href="assets/libs/fontawesome/css/all.min.css" rel="stylesheet"/>
  <style>
${glossaryPageCss(fixedViewport)}
  </style>
${hasVideo ? `${SIGN_LANGUAGE_SCRIPT}\n` : ""}</head>
<body class="glp-page">
  <section epub:type="glossary" role="doc-glossary">
    <h1 class="glp-heading">${escapeXml(heading)}</h1>
    <dl class="glp-list">
${cards}
    </dl>
  </section>
</body>
</html>`
}

/**
 * Self-contained styling — glossary pages are generated after the Tailwind
 * build, so no utility classes are available; everything is plain CSS.
 *
 * Card anatomy: the picture chip floats top-right (the float is emitted at
 * the start of the dt, so the headword, definition and backlinks all wrap
 * beside it; the ::after clearfix makes the card contain it). The picture
 * scales *inside* its fixed box (`object-fit`) instead of dictating the card
 * size — a tall source image can no longer blow the card up, which is what
 * broke the layout in Apple Books. The sign-language video hides behind a
 * hands-button `<details>` pill and expands in-flow below the definition.
 *
 * For fixed layout the root font-size derives from the viewport height so
 * every rem metric scales with the book's page size, and the same CARD/PAGE
 * constants feed the packer (videos budgeted as open) so content never
 * crosses the page boundary (`overflow: hidden` on body is only the
 * last-resort backstop).
 */
function glossaryPageCss(fixedViewport?: { width: number; height: number }): string {
  const fixedRoot = fixedViewport
    ? `html { font-size: ${fixedRootFontPx(fixedViewport)}px; }
body { width: ${fixedViewport.width}px; height: ${fixedViewport.height}px; margin: 0; overflow: hidden; }
section { height: 100%; box-sizing: border-box; }`
    : `html { font-size: 100%; }`
  const videoWidth = ((CARD.videoHeight * 16) / 9).toFixed(2)
  return `${fixedRoot}
body { font-family: inherit; color: #1a1a1a; }
section { padding: ${PAGE.pad}rem; }
.glp-heading { font-size: 1.6rem; line-height: 1.3; margin: 0 0 ${PAGE.headingMarginBottom}rem 0; }
.glp-list { margin: 0; padding: 0; }
.glp-card {
  padding: ${CARD.padY}rem ${CARD.padX}rem;
  margin: 0 0 ${CARD.gapBelow}rem 0;
  border: 1px solid #dcdcdc;
  border-radius: 0.6rem;
  page-break-inside: avoid;
  break-inside: avoid;
}
.glp-card::after { content: ""; display: block; clear: both; }
.glp-term { font-weight: bold; font-size: 1.15rem; line-height: 1.3; margin: 0; }
.glp-term dfn { font-style: normal; }
.glp-emoji { margin-left: 0.45rem; font-weight: normal; }
.glp-image {
  float: right;
  width: ${CARD.imageBox}rem;
  height: ${CARD.imageBox}rem;
  margin: 0 0 0.5rem ${CARD.imageGap}rem;
  box-sizing: border-box;
  object-fit: contain;
  background-color: #f4f4f4;
  border-radius: 0.5rem;
  padding: 0.4rem;
}
.glp-detail { margin: 0; }
.glp-definition { margin: ${CARD.defMarginTop}rem 0 0 0; font-size: 1rem; line-height: ${CARD.defLineHeight}; }
.glp-sl { margin-top: ${CARD.slButtonMarginTop}rem; }
.glp-sl summary {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  height: ${CARD.slButtonRow}rem;
  box-sizing: border-box;
  padding: 0 0.85rem;
  border: 1px solid #d0d0d0;
  border-radius: 999px;
  background-color: #f7f7f7;
  font-size: 0.85rem;
  font-weight: bold;
  cursor: pointer;
  list-style: none;
}
.glp-sl summary::-webkit-details-marker { display: none; }
.glp-sl summary::marker { content: ""; }
.glp-sl[open] summary { background-color: #e9e9e9; }
.glp-sl-hands { font-size: 1.05rem; line-height: 1; }
.glp-video {
  display: block;
  margin-top: ${CARD.videoMarginTop}rem;
  height: ${CARD.videoHeight}rem;
  width: ${videoWidth}rem;
  max-width: 100%;
  background-color: #101010;
  border-radius: 0.5rem;
}
.glp-backlinks { margin-top: ${CARD.backlinkMarginTop}rem; font-size: 0.85rem; line-height: 1.3; }
.glp-backlinks ol { list-style: none; margin: 0; padding: 0; }
.glp-backlinks li { display: inline-block; }
.glp-backlinks li + li { margin-left: 0.55rem; }
.glp-backlinks li + li::before { content: "\\00b7"; margin-right: 0.55rem; color: #8a8a8a; }
.glp-backlinks a { color: #2563eb; }`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
