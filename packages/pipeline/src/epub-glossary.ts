/**
 * EPUB-native glossary surface, built to the EPUB 3 Dictionaries &
 * Glossaries model that the BookFusion reader consumes:
 *
 *   - Each first occurrence of a term on a page becomes an
 *     `<a epub:type="glossref" href="glossary.xhtml#gl_NNN">…</a>` wrapping
 *     the existing word `<span id>` elements. The reader resolves the
 *     fragment against the parsed glossary and shows a definition popover.
 *   - `glossary.xhtml` is a `<section epub:type="glossary" role="doc-glossary">`
 *     containing a `<dl>` of `<dt id="gl_NNN"><dfn>term</dfn></dt><dd>…</dd>`
 *     entries. The reader's glossary parser keys off this exact shape; the
 *     `<dd>` may carry a `<nav>` of `epub:type="backlink"` anchors pointing
 *     back at the in-text occurrences ("Used in").
 *   - A `<nav epub:type="landmarks">` entry of `epub:type="glossary"` in the
 *     navigation document is what surfaces the reader's Glossary tab.
 *
 * Matching mirrors the web runtime (apps/adt-runtime/src/features/glossary/
 * lib/highlight.ts): longest-first, case-insensitive, `\b…\b`, variations
 * canonicalised to the parent word, first-occurrence per page.
 *
 * The footnote/`noteref` model (a different reader code path) is deliberately
 * not used: it never registers as a glossary, so no tab would appear.
 */
import { JSDOM } from "jsdom"

export interface GlossaryEntry {
  /** Stable EPUB id used in href fragments + `<dt>` ids (`gl_001` …). */
  id: string
  /** Canonical (already translated) headword. */
  word: string
  definition: string
  variations: string[]
  emoji: string
}

/** A reference to one in-text occurrence, used to build backlinks. */
export interface GlossaryBacklink {
  /** Resolvable href to the occurrence, e.g. `pg002_sec001.xhtml#pg002_p0_w006`. */
  href: string
  /** Human label for the link, e.g. `Page 3`. */
  label: string
}

/** Shape of `OEBPS/content/i18n/<lang>/glossary.json` (see buildGlossaryJson). */
type GlossaryJson = Record<
  string,
  { word: string; definition: string; variations: string[]; emoji: string }
>

const XHTML_NS = "http://www.w3.org/1999/xhtml"
const EPUB_NS = "http://www.idpf.org/2007/ops"

/** Paragraphs we never turn into a glossref — same intent as the web SKIP list. */
const SKIP_PARENT_SELECTOR =
  "h1, h2, h3, h4, h5, h6, nav, .activity-text, [data-activity-item], .word-card"

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Read the glossary JSON for a language, assign stable EPUB ids, and return
 * the list in declaration order. Returns an empty list if the file is
 * missing or empty so callers can branch on `length === 0`.
 */
export function loadGlossaryEntries(json: GlossaryJson | undefined): GlossaryEntry[] {
  if (!json) return []
  const entries: GlossaryEntry[] = []
  let i = 0
  for (const [, raw] of Object.entries(json)) {
    i += 1
    entries.push({
      id: `gl_${String(i).padStart(3, "0")}`,
      word: raw.word,
      definition: raw.definition,
      variations: raw.variations ?? [],
      emoji: raw.emoji ?? "",
    })
  }
  return entries
}

// ---------------------------------------------------------------------------
// Matcher (port of apps/adt-runtime/src/features/glossary/lib/highlight.ts)
// ---------------------------------------------------------------------------

