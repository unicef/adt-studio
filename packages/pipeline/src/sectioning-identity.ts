import { parseDocument, DomUtils } from "htmlparser2"
import type { Storage } from "@adt/storage"
import { PageSectioningOutput, type ContentNodeData } from "@adt/types"
import { createSectionIdFactory } from "./section-ids.js"

function nodeKey(node: ContentNodeData): string {
  return JSON.stringify(node.children?.length
    ? { structure: node.structure, children: node.children.map(nodeKey) }
    : { role: node.role, text: node.text, image: node.role === "image" ? node.nodeId : undefined })
}

function uniqueByKey<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const id = key(item)
    groups.set(id, [...(groups.get(id) ?? []), item])
  }
  return new Map([...groups].filter(([, group]) => group.length === 1).map(([id, group]) => [id, group[0]]))
}

function allNodes(sections: PageSectioningOutput["sections"]): ContentNodeData[] {
  const result: ContentNodeData[] = []
  const visit = (nodes: ContentNodeData[]) => {
    for (const node of nodes) { result.push(node); visit(node.children ?? []) }
  }
  for (const section of sections) visit(section.nodes)
  return result
}

/** Generated positional IDs are provisional. Only a unique, unchanged source
 * can inherit an active identity. Ambiguous/new content receives an unused ID;
 * history reserves IDs even after preparation or restore clears current rows. */
export function reconcileSectioningIdentities(
  storage: Storage, pageId: string, generated: PageSectioningOutput,
): PageSectioningOutput {
  const previous = PageSectioningOutput.safeParse(storage.getLatestNodeData("page-sectioning", pageId)?.data).data
  const priorNodes = allNodes(previous?.sections ?? [])
  const newNodes = allNodes(generated.sections)
  const priorIds = uniqueByKey(priorNodes, (node) => node.nodeId)
  const uniqueOld = uniqueByKey(priorNodes, nodeKey)
  const uniqueNew = uniqueByKey(newNodes, nodeKey)
  const spent = collectSpentContentIds(storage, [pageId])
  let next = 1
  const allocate = () => {
    let id: string
    do { id = `${pageId}_n${String(next++).padStart(4, "0")}` } while (spent.has(id))
    spent.add(id)
    return id
  }
  const assign = (node: ContentNodeData): ContentNodeData => {
    const key = nodeKey(node)
    const match = uniqueNew.has(key) ? uniqueOld.get(key) : undefined
    return { ...node, nodeId: node.role === "image" ? node.nodeId : (match && priorIds.has(match.nodeId) ? match.nodeId : allocate()),
      ...(node.children ? { children: node.children.map(assign) } : {}) }
  }
  const sectionKey = (section: PageSectioningOutput["sections"][number]) =>
    JSON.stringify({ type: section.sectionType, nodes: section.nodes.map(nodeKey) })
  const priorSectionIds = uniqueByKey(previous?.sections ?? [], (section) => section.sectionId)
  const oldSections = uniqueByKey(previous?.sections ?? [], sectionKey)
  const newSections = uniqueByKey(generated.sections, sectionKey)
  const allocateSection = createSectionIdFactory(storage, pageId)
  return { ...generated, sections: generated.sections.map((section) => {
    const key = sectionKey(section)
    const match = newSections.has(key) ? oldSections.get(key) : undefined
    return { ...section, sectionId: match && priorSectionIds.has(match.sectionId) ? match.sectionId : allocateSection(), nodes: section.nodes.map(assign) }
  }) }
}


/** Reserve identities in retained source/rendering versions, including retired
 * pages. Images may be shared; a new text entity must never inherit these IDs. */
export function collectSpentContentIds(storage: Storage, pageIds = [...new Set([...storage.getNodeItemIds("page-sectioning"), ...storage.getNodeItemIds("web-rendering")])]): Set<string> {
  const spent = new Set<string>()
  for (const pageId of pageIds) {
    for (const row of storage.getAllNodeVersions("page-sectioning", pageId)) {
      // Raw inspection also reserves IDs in legacy versions that no longer parse.
      const collect = (value: unknown): void => {
        if (!value || typeof value !== "object") return
        if ("nodeId" in value && typeof value.nodeId === "string") spent.add(value.nodeId)
        for (const child of Object.values(value)) collect(child)
      }
      collect(row.data)
    }
    for (const row of storage.getAllNodeVersions("web-rendering", pageId)) {
      const data = row.data as { sections?: Array<{ html?: string }> } | null
      for (const section of data?.sections ?? []) {
        const doc = parseDocument(section.html ?? "")
        for (const element of DomUtils.findAll((element) => element.type === "tag" && !!element.attribs["data-id"], doc.children)) spent.add(element.attribs["data-id"])
      }
    }
  }
  return spent
}
