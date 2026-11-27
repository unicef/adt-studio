import { createHash } from "node:crypto"
import {
  PublisherDocument,
  type ContentNodeData,
  type DrawItemParagraph,
  type PublisherComponent,
  type PublisherMaster,
  type PublisherPage,
  type PublisherSource,
  type PublisherTextStyle,
} from "@adt/types"

import { inferPublisherRegions } from "./publisher-layout.js"

const hex = (value: string | undefined, fallback: string) => /^#[\da-f]{6}$/i.test(value ?? "") ? value! : fallback
const cleanText = (value: string) => value.replace(/\s+/g, " ").trim()
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 10)
const title = (value: string) => value.replace(/[_-]/g, " ").replace(/^./, (c) => c.toUpperCase())
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function publisherNodes(nodes: ContentNodeData[]): ContentNodeData[] {
  return nodes.flatMap((node) => node.isPruned ? [] : [node, ...publisherNodes(node.children ?? [])])
}

function sourceStyle(paragraph: DrawItemParagraph) {
  // The dominant run describes the paragraph; emphasis remains a future inline-style concern.
  return [...paragraph.segments].sort((a, b) => b.text.length - a.text.length)[0]?.style ?? {}
}

function fontSize(paragraph: DrawItemParagraph): number {
  return Number.parseFloat(sourceStyle(paragraph)["font-size"] ?? "16") || 16
}

/** Extraction-only books work without an LLM. These are preview nodes, not new sections. */
function extractionNodes(source: PublisherSource): ContentNodeData[] {
  const items = source.positioned?.drawItems ?? []
  const paragraphs = items.filter((item) => item.kind === "paragraph")
  const sizes = paragraphs.flatMap((p) => Array(Math.min(100, p.text.length)).fill(fontSize(p)) as number[]).sort((a, b) => a - b)
  const bodySize = sizes[Math.floor(sizes.length / 2)] ?? 16
  const nodes: ContentNodeData[] = []
  const merged = new Map<string, ContentNodeData>()
  for (const item of items) {
    if (item.kind === "image") {
      if (!nodes.some((node) => node.nodeId === item.imageId)) nodes.push({ nodeId: item.imageId, role: "image", isPruned: false })
      continue
    }
    if (!item.text.trim()) continue
    const existing = item.mergedParagraphId ? merged.get(item.mergedParagraphId) : undefined
    if (existing) {
      existing.text += ` ${item.text}`
      continue
    }
    const heading = fontSize(item) >= bodySize * 1.35
    const node: ContentNodeData = {
      nodeId: item.textId, isPruned: false, text: item.text,
      role: heading ? "section_heading" : "paragraph",
      ...(heading ? { headingLevel: fontSize(item) >= bodySize * 1.8 ? 1 : 2 } : {}),
    }
    if (item.mergedParagraphId) merged.set(item.mergedParagraphId, node)
    nodes.push(node)
  }
  return nodes
}

function classify(nodes: ContentNodeData[], sectionType: string): { kind: PublisherMaster["kind"]; reason: PublisherPage["reason"] } {
  const all = publisherNodes(nodes)
  if (/activity|exercise|quiz|question/.test(sectionType) || all.some((n) => /question|exercise/.test(n.structure ?? ""))) return { kind: "activity", reason: "exercise" }
  if (/contents|glossary|reference|index/.test(sectionType) || all.some((n) => /table|definition/.test(n.structure ?? ""))) return { kind: "reference", reason: "reference" }
  if (/cover|chapter|opener/.test(sectionType) || all.some((n) => n.headingLevel === 1 || n.role === "chapter_title")) return { kind: "opener", reason: "chapter" }
  if (all.some((n) => n.role === "image")) return { kind: "illustrated", reason: "image" }
  return { kind: "reading", reason: "prose" }
}