interface TermDescriptor {
  /** Text to match (variation or canonical). */
  text: string
  /** Entry id this match resolves to. */
  entryId: string
  /** Lowercase dedupe key — variations of the same word share it. */
  baseForm: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildDescriptors(entries: GlossaryEntry[]): TermDescriptor[] {
  const items: TermDescriptor[] = []
  for (const e of entries) {
    const baseForm = e.word.toLowerCase().replace(/[es]?s$/, "")
    items.push({ text: e.word, entryId: e.id, baseForm })
    for (const v of e.variations) {
      items.push({
        text: v,
        entryId: e.id,
        baseForm: v.toLowerCase().replace(/[es]?s$/, ""),
      })
    }
  }
  // Longest first so multi-word terms beat their substrings.
  items.sort((a, b) => b.text.length - a.text.length)
  return items
}

// ---------------------------------------------------------------------------
// DOM wrapping
// ---------------------------------------------------------------------------

/** One in-text occurrence found while wrapping a page. */
export interface GlossaryOccurrence {
  entryId: string
  /** Id of an element inside the glossref anchor, for backlink targeting. */
  fragment: string
}

/**
 * Wrap glossary terms in each `[data-id]` paragraph of an XHTML page.
 * Returns the rewritten XHTML and the occurrences found on this page (one
 * per first-matched term), so the caller can build per-entry backlinks.
 */
export function wrapGlossaryTerms(
  xhtml: string,
  entries: GlossaryEntry[],
): { xhtml: string; occurrences: GlossaryOccurrence[] } {
  if (entries.length === 0) return { xhtml, occurrences: [] }

  const dom = new JSDOM(xhtml, { contentType: "application/xhtml+xml" })
  const doc = dom.window.document

  const descriptors = buildDescriptors(entries)
  const occurrences: GlossaryOccurrence[] = []
  // First-occurrence-per-page — reset between pages, matching the web
  // runtime's per-section scope.
  const seen = new Set<string>()

  for (const para of Array.from(doc.querySelectorAll("[data-id]"))) {
    if (para.tagName.toLowerCase() === "img") continue
    if (para.closest(SKIP_PARENT_SELECTOR)) continue
    wrapInParagraph(para, descriptors, seen, occurrences)
  }

  if (occurrences.length > 0) ensureEpubNamespace(doc)
  return { xhtml: serializeXhtml(dom), occurrences }
}

interface Atom {
  /** Inline node carrying its own text (word-span or bare text). */
  node: Node
  text: string
  start: number
  end: number
}

function wrapInParagraph(
  para: Element,
  descriptors: TermDescriptor[],
  seen: Set<string>,
  occurrences: GlossaryOccurrence[],
): void {
  const atoms = collectAtoms(para)
  if (atoms.length === 0) return

  const concat = atoms.map((a) => a.text).join("")
  if (!concat.trim()) return

  interface Wrapped {
    start: number
    end: number
    entryId: string
  }
  const wrapped: Wrapped[] = []
  const overlapsWrapped = (s: number, e: number): boolean =>
    wrapped.some((w) => s < w.end && e > w.start)

  for (const desc of descriptors) {
    if (seen.has(desc.baseForm)) continue
    const re = new RegExp(`\\b${escapeRegExp(desc.text)}\\b`, "i")
    const m = re.exec(concat)
    if (!m || m.index === undefined) continue
    const start = m.index
    const end = start + m[0].length
    if (overlapsWrapped(start, end)) continue
    seen.add(desc.baseForm)
    wrapped.push({ start, end, entryId: desc.entryId })
  }

  if (wrapped.length === 0) return

  // Apply in reverse document order so earlier mutations don't shift the
  // atom node references we still need for later (earlier-positioned) wraps.
  wrapped.sort((a, b) => b.start - a.start)
  for (const w of wrapped) {
    const range = atomsCovering(atoms, w.start, w.end)
    if (range.length === 0) continue
    const fragment = wrapAtomsWithGlossref(para.ownerDocument!, range, w.entryId)
    occurrences.push({ entryId: w.entryId, fragment })
  }
}

function collectAtoms(para: Element): Atom[] {
  const atoms: Atom[] = []
  let cursor = 0
  for (const child of Array.from(para.childNodes)) {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      const text = child.textContent ?? ""
      if (text.length === 0) continue
      atoms.push({ node: child, text, start: cursor, end: cursor + text.length })
      cursor += text.length
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      // Each direct element child (word-span, inline <em>/<strong>, styled
      // separator span) is one atom; its text is its textContent.
      const text = child.textContent ?? ""
      atoms.push({ node: child, text, start: cursor, end: cursor + text.length })
      cursor += text.length
    }
  }
  return atoms
}

function atomsCovering(atoms: Atom[], start: number, end: number): Atom[] {
  const out: Atom[] = []
  for (const a of atoms) {
    if (a.end <= start) continue
    if (a.start >= end) break
    out.push(a)
  }
  return out
}

/**
 * Wrap the given atoms in a glossref anchor and return a fragment id that
 * resolves to a node inside it (for backlink targeting). Prefers an existing
 * id on a wrapped element (the word-span id emitted by `wrapWordSpans`);
 * falls back to stamping the anchor itself.
 */
