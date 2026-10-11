import { DomUtils, Parser, parseDocument } from "htmlparser2"
import type {
  ContentNodeData, PageSectioningSection, SectionSyncResult,
  SectioningSyncCandidate, SectioningSyncInput,
} from "@adt/types"
import { collectOptionalTextIds } from "./render-llm.js"
import { isGeneratedActivityId } from "./generated-activity-identity.js"

// Adapted from PR #581 (Kemal Sokolovic, 8d077980): pure classification and
// optional-text handling. Stored HTML is deliberately NOT passed through the
// generation validator: its normalization can rewrite layout/custom content.
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr",
])
// These contexts do not share ordinary HTML text parsing/display semantics.
// htmlparser2 deliberately does not perform the browser's tree construction;
// do not mistake a leaf inside one for a proven visible text projection.
const UNSUPPORTED_TEXT_CONTEXTS = new Set([
  "script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes",
  "plaintext", "template", "noscript", "select", "option", "optgroup", "svg", "math",
])

function inspectHtml(html: string) {
  let malformed = false
  let attributes = new Set<string>()
  const parser = new Parser({
    onopentagname() { attributes = new Set() },
    onattribute(name) {
      if (attributes.has(name)) malformed = true
      attributes.add(name)
    },
    onclosetag(name, implied) {
      if (implied && !VOID_TAGS.has(name)) malformed = true
    },
  })
  parser.end(html)
  const doc = parseDocument(html, { withStartIndices: true, withEndIndices: true })
  const sections = DomUtils.getElementsByTagName("section", doc.children, true)
  return { doc, sections, malformed }
}

function activeNodes(nodes: ContentNodeData[]): ContentNodeData[] {
  return nodes.filter((node) => !node.isPruned).flatMap((node) => [
    node, ...activeNodes(node.children ?? []),
  ])
}

/** Only ordinary leaf text has a supported projection; retain other fields. */
function structure(section: PageSectioningSection): string {
  const withoutText = (nodes: ContentNodeData[]): unknown => nodes.map(({ text, children, ...node }) => ({
    ...node,
    ...(!node.role || node.role === "image" ? { text } : {}),
    ...(children ? { children: withoutText(children) } : {}),
  }))
  const { nodes, ...rest } = section
  return JSON.stringify({ ...rest, nodes: withoutText(nodes) })
}

function escapeText(text: string): string {
  // Literal CR is normalized to LF by the browser before HTML tokenization.
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#13;")
}

