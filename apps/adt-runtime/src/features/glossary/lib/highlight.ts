/**
 * Wraps glossary terms found in `#content` text nodes with clickable spans.
 * Pure DOM mutation — kept out of React's render path because the static
 * book HTML is shipped as-is and the runtime augments it in place.
 *
 * Direct port of the legacy `highlightGlossaryTerms` / `removeGlossaryHighlights`
 * pair from `assets/adt/modules/interface.js`, with two refinements:
 *   1. Each highlight stores `data-glossary-key` so click handlers can look
 *      up the canonical entry (variations resolve to their parent key).
 *   2. The matcher only highlights the *first* occurrence per base form —
 *      same as the legacy behavior — to avoid carpeting the page.
 */
import type { GlossaryData } from "@/features/glossary/state/glossary.atoms"

const HIGHLIGHT_CLASS = "glossary-term"
const HIGHLIGHT_TAILWIND =
  "glossary-term bg-emerald-100/80 text-emerald-800 rounded cursor-pointer"
const SKIP_PARENT_SELECTOR =
  "h1, h2, h3, h4, h5, h6, script, style, .glossary-term, .glossary-popup, .activity-text, [data-activity-item]"

interface TermDescriptor {
  /** Display text used for matching (the variation or canonical word). */
  text: string
  /** Canonical key into glossaryData (the dictionary entry's key). */
  termKey: string
  /** Lowercase form used to dedupe across variations of the same word. */
  baseForm: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildTermDescriptors(data: GlossaryData): TermDescriptor[] {
  const items: TermDescriptor[] = []
  for (const [key, value] of Object.entries(data)) {
    const baseForm = key.toLowerCase().replace(/[es]?s$/, "")
    items.push({ text: key, termKey: key, baseForm })
    for (const v of value.variations ?? []) {
      items.push({
        text: v,
        termKey: key,
        baseForm: v.toLowerCase().replace(/[es]?s$/, ""),
      })
    }
  }
  // Longest first so "data set" beats "data" when both appear.
  items.sort((a, b) => b.text.length - a.text.length)
  return items
}

function isAcceptableTextNode(node: Node): boolean {
  const parent = node.parentElement
  if (!parent) return false
  if (parent.closest(SKIP_PARENT_SELECTOR)) return false
  return Boolean(node.textContent && node.textContent.trim().length > 0)
}

function collectTextNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isAcceptableTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  })
  const nodes: Text[] = []
  let n = walker.nextNode()
  while (n) {
    nodes.push(n as Text)
    n = walker.nextNode()
  }
  return nodes
}

/**
 * Mutates `#content` so glossary terms are wrapped in clickable spans.
 * Returns true if any term was highlighted.
 */
export function applyGlossaryHighlights(data: GlossaryData): boolean {
  const content = document.getElementById("content")
  if (!content) return false

  const descriptors = buildTermDescriptors(data)
  if (descriptors.length === 0) return false

  // Track which canonical terms have already been highlighted so we only
  // emphasize each concept once.
  const seen = new Set<string>()

  const textNodes = collectTextNodes(content)
  let highlighted = false

  for (const node of textNodes) {
    const original = node.textContent ?? ""
    if (!original.trim()) continue

    type Segment =
      | { kind: "text"; text: string }
      | { kind: "term"; text: string; termKey: string }

    let segments: Segment[] = [{ kind: "text", text: original }]
    let mutated = false

    for (const desc of descriptors) {
      if (seen.has(desc.baseForm)) continue
      const re = new RegExp(`\\b${escapeRegExp(desc.text)}\\b`, "i")
      // Walk segments; replace the first text segment that contains a match.
      let didMatch = false
      const next: Segment[] = []
      for (const seg of segments) {
        if (didMatch || seg.kind !== "text") {
          next.push(seg)
          continue
        }
        const m = seg.text.match(re)
        if (!m || m.index === undefined) {
          next.push(seg)
          continue
        }
        const before = seg.text.slice(0, m.index)
        const matched = m[0]
        const after = seg.text.slice(m.index + matched.length)
        if (before) next.push({ kind: "text", text: before })
        next.push({ kind: "term", text: matched, termKey: desc.termKey })
        if (after) next.push({ kind: "text", text: after })
        didMatch = true
        seen.add(desc.baseForm)
      }
      if (didMatch) {
        segments = next
        mutated = true
      }
    }

    if (!mutated) continue

    const fragment = document.createDocumentFragment()
    for (const seg of segments) {
      if (seg.kind === "text") {
        fragment.appendChild(document.createTextNode(seg.text))
      } else {
        const span = document.createElement("span")
        span.className = HIGHLIGHT_TAILWIND
        // fonts.css applies the reading font to every bare `span` (a direct
        // element rule beats inheritance), which would flip the highlighted
        // word out of its fixed-layout segment font into the default serif.
        // Inline `font: inherit` restores inheritance with inline-style
        // precedence, keeping the wrap typographically invisible.
        span.style.font = "inherit"
        span.setAttribute("role", "button")
        span.setAttribute("tabindex", "0")
        span.setAttribute("data-glossary-key", seg.termKey)
        span.textContent = seg.text
        fragment.appendChild(span)
      }
    }
    node.parentNode?.replaceChild(fragment, node)
    highlighted = true
  }

  return highlighted
}

/**
 * Reverse of `applyGlossaryHighlights`. Replaces every `.glossary-term`
 * span with a plain text node and re-merges adjacent text nodes so the
 * DOM is indistinguishable from the original markup.
 */
export function removeGlossaryHighlights(): void {
  const content = document.getElementById("content")
  if (!content) return
  const spans = content.querySelectorAll<HTMLSpanElement>(`.${HIGHLIGHT_CLASS}`)
  spans.forEach((span) => {
    const text = document.createTextNode(span.textContent ?? "")
    span.parentNode?.replaceChild(text, span)
  })
  // Merge adjacent text nodes that result from the unwrap.
  content.normalize()
}
