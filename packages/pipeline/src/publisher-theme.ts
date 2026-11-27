import { PublisherDocument, headingLevelForRole, type ContentNodeData, type PublisherComponent } from "@adt/types"
import { publisherNodes } from "./publisher-styles.js"

const channels = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
const hexColor = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`
export const tintPublisherColor = (accent: string, white = 0.93) => hexColor(channels(accent).map((c) => c + (255 - c) * white))

/** WCAG relative luminance, evaluated on the actual opaque sRGB fills. */
export function publisherContrast(first: string, second: string): number {
  const luminance = (color: string) => channels(color).map((c) => c / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
  const a = luminance(first), b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function publisherInk(background: string): string {
  const candidates = ["#20352f", "#ffffff", "#000000"]
  return candidates.find((c) => publisherContrast(c, background) >= 7)
    ?? candidates.sort((a, b) => publisherContrast(b, background) - publisherContrast(a, background))[0]
}

export function publisherHeadingColor(accent: string, background: string): string {
  return publisherContrast(accent, background) >= 4.5 ? accent : publisherInk(background)
}

export function publisherComponentColors(component: PublisherComponent, doc: PublisherDocument) {
  const accent = component.palette === "book" ? doc.theme?.accent ?? component.accent : component.accent
  const surface = component.treatment === "banner" ? accent : component.palette === "book" ? component.treatment === "outline" ? "#ffffff" : tintPublisherColor(accent) : component.background === "transparent" ? "#ffffff" : component.background
  const header = component.header === "solid" ? accent : tintPublisherColor(accent, 0.83)
  return { accent, surface, ink: publisherInk(surface), header, headerInk: publisherInk(header) }
}

/** A finite, source-inspired design library. No content or reading order changes.
 * Applying is draft-only; callers use the existing versioned save/proof path.
 */
export function applyPublisherLearningDesign(input: PublisherDocument, accent: string): PublisherDocument {
  const doc = PublisherDocument.parse(input)
  const library = new Map<string, PublisherComponent>()
  const classify = (node: ContentNodeData, nested: boolean) => {
    const leaves = publisherNodes([node]).filter((n) => !n.children)
    if (!nested && (node.structure === "heading" || (!node.children && (node.headingLevel ?? headingLevelForRole(node.role))))) {
      return leaves.some((n) => (n.headingLevel ?? headingLevelForRole(n.role)) === 1) ? "chapter" : "section"
    }
    if (!/^(sidebar|callout|aside|note|box|panel|question|exercise)$/.test(node.structure ?? "")) return null
    const title = leaves.find((n) => n.headingLevel || headingLevelForRole(n.role))?.text ?? ""
    return /vocabulary/i.test(title) ? "vocabulary" : /question/i.test(title) ? "question" : /think|try|explore/i.test(title) ? "think" : "card"
  }
  const names: Record<string, string> = { chapter: "Chapter banner", section: "Section heading", vocabulary: "Vocabulary card", question: "Question card", think: "Think-about card", card: "Learning card" }
  const pages = doc.pages.map((page) => {
    const components = { ...page.components }
    const visit = (nodes: ContentNodeData[], nested: boolean) => {
      for (const node of nodes) {
        if (node.isPruned) continue
        const kind = classify(node, nested)
        if (kind) {
          const id = `pub-learning-${kind}`
          const existing = library.get(id)
          const component: PublisherComponent = existing ?? {
            id, name: names[kind], structure: node.structure ?? "heading", layout: "stack", columns: 1,
            background: kind === "section" ? "transparent" : tintPublisherColor(accent), accent, padding: kind === "chapter" ? 32 : kind === "section" ? 0 : 22,
            gap: 12, radius: kind === "section" ? 0 : 18, imageFit: "contain", imageHeight: 400,
            origin: "structure", treatment: kind === "chapter" ? "banner" : kind === "section" ? "plain" : kind === "think" ? "outline" : "card",
            palette: "book", header: kind === "vocabulary" ? "tint" : ["chapter", "section"].includes(kind) ? "none" : "solid",
            evidence: { pageIds: [], count: 0 },
          }
          component.evidence.count++
          if (!component.evidence.pageIds.includes(page.pageId)) component.evidence.pageIds.push(page.pageId)
          library.set(id, component)
          components[node.nodeId] = id
        }
        if (node.children) visit(node.children, true)
      }
    }
    visit(page.nodes, false)
    return { ...page, components }
  })
  const used = new Set(pages.flatMap((p) => Object.values(p.components)))
  return PublisherDocument.parse({ ...doc, theme: { accent }, pages,
    styles: doc.styles.map((s) => {
      const heading = /heading|title/.test(s.role)
      const large = s.role === "heading_1" || s.role === "chapter_title"
      const small = /caption|footnote|label|page_number/.test(s.role)
      return { ...s, fontFamily: "Atkinson Hyperlegible, Arial, sans-serif", fontSize: heading ? large ? 42 : /subheading|heading_3/.test(s.role) ? 22 : 30 : small ? 16 : 20,
        fontWeight: heading || s.role === "label" ? 700 : 400, fontStyle: "normal", color: heading ? publisherHeadingColor(accent, "#ffffff") : "#20352f",
        lineHeight: heading ? 1.2 : 1.65, spaceAfter: heading ? 12 : small ? 8 : 14, letterSpacing: 0, textAlign: "start", origin: "preset", useBookAccent: heading }
    }),
    components: [...library.values(), ...doc.components.filter((c) => used.has(c.id) && !library.has(c.id))],
    masters: doc.masters.map((m) => ({ ...m, background: "#ffffff", accent, gap: 28 })),
  })
}