/** Preserve the renderer's blank markers only with an exact, unique mapping. */
function projectText(before: string, after: string, rendered: string): string | null {
  if (rendered === before) return after
  const blanks = /(\[placeholder:[^\]]+\]|_{3,}|\.{3,})/g
  const previous = before.split(blanks)
  const proposed = after.split(blanks)
  const actual = rendered.split(/(\[\[blank:item-\d+(?::[^\]]+)?\]\])/g)
  if (previous.length < 3 || previous.length !== proposed.length || previous.length !== actual.length) return null
  const blankIds = new Set<string>()
  for (let i = 0; i < previous.length; i++) {
    if (i % 2 === 0 ? previous[i] !== actual[i] : previous[i] !== proposed[i]) return null
    if (i % 2) {
      const id = actual[i].match(/^\[\[blank:(item-\d+)/)![1]
      if (blankIds.has(id)) return null
      blankIds.add(id)
    }
  }
  return proposed.map((part, i) => i % 2 ? actual[i] : part).join("")
}

function patchSection(before: PageSectioningSection, after: PageSectioningSection, html: string) {
  const parsed = inspectHtml(html)
  const fail = (status: SectionSyncResult["status"], diagnostic: string) => ({ status, diagnostics: [diagnostic], html })
  if (parsed.malformed || parsed.sections.length !== 1) {
    return fail("invalid-rendering", "Rendering must contain exactly one explicitly closed section.")
  }
  const root = parsed.sections[0]
  if (root.attribs["data-section-id"] !== after.sectionId || root.attribs["data-section-type"] !== after.sectionType) {
    return fail("invalid-rendering", "Rendered section identity or type does not match the source.")
  }
  if (structure(before) !== structure(after)) return fail("structural-drift", "The source structure changed.")
  const nodes = activeNodes(before.nodes)
  const ids = new Set(nodes.map((node) => node.nodeId))
  if (ids.size !== nodes.length) return fail("structural-drift", "Source node identities are not unique.")
  const elements = DomUtils.getElementsByTagName("*", root.children, true)
  const byId = new Map<string, typeof elements>()
  for (const element of elements) {
    const id = element.attribs["data-id"]
    if (!id) {
      if (element.name === "img") return fail("structural-drift", "An image has no stable identity.")
      continue
    }
    const matches = byId.get(id) ?? []
    matches.push(element)
    byId.set(id, matches)
    if (matches.length !== 1) return fail("invalid-rendering", `Duplicate rendered node: ${id}`)
    if (!ids.has(id) && !id.startsWith("activity_gen_") && !id.startsWith(`${after.sectionId}__activity_gen_`) && !isGeneratedActivityId(id, after.sectionId)) return fail("structural-drift", `Unknown rendered node: ${id}`)
  }
  const optional = collectOptionalTextIds(nodes.filter((n) => n.role && n.role !== "image").map((n) => ({
    text_id: n.nodeId, text_type: n.role!, text: n.text ?? "",
  })))
  const nextNodes = new Map(activeNodes(after.nodes).map((node) => [node.nodeId, node]))
  const replacements: Array<{ start: number; end: number; text: string }> = []
  for (const node of nodes) {
    if (!node.role) continue // Containers are preserved, never flattened.
    const element = byId.get(node.nodeId)?.[0]
    const next = nextNodes.get(node.nodeId)!
    if (!element) {
      if (optional.has(node.nodeId) && node.text === next.text) continue
      return fail("structural-drift", `Missing rendered node: ${node.nodeId}`)
    }
    if (node.role === "image") {
      if (element.name !== "img") return fail("structural-drift", `Image identity is not on an image: ${node.nodeId}`)
      continue // Never rewrite src or any other image attribute.
    }
    const textNode = element.children[0]
    if (element.children.length > 1 || (textNode && textNode.type !== "text") || VOID_TAGS.has(element.name)) {
      return fail("structural-drift", `Text projection contains unsupported markup: ${node.nodeId}`)
    }
    if (UNSUPPORTED_TEXT_CONTEXTS.has(element.name)) return fail("structural-drift", `Text projection is not ordinary display text: ${node.nodeId}`)
    for (let ancestor = element.parent; ancestor; ancestor = ancestor.parent) {
      if ("name" in ancestor && UNSUPPORTED_TEXT_CONTEXTS.has(ancestor.name)) return fail("structural-drift", `Text projection has an unsupported parsing context: ${node.nodeId}`)
    }
    const renderedText = textNode?.data ?? ""
    const projected = projectText(node.text ?? "", next.text ?? "", renderedText)
    if (projected === null) return fail("protected-divergence", `Rendered text differs from the recorded source: ${node.nodeId}`)
    // NUL is lost in HTML parsing; unpaired surrogates become replacement
    // characters in UTF-8 files/responses. The Unicode regex leaves valid
    // surrogate pairs (e.g. emoji) intact.
    if (/[\u0000\uD800-\uDFFF]/u.test(projected)) return fail("structural-drift", `Text cannot be represented losslessly in HTML: ${node.nodeId}`)
    if (projected === renderedText) continue
    let start = textNode?.startIndex ?? null
    let end = textNode && textNode.endIndex !== null ? textNode.endIndex + 1 : null
    if (!textNode && element.startIndex !== null && element.endIndex !== null) {
      // Empty leaves have no text-node span. Inspection above requires an
      // explicit closing tag; insert immediately before it, preserving even
      // its original casing/spacing. Never insert content into a void tag.
      const closingStart = html.lastIndexOf("</", element.endIndex)
      if (closingStart > element.startIndex) start = end = closingStart
    }
    if (start === null || end === null) return fail("invalid-rendering", "Text has no source location.")
    replacements.push({ start, end, text: escapeText(projected) })
  }
  let candidate = html
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    candidate = candidate.slice(0, replacement.start) + replacement.text + candidate.slice(replacement.end)
  }
  return { status: candidate === html ? "current" as const : "text-patched" as const, diagnostics: [], html: candidate }
}

