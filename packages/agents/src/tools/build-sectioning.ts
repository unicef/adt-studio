import { parseDocument } from "htmlparser2"
import { DomUtils } from "htmlparser2"
import type {
  ContentNodeData,
  PageSectioningSection,
} from "@adt/types"

/**
 * Build a sectioning tree for a section produced by the generative agent.
 *
 * The agent writes raw HTML; downstream pipeline steps and the section edit
 * panel expect a structured tree of nodes keyed by data-id. Rather than ask
 * the LLM to produce both (and risk drift), we extract the tree
 * deterministically from the HTML:
 *
 *   - Every element carrying data-id that is itself a leaf (no data-id
 *     descendants) becomes a leaf node. Wrapper elements that happen to
 *     carry a data-id are skipped — including the outer <section> — so the
 *     tree mirrors the content's leaf-level granularity.
 *   - `<img>` elements get role="image" with no text.
 *   - Everything else gets role="text" with the element's collapsed text
 *     content. Text inside <script>/<style> descendants is excluded; that's
 *     belt-and-braces for the custom-activity path, where the section ships
 *     its own behaviour as inline JS.
 *   - The leaves are flattened under a single container node so the section
 *     still has a valid tree shape (the existing pipeline uses nested
 *     structure containers, but a flat container is sufficient for editing
 *     and for text-catalog/TTS, which walk HTML directly).
 */
export function buildSectioningSectionFromHtml(args: {
  html: string
  sectionId: string
  sectionType: string
}): PageSectioningSection {
  const doc = parseDocument(args.html)
  const elements = DomUtils.findAll(
    (el) => el.type === "tag" && el.attribs?.["data-id"] !== undefined,
    doc.children,
  )

  const leaves: ContentNodeData[] = []
  const seen = new Set<string>()
  for (const el of elements) {
    const dataId = el.attribs["data-id"]
    if (seen.has(dataId)) continue

    // Skip structural wrappers — anything whose subtree contains another
    // data-id is a container, not a text leaf. This also drops the outer
    // <section> when the agent gives it a data-id, which would otherwise
    // collapse the entire activity (and any inline script source) into a
    // single concatenated text leaf in the sectioning view.
    if (hasDataIdDescendant(el)) continue

    seen.add(dataId)

    if (el.name === "img") {
      leaves.push({
        nodeId: dataId,
        isPruned: false,
        role: "image",
      })
    } else {
      const text = textContentExcludingScripts(el).replace(/\s+/g, " ").trim()
      if (!text) continue
      leaves.push({
        nodeId: dataId,
        isPruned: false,
        role: "text",
        text,
      })
    }
  }

  const container: ContentNodeData = {
    nodeId: `${args.sectionId}_root`,
    isPruned: false,
    structure: "section",
    children: leaves,
  }

  return {
    sectionId: args.sectionId,
    sectionType: args.sectionType,
    backgroundColor: "#ffffff",
    textColor: "#000000",
    pageNumber: null,
    isPruned: false,
    nodes: [container],
  }
}

/**
 * True if `node` has any descendant element carrying a data-id attribute.
 * Used to filter out structural wrappers that happen to carry a data-id.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasDataIdDescendant(node: any): boolean {
  if (!Array.isArray(node.children)) return false
  for (const child of node.children) {
    if (
      child &&
      child.type === "tag" &&
      child.attribs?.["data-id"] !== undefined
    ) {
      return true
    }
    if (hasDataIdDescendant(child)) return true
  }
  return false
}

/**
 * Like DomUtils.textContent but ignores the contents of <script> and <style>
 * subtrees. Mirrors the helper in text-catalog.ts — both faced the same bug
 * where an embedded script's source leaked into the extracted text.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textContentExcludingScripts(node: any): string {
  if (!node) return ""
  if (node.type === "text") return node.data ?? ""
  const tagName = (node.name ?? node.type ?? "").toLowerCase()
  if (tagName === "script" || tagName === "style") return ""
  if (Array.isArray(node.children)) {
    let out = ""
    for (const child of node.children) {
      out += textContentExcludingScripts(child)
    }
    return out
  }
  return ""
}