function defaultStyle(role: string, headingLevel?: number): Omit<PublisherTextStyle, "id" | "name" | "evidence"> {
  const heading = headingLevel !== undefined || /heading|title/.test(role)
  const caption = /caption|footnote|page_number|label/.test(role)
  return {
    role, fontFamily: heading ? "Merriweather, Georgia, serif" : "Atkinson Hyperlegible, Arial, sans-serif",
    fontSize: heading ? headingLevel === 1 || role === "chapter_title" ? 44 : 30 : caption ? 14 : 19,
    fontWeight: heading ? 700 : 400, fontStyle: "normal",
    color: heading ? "#164E43" : caption ? "#52635C" : "#263D35",
    lineHeight: heading ? 1.2 : 1.65, spaceAfter: heading ? 22 : 14,
    letterSpacing: 0, textAlign: "start", origin: "preset",
  }
}

function componentFor(structure: string): Omit<PublisherComponent, "id" | "evidence"> {
  const figure = /image|figure/.test(structure)
  const callout = /box|callout|aside|sidebar|note|question|exercise/.test(structure)
  return {
    name: title(structure), structure,
    layout: figure ? "figure" : callout ? "callout" : "stack",
    columns: 1, background: callout ? "#ECF2E8" : "transparent", accent: "#B47D32",
    padding: callout ? 24 : 0, gap: 16, radius: figure ? 12 : 4,
    imageFit: "contain", imageHeight: 400, origin: "structure",
  }
}

function detectComponent(node: ContentNodeData, source: PublisherSource, preset: "source" | "editorial") {
  const structure = node.structure ?? "image"
  const spec = componentFor(structure)
  if (preset !== "source") return spec
  const images = publisherNodes([node]).filter((n) => n.role === "image")
  const bounds = images.flatMap((n) => {
    const placement = source.positioned?.drawItems.find((item) => item.kind === "image" && item.imageId === n.nodeId)
    return placement?.kind === "image" ? [placement.bounds] : []
  })
  if (bounds.length) {
    const first = bounds[0]
    const ratio = first.width / Math.max(1, first.height)
    // A finite set of image treatments, learned from PDF geometry, keeps small
    // measurement differences from generating a new object style on every page.
    const orientation = ratio > 1.35 ? "landscape" : ratio < 0.75 ? "portrait" : "square"
    spec.name += ` · ${orientation}`
    spec.imageHeight = orientation === "landscape" ? 280 : orientation === "portrait" ? 540 : 400
    spec.origin = "pdf"
    if (bounds.length > 1 && bounds.some((b) => b.x >= first.x + first.width * 0.8 && Math.abs(b.y - first.y) < first.height / 2)) {
      spec.layout = "grid"
      spec.columns = 2
    }
  }
  return spec
}