/**
 * Pure three-way classifier. It never writes, normalizes a document, executes
 * scripts or calls a provider. The caller must validate/recheck versions and
 * obtain shared writer admission before committing any returned candidate.
 */
export function classifySectioningSynchronization(input: SectioningSyncInput): SectioningSyncCandidate {
  const { source, priorSource, rendering } = input
  const sections: SectionSyncResult[] = []
  const diagnostics: string[] = []
  const parsed = (rendering?.sections ?? []).map((stored) => ({ stored, ...inspectHtml(stored.html) }))
  const active = source.sections.filter((section) => !section.isPruned)
  const activeIds = new Set(active.map((section) => section.sectionId))
  const nextRenderings = [...(rendering?.sections ?? [])]
  let changed = false
  for (const section of active) {
    const add = (status: SectionSyncResult["status"], diagnostic: string) => sections.push({ sectionId: section.sectionId, status, diagnostics: [diagnostic] })
    if (input.layout === "fixed") {
      add("fixed-layout-unmapped", "Semantic text does not update the positioned page.")
      continue
    }
    const owners = input.sectionOwners[section.sectionId] ?? []
    if (input.layout === "unknown" || owners.length !== 1 || owners[0] !== input.pageId || active.filter((s) => s.sectionId === section.sectionId).length !== 1) {
      add("unknown-origin", "Layout or unique page ownership cannot be verified.")
      continue
    }
    const matches = parsed.filter((entry) => entry.sections.some((el) => el.attribs["data-section-id"] === section.sectionId))
    if (matches.length === 0 && !activeNodes(section.nodes).some((node) => node.role)) {
      add("current", "No active renderable content requires an output.")
      continue
    }
    if (matches.length === 0) {
      // Identityless legacy output must never be assigned by sectionIndex.
      const ambiguous = parsed.some((entry) => entry.sections.length === 0 || entry.sections.some((el) => !el.attribs["data-section-id"]))
      add(ambiguous ? "unknown-origin" : "invalid-rendering", ambiguous ? "Rendering has no proven stable identity." : "No rendering exists for this section.")
      continue
    }
    if (matches.length !== 1 || matches[0].malformed || matches[0].sections.length !== 1) {
      add("invalid-rendering", "Rendering has malformed or duplicate section correspondence.")
      continue
    }
    const proof = input.proofs.filter((p) => p.sectionId === section.sectionId)
    const prior = proof.length === 1 && input.priorSources
      ? input.priorSources.find((row) => row.version === proof[0].sourceVersion)?.source
      : proof[0]?.sourceVersion === input.sourceVersion ? priorSource : null
    const previous = prior?.sections.filter((s) => s.sectionId === section.sectionId && !s.isPruned)
    if (proof.length !== 1 || proof[0].pageId !== input.pageId || proof[0].renderingVersion !== input.renderingVersion || !previous || previous.length !== 1 || proof[0].origin === "unknown") {
      add("unknown-origin", "The source and protection provenance of this rendering is unverified.")
      continue
    }
    if (proof[0].origin === "manual") {
      add("protected-divergence", "This rendering is protected and requires explicit review.")
      continue
    }
    const entry = matches[0]
    const outcome = patchSection(previous[0], section, entry.stored.html)
    sections.push({ sectionId: section.sectionId, status: outcome.status, diagnostics: outcome.diagnostics })
    if (outcome.html !== entry.stored.html) {
      nextRenderings[parsed.indexOf(entry)] = { ...entry.stored, html: outcome.html }
      changed = true
    }
  }
  // Retired identities are reported by their own id, never a successor's index.
  for (const entry of parsed) {
    for (const element of entry.sections) {
      const id = element.attribs["data-section-id"]
      if (id && !activeIds.has(id)) sections.push({ sectionId: id, status: "structural-drift", diagnostics: ["Rendered identity is not active on this page."] })
    }
    if (entry.sections.length === 0 || entry.sections.some((el) => !el.attribs["data-section-id"])) diagnostics.push("A rendering has no proven stable section identity.")
  }
  return { rendering: changed && rendering ? { ...rendering, sections: nextRenderings } : rendering, changed, sections, diagnostics }
}
