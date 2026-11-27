import { z } from "zod"
import { ContentNodeData, PageSectioningOutput } from "./page-sectioning.js"
import { PositionedTextOutput } from "./positioned-text.js"

// Experiment #744. These snapshots deliberately do not replace pipeline entities.
const Id = z.string().min(1).max(160)
const CssId = z.string().regex(/^pub-[a-z0-9-]+$/)
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const Family = z.string().min(1).max(160).regex(/^[\p{L}\p{N} ,.'"_-]+$/u)
const Evidence = z.object({ pageIds: z.array(Id), count: z.number().int().nonnegative() })

export const PublisherTextStyle = z.object({
  id: CssId,
  name: z.string().min(1).max(100),
  role: Id,
  fontFamily: Family,
  fontSize: z.number().min(8).max(120),
  fontWeight: z.number().int().min(100).max(900),
  fontStyle: z.enum(["normal", "italic"]),
  color: Color,
  lineHeight: z.number().min(1).max(3),
  spaceAfter: z.number().min(0).max(100),
  letterSpacing: z.number().min(-2).max(12),
  textAlign: z.enum(["start", "center", "end", "justify"]),
  origin: z.enum(["pdf", "preset"]),
  useBookAccent: z.boolean().optional(),
  evidence: Evidence,
})
export type PublisherTextStyle = z.infer<typeof PublisherTextStyle>

export const PublisherComponent = z.object({
  id: CssId,
  name: z.string().min(1).max(100),
  structure: Id,
  layout: z.enum(["stack", "grid", "callout", "figure"]),
  columns: z.number().int().min(1).max(3),
  background: z.union([Color, z.literal("transparent")]),
  accent: Color,
  padding: z.number().min(0).max(80),
  gap: z.number().min(0).max(80),
  radius: z.number().min(0).max(60),
  imageFit: z.enum(["contain", "cover"]),
  imageHeight: z.number().min(100).max(900),
  origin: z.enum(["structure", "pdf"]).default("structure"),
  // Optional treatments keep earlier saved designs visually unchanged.
  treatment: z.enum(["plain", "card", "banner", "outline"]).optional(),
  palette: z.enum(["book", "custom"]).optional(),
  header: z.enum(["none", "solid", "tint"]).optional(),
  headerSize: z.number().min(12).max(60).optional(),
  evidence: Evidence,
})
export type PublisherComponent = z.infer<typeof PublisherComponent>

export const PublisherMaster = z.object({
  id: CssId,
  kind: z.enum(["opener", "reading", "illustrated", "activity", "reference"]),
  name: z.string().min(1).max(100),
  background: Color,
  accent: Color,
  columns: z.number().int().min(1).max(2),
  maxWidth: z.number().min(480).max(1600),
  padding: z.number().min(16).max(120),
  gap: z.number().min(8).max(80),
})
export type PublisherMaster = z.infer<typeof PublisherMaster>

// A page is composed of reusable regions, rather than one grid for every object.
// Slots are stored in source reading order; their column controls visual placement.
export const PublisherRegion = z.object({
  id: CssId,
  template: z.enum(["full-width", "two-column", "three-column", "sidebar-left", "sidebar-right"]),
  origin: z.enum(["pdf", "semantic", "manual"]),
  flow: z.enum(["columns", "wrap"]).optional(),
  sidebarWidth: z.number().min(25).max(50).optional(),
  slots: z.array(z.object({ column: z.number().int().min(0).max(2), nodeIds: z.array(Id).min(1) })).min(1).max(3),
})
export type PublisherRegion = z.infer<typeof PublisherRegion>

export const PublisherPage = z.object({
  // Existing section id, or page id for an extraction-only preview (no section minted).
  id: Id,
  pageId: Id,
  pageNumber: z.number().int(),
  sectionType: Id,
  nodes: z.array(ContentNodeData),
  masterId: CssId,
  reason: z.enum(["chapter", "exercise", "reference", "image", "prose"]),
  confidence: z.enum(["semantic", "heuristic"]),
  textStyles: z.record(Id, CssId),
  components: z.record(Id, CssId),
  // Optional so saved designs and frozen proofs from the first experiment still open.
  regions: z.array(PublisherRegion).min(1).max(5000).optional(),
})
export type PublisherPage = z.infer<typeof PublisherPage>

export const PublisherDocument = z.object({
  format: z.literal(1),
  preset: z.enum(["source", "editorial"]),
  sourceFingerprint: z.string(),
  theme: z.object({ accent: Color }).optional(),
  styles: z.array(PublisherTextStyle).min(1).max(500),
  components: z.array(PublisherComponent).min(1).max(200),
  masters: z.array(PublisherMaster).min(1).max(30),
  pages: z.array(PublisherPage).min(1).max(5000),
}).superRefine((doc, ctx) => {
  for (const items of [doc.styles, doc.components, doc.masters, doc.pages]) {
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate identifiers" })
    }
  }
  const styles = new Set(doc.styles.map((s) => s.id))
  const components = new Set(doc.components.map((s) => s.id))
  const masters = new Set(doc.masters.map((s) => s.id))
  for (const page of doc.pages) {
    if (!masters.has(page.masterId) || Object.values(page.textStyles).some((id) => !styles.has(id)) ||
      Object.values(page.components).some((id) => !components.has(id))) {
      ctx.addIssue({ code: "custom", message: "Unknown style, component or master" })
    }
    const seen = new Set<string>()
    const visit = (nodes: ContentNodeData[]) => {
      for (const node of nodes) {
        if (node.isPruned) continue
        if (seen.has(node.nodeId)) ctx.addIssue({ code: "custom", message: "Duplicate content identifier" })
        seen.add(node.nodeId)
        if (!node.children && node.role !== "image" && node.text !== undefined && !page.textStyles[node.nodeId]) {
          ctx.addIssue({ code: "custom", message: "Missing text style assignment" })
        }
        if (node.children) visit(node.children)
      }
    }
    visit(page.nodes)
    if (page.regions) {
      const activeIds = page.nodes.filter((n) => !n.isPruned).map((n) => n.nodeId)
      const assigned = page.regions.flatMap((r) => r.slots.flatMap((s) => s.nodeIds))
      if (JSON.stringify(activeIds) !== JSON.stringify(assigned)) {
        ctx.addIssue({ code: "custom", message: "Regions must include every active top-level node exactly once in reading order" })
      }
      if (new Set(page.regions.map((r) => r.id)).size !== page.regions.length) {
        ctx.addIssue({ code: "custom", message: "Duplicate region identifier" })
      }
      for (const region of page.regions) {
        const columns = region.template === "full-width" ? 1 : region.template === "three-column" ? 3 : 2
        if (region.slots.length !== columns || new Set(region.slots.map((s) => s.column)).size !== columns || region.slots.some((s) => s.column >= columns)) {
          ctx.addIssue({ code: "custom", message: "Each region column must have exactly one nonempty slot" })
        }
        if (region.flow === "wrap" && (!region.template.startsWith("sidebar-") || region.slots[0].column !== (region.template === "sidebar-left" ? 0 : 1))) {
          ctx.addIssue({ code: "custom", message: "Wrapped layouts require the sidebar first in source reading order" })
        }
      }
    }
  }
})
export type PublisherDocument = z.infer<typeof PublisherDocument>

export const PublisherSource = z.object({
  pageId: Id,
  pageNumber: z.number().int(),
  sectioning: PageSectioningOutput.optional(),
  positioned: PositionedTextOutput.optional(),
})
export type PublisherSource = z.infer<typeof PublisherSource>

export const PublisherDesignVersion = z.object({ version: z.number().int().positive(), document: PublisherDocument })
export type PublisherDesignVersion = z.infer<typeof PublisherDesignVersion>

export const PublisherAnalyzeRequest = z.object({ preset: z.enum(["source", "editorial"]) })
export const PublisherSaveRequest = z.object({
  document: PublisherDocument,
  baseVersion: z.number().int().nonnegative(),
})
export const PublisherRestoreRequest = z.object({
  version: z.number().int().positive(),
  baseVersion: z.number().int().nonnegative(),
})
export const PublisherPreviewRequest = z.object({ document: PublisherDocument, pageId: Id })
export const PublisherLayoutRequest = z.object({ document: PublisherDocument })
export const PublisherThemeRequest = z.object({ document: PublisherDocument, accent: Color })
export const PublisherPreview = z.object({ html: z.string(), css: z.string(), warnings: z.array(z.string()) })
export type PublisherPreview = z.infer<typeof PublisherPreview>
export const PublisherStoryboard = z.object({
  designVersion: z.number().int(),
  document: PublisherDocument,
  css: z.string(),
  pages: z.array(z.object({ id: Id, pageNumber: z.number().int(), html: z.string(), warnings: z.array(z.string()) })),
})
export type PublisherStoryboard = z.infer<typeof PublisherStoryboard>
export const PublisherState = z.object({
  document: PublisherDocument.nullable(),
  version: z.number().int(),
  versions: z.array(z.number().int()),
  sourceChanged: z.boolean(),
  sourcePageCount: z.number().int(),
  generated: z.object({ version: z.number().int(), designVersion: z.number().int(), pageCount: z.number().int() }).nullable(),
})
export type PublisherState = z.infer<typeof PublisherState>