export function analyzePublisherStyles(sources: PublisherSource[], preset: "source" | "editorial", sourceFingerprint: string): PublisherDocument {
  const styles = new Map<string, PublisherTextStyle>()
  const components = new Map<string, PublisherComponent>()
  const pages: PublisherPage[] = []
  const backgrounds: string[] = []
  const record = (entry: PublisherTextStyle | PublisherComponent, pageId: string) => {
    entry.evidence.count++
    if (!entry.evidence.pageIds.includes(pageId)) entry.evidence.pageIds.push(pageId)
  }
  const getComponent = (node: ContentNodeData, source: PublisherSource) => {
    const spec = detectComponent(node, source, preset)
    const id = `pub-component-${hash(spec)}`
    const component = components.get(id) ?? { id, ...spec, evidence: { pageIds: [], count: 0 } }
    record(component, source.pageId)
    components.set(id, component)
    return id
  }
  for (const source of sources) {
    const paragraphs = source.positioned?.drawItems.filter((item) => item.kind === "paragraph") ?? []
    const sections = source.sectioning
      ? source.sectioning.sections.filter((s) => !s.isPruned)
      : [{ sectionId: source.pageId, sectionType: "page", nodes: extractionNodes(source), backgroundColor: "#FFFFFF" }]
    for (const section of sections) {
      const all = publisherNodes(section.nodes)
      if (all.length === 0) continue
      backgrounds.push(hex(section.backgroundColor, "#FFFFFF"))
      const { kind, reason } = classify(section.nodes, section.sectionType)
      const page: PublisherPage = {
        id: section.sectionId, pageId: source.pageId, pageNumber: source.pageNumber,
        sectionType: section.sectionType, nodes: section.nodes, masterId: `pub-master-${kind}`,
        reason, confidence: source.sectioning ? "semantic" : "heuristic", textStyles: {}, components: {},
        regions: inferPublisherRegions(section.nodes, source),
      }
      for (const node of all) {
        if (node.structure || node.role === "image") {
          page.components[node.nodeId] = getComponent(node, source)
        } else if (node.text !== undefined) {
          const role = node.headingLevel ? `heading_${node.headingLevel}` : node.role ?? "paragraph"
          const spec = defaultStyle(role, node.headingLevel)
          const normalized = cleanText(node.text)
          const paragraph = paragraphs.find((p) => p.textId === node.nodeId)
            ?? paragraphs.find((p) => cleanText(p.text) === normalized)
            ?? paragraphs.find((p) => cleanText(p.text).length > 15 && normalized.includes(cleanText(p.text)))
          if (preset === "source" && paragraph) {
            const run = sourceStyle(paragraph)
            const family = (run["font-family"] ?? spec.fontFamily).replace(/^["']?[A-Z]{6}\+/, "").replace(/[^\p{L}\p{N} ,.'"_-]/gu, "")
            spec.fontFamily = family || spec.fontFamily
            spec.fontSize = clamp(Math.round(fontSize(paragraph) * 10) / 10, 8, 120)
            spec.fontWeight = run["font-weight"] === "bold" ? 700 : clamp(parseInt(run["font-weight"] ?? "400") || 400, 100, 900)
            spec.fontStyle = run["font-style"] === "italic" ? "italic" : "normal"
            spec.color = hex(run.color, spec.color)
            spec.lineHeight = Math.round(clamp(paragraph.lineHeight / fontSize(paragraph), 1.1, 2.5) * 100) / 100
            spec.textAlign = paragraph.textAlign === "right" ? "end" : paragraph.textAlign ?? "start"
            spec.origin = "pdf"
          }
          const id = `pub-text-${hash(spec)}`
          const style = styles.get(id) ?? { id, name: title(role), ...spec, evidence: { pageIds: [], count: 0 } }
          record(style, source.pageId)
          styles.set(id, style)
          page.textStyles[node.nodeId] = id
        }
      }
      pages.push(page)
    }
  }
  if (pages.length === 0) throw new Error("No extracted content. Run Extract first; scanned PDFs also need Sectioning.")
  if (!styles.size) {
    const spec = defaultStyle("paragraph")
    styles.set("pub-text-body", { id: "pub-text-body", name: "Paragraph", ...spec, evidence: { pageIds: [], count: 0 } })
  }
  if (!components.size) components.set("pub-component-group", { id: "pub-component-group", ...componentFor("group"), evidence: { pageIds: [], count: 0 } })
  // Distinguish genuinely different PDF variants while coalescing identical runs across pages.
  for (const style of styles.values()) {
    if ([...styles.values()].filter((s) => s.role === style.role).length > 1) style.name += ` · ${style.fontSize}px · ${style.color}`
  }
  const commonBackground = [...new Set(backgrounds)].sort((a, b) => backgrounds.filter((x) => x === b).length - backgrounds.filter((x) => x === a).length)[0] ?? "#FFFFFF"
  const masters: PublisherMaster[] = (["opener", "reading", "illustrated", "activity", "reference"] as const).map((kind) => ({
    id: `pub-master-${kind}`, kind, name: title(kind), background: preset === "source" ? commonBackground : "#FFFCF5",
    accent: "#B47D32", columns: kind === "illustrated" || kind === "reference" ? 2 : 1,
    maxWidth: 1040, padding: 56, gap: 32,
  }))
  return PublisherDocument.parse({ format: 1, preset, sourceFingerprint, styles: [...styles.values()], components: [...components.values()], masters, pages })
}