function wrapAtomsWithGlossref(doc: Document, atoms: Atom[], entryId: string): string {
  const first = atoms[0].node
  const parent = first.parentNode
  const anchor = doc.createElementNS(XHTML_NS, "a")
  // Plain attribute (not setAttributeNS): JSDOM's serializer otherwise
  // synthesises a fresh `xmlns:ns1=…` prefix on every element instead of
  // reusing the `xmlns:epub` declaration on <html>. Readers resolve
  // `epub:type` against the ancestor namespace either way.
  anchor.setAttribute("epub:type", "glossref")
  // The `glossref` class is the styling hook: a class selector dodges the
  // XML-namespace pitfalls of an `[epub|type~=glossref]` attribute selector,
  // and the reader keys its popover off `epub:type`, not the class. The CSS
  // rule (dotted underline) ships via injectWebpubStyles.
  anchor.setAttribute("class", "glossref")
  anchor.setAttribute("href", `glossary.xhtml#${entryId}`)
  if (parent) parent.insertBefore(anchor, first)
  for (const a of atoms) anchor.appendChild(a.node)

  const inner = anchor.querySelector("[id]")
  if (inner?.id) return inner.id
  const fallback = `glref_${entryId}`
  anchor.setAttribute("id", fallback)
  return fallback
}

function ensureEpubNamespace(doc: Document): void {
  const html = doc.documentElement
  if (!html) return
  if (html.getAttribute("xmlns:epub") === EPUB_NS) return
  html.setAttribute("xmlns:epub", EPUB_NS)
}

/**
 * Re-attach a single canonical XHTML prologue. JSDOM's serializer emits the
 * parsed DOCTYPE but never the XML declaration, so we strip whatever leading
 * `<?xml?>` / `<!DOCTYPE>` it produced and prepend exactly one of each.
 * Without the strip the DOCTYPE would be duplicated, which is a fatal XML
 * parse error in strict EPUB readers.
 */
function serializeXhtml(dom: JSDOM): string {
  const body = dom
    .serialize()
    .replace(/^\s*<\?xml[^>]*\?>\s*/i, "")
    .replace(/^\s*<!DOCTYPE[^>]*>\s*/i, "")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n${body}`
}

// ---------------------------------------------------------------------------
// glossary.xhtml builder
// ---------------------------------------------------------------------------

export interface BuildGlossaryDocumentInput {
  language: string
  /** Localised page title (e.g. "Glossary" / "Glosario"). */
  heading: string
  entries: GlossaryEntry[]
  /**
   * Entry id → backlinks to its in-text occurrences. Only entries present
   * as keys are emitted; an entry with an empty array still appears (it was
   * referenced but we couldn't resolve a target).
   */
  backlinksByEntry: Map<string, GlossaryBacklink[]>
}

/**
 * Build the glossary content document: an EPUB 3 doc-glossary `<dl>` the
 * reader parses into entries, with each definition followed by a backlink
 * `<nav>` ("Used in"). Entries are sorted alphabetically by headword.
 */
export function buildGlossaryDocument(input: BuildGlossaryDocumentInput): string {
  const { language, heading, entries, backlinksByEntry } = input

  const used = entries.filter((e) => backlinksByEntry.has(e.id))
  used.sort((a, b) => a.word.localeCompare(b.word, language || undefined))

  const rows = used
    .map((e) => {
      const emoji = e.emoji
        ? `<span class="gl-emoji" aria-hidden="true">${escapeXml(e.emoji)} </span>`
        : ""
      const backlinks = backlinksByEntry.get(e.id) ?? []
      const backlinkNav =
        backlinks.length > 0
          ? `
      <nav class="gl-backlinks">
        <ol>
${backlinks
  .map(
    (bl) =>
      `          <li><a epub:type="backlink" href="${escapeXml(bl.href)}">${escapeXml(bl.label)}</a></li>`,
  )
  .join("\n")}
        </ol>
      </nav>`
          : ""
      return `      <dt id="${escapeXml(e.id)}"><dfn>${escapeXml(e.word)}</dfn></dt>
      <dd><p>${emoji}${escapeXml(e.definition)}</p>${backlinkNav}
      </dd>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML_NS}" xmlns:epub="${EPUB_NS}" lang="${escapeXml(language)}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeXml(heading)}</title>
</head>
<body>
  <section epub:type="glossary" role="doc-glossary">
    <h1>${escapeXml(heading)}</h1>
    <dl class="gl-list">
${rows}
    </dl>
  </section>
</body>
</html>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
