import { PublisherDocument, headingLevelForRole, ContentNodeData, type PublisherPage, type PublisherPreview, type PublisherStoryboard, type PublisherDesignVersion, type PageSectioningSection, type SectionRendering } from "@adt/types"
import { validateSectionHtml } from "./validate-html.js"
import { validateTypographyHierarchy } from "./validate-typography-hierarchy.js"
import { publisherNodes } from "./publisher-styles.js"
import { publisherHeadingColor } from "./publisher-theme.js"
import { publisherTreatmentCss } from "./publisher-component-css.js"

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export function publisherCss(input: PublisherDocument): string {
  return buildCss(PublisherDocument.parse(input))
}

function buildCss(doc: PublisherDocument, standalone = true): string {
  return `
${standalone ? "body{margin:0;background:#e8e9e5}" : ""}.pub-page,.pub-page *{box-sizing:border-box}.pub-page img{max-width:100%;height:auto}.pub-page :where(p,h1,h2,h3,h4,h5,h6,figure,blockquote){margin:0}.pub-page :where(button,input,textarea){font:inherit}
.pub-page{margin:0 auto;min-height:760px;overflow-wrap:anywhere;font-family:'Atkinson Hyperlegible',Arial,sans-serif;color:#263d35;position:relative}
.pub-folio{font:11px/1.4 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;display:flex;justify-content:space-between;border-top:1px solid #cdd5cd;padding-top:12px;margin-top:36px;color:#52635c}
.pub-content{display:grid;align-items:start}.pub-content>*{min-width:0}.pub-content>h1,.pub-content>h2{grid-column:1/-1}
.pub-page>.pub-content.pub-regions{display:flex;flex-direction:column;gap:var(--pub-gap)}.pub-region{display:grid;gap:var(--pub-gap);align-items:start;width:100%}.pub-region[data-layout=full-width]{grid-template-columns:minmax(0,1fr)}.pub-region[data-layout=two-column]{grid-template-columns:repeat(2,minmax(0,1fr))}.pub-region[data-layout=three-column]{grid-template-columns:repeat(3,minmax(0,1fr))}.pub-region[data-layout=sidebar-left]{grid-template-columns:minmax(0,calc(var(--pub-sidebar-width,33.333%) - var(--pub-gap)/2)) minmax(0,1fr)}.pub-region[data-layout=sidebar-right]{grid-template-columns:minmax(0,1fr) minmax(0,calc(var(--pub-sidebar-width,33.333%) - var(--pub-gap)/2))}.pub-slot{min-width:0;grid-row:1}.pub-slot[data-column="0"]{grid-column:1}.pub-slot[data-column="1"]{grid-column:2}.pub-slot[data-column="2"]{grid-column:3}.pub-slot>*+*{margin-top:calc(var(--pub-gap)/2)}
.pub-page[data-master=opener]{border-top:12px solid var(--pub-accent)}.pub-page[data-master=opener] .pub-content>h1{padding-top:36px;border-bottom:1px solid var(--pub-accent);padding-bottom:28px}
.pub-page[data-master=activity]{border-left:10px solid var(--pub-accent)}.pub-page[data-master=reference] .pub-content{border-top:4px solid var(--pub-accent);padding-top:24px}
.pub-component{min-width:0;break-inside:avoid}.pub-component img{display:block;width:100%}.pub-image{display:block;width:100%}.pub-text{white-space:pre-wrap}
${doc.styles.map((s) => `.${s.id}{font-family:${s.fontFamily};font-size:${s.fontSize}px;font-weight:${s.fontWeight};font-style:${s.fontStyle};color:${s.useBookAccent && doc.theme ? "var(--pub-heading-color)" : s.color};line-height:${s.lineHeight};margin-bottom:${s.spaceAfter}px;letter-spacing:${s.letterSpacing}px;text-align:${s.textAlign}}`).join("\n")}
${doc.components.map((c) => `.${c.id}{display:${c.layout === "grid" ? "grid" : "block"};grid-template-columns:repeat(${c.columns},minmax(0,1fr));gap:${c.gap}px;padding:${c.padding}px;border-radius:${c.radius}px;background:${c.background};${c.layout === "callout" ? `border-inline-start:4px solid ${c.accent};` : ""}}.${c.id}>*+*{margin-top:${c.layout === "grid" ? 0 : c.gap}px}.${c.id} .pub-image,img.${c.id}{object-fit:${c.imageFit};${c.imageFit === "cover" ? `height:${c.imageHeight}px;` : `max-height:${c.imageHeight}px;`}border-radius:${c.radius}px}`).join("\n")}
${doc.masters.map((m) => `.${m.id}{--pub-heading-color:${publisherHeadingColor(doc.theme?.accent ?? m.accent, m.background)};--pub-accent:${doc.theme?.accent ?? m.accent};--pub-gap:${m.gap}px;background:${m.background};max-width:${m.maxWidth}px;padding:${m.padding}px}.${m.id}>.pub-content{grid-template-columns:repeat(${m.columns},minmax(0,1fr));column-gap:${m.gap}px;row-gap:${Math.round(m.gap / 2)}px}`).join("\n")}
.pub-paragraph>.pub-text{display:inline;margin:0}.pub-paragraph>.pub-text+*{margin-top:0}
@media(max-width:640px){.pub-page{padding:24px}.pub-page>.pub-content,.pub-component,.pub-region[data-layout]{grid-template-columns:minmax(0,1fr)}.pub-region>.pub-slot[data-column]{grid-column:auto;grid-row:auto}.pub-content h1{font-size:clamp(28px,7vw,44px)}}
${publisherTreatmentCss(doc)}
`.trim()
}

/** Every render is pure. The model never generates HTML or CSS for these pages. */
export function renderPublisherPage(input: PublisherDocument, pageId: string, imageUrlPrefix: string): PublisherPreview {
  const doc = PublisherDocument.parse(input)
  const page = doc.pages.find((p) => p.id === pageId)
  if (!page) throw new Error("Unknown prototype page")
  return { ...renderPage(doc, page, imageUrlPrefix), css: buildCss(doc) }
}

/** Validate and build the shared stylesheet once per book, not once per page. */
export function renderPublisherStoryboard(input: PublisherDocument, designVersion: number, imageUrlPrefix: string): PublisherStoryboard {
  const document = PublisherDocument.parse(input)
  return {
    designVersion, document, css: buildCss(document),
    pages: document.pages.map((page) => ({ id: page.id, pageNumber: page.pageNumber, ...renderPage(document, page, imageUrlPrefix) })),
  }
}

function renderPage(doc: PublisherDocument, page: PublisherPage, imageUrlPrefix: string, storyboard = false): Omit<PublisherPreview, "css"> {
  const master = doc.masters.find((m) => m.id === page.masterId)!
  const warnings = new Set<string>()
  if (page.confidence === "heuristic") warnings.add("extraction-only")
  const componentById = new Map(doc.components.map((c) => [c.id, c]))
  const isHeading = (node: ContentNodeData): boolean => !!(node.headingLevel || headingLevelForRole(node.role) || /heading|title/.test(node.role ?? "") || node.structure === "heading")
  const renderNode = (node: ContentNodeData, inline = false): string => {
    if (node.isPruned) return ""
    const component = page.components[node.nodeId]
    const spec = component ? componentById.get(component) : undefined
    const treated = spec?.treatment && spec.treatment !== "plain"
    const wrapBox = (children: ContentNodeData[], paragraph = false) => {
      const active = children.filter((child) => !child.isPruned)
      const hasHeader = treated && spec.header && spec.header !== "none" && active[0] && isHeading(active[0])
      const header = hasHeader ? `<div class="pub-box-heading">${renderNode(active[0])}</div>` : ""
      const body = (hasHeader ? active.slice(1) : active).map((child) => renderNode(child, paragraph)).join(paragraph ? " " : "\n")
      return treated ? `${header}<div class="pub-box-body">${body}</div>` : body
    }
    const treatmentClass = treated ? ` pub-box${spec.treatment === "banner" ? " pub-banner" : ""}` : ""
    if (node.children) {
      const tag = /sidebar|aside|callout/.test(node.structure ?? "") ? "aside" : /image|figure/.test(node.structure ?? "") ? "figure" : /quote/.test(node.structure ?? "") ? "blockquote" : "div"
      if (/table/.test(node.structure ?? "")) warnings.add("table-review")
      const paragraph = node.structure === "paragraph"
      const idAttribute = storyboard && !["group", "activity"].includes(node.structure ?? "") ? "data-publisher-node" : "data-id"
      const headingNode = publisherNodes(node.children).find((child) => !child.children && isHeading(child))
      const label = tag === "aside" && headingNode ? ` aria-labelledby="pub-heading-${escape(headingNode.nodeId)}"` : ""
      return `<${tag}${label} ${idAttribute}="${escape(node.nodeId)}" class="pub-component ${component ?? ""}${paragraph ? " pub-paragraph" : ""}${treatmentClass}">${wrapBox(node.children, paragraph)}</${tag}>`
    }
    if (node.role === "image") {
      warnings.add("image-alt-review")
      const image = `<img data-id="${escape(node.nodeId)}" class="pub-image ${treated ? "" : component ?? ""}" src="${escape(imageUrlPrefix)}/${encodeURIComponent(node.nodeId)}" alt="">`
      return treated ? `<div class="pub-component ${component}${treatmentClass}"><div class="pub-box-body">${image}</div></div>` : image
    }
    if (node.text === undefined) return ""
    const style = page.textStyles[node.nodeId]
    if (!style) throw new Error(`Missing text style for ${node.nodeId}`)
    const heading = node.headingLevel ?? headingLevelForRole(node.role ?? "") ?? (/heading|title/.test(node.role ?? "") ? 2 : undefined)
    const tag = heading ? `h${heading}` : inline ? "span" : "p"
    if (/<[a-z]|\\\(|\$\$/.test(node.text)) warnings.add("rich-text-review")
    const text = `<${tag}${heading ? ` id="pub-heading-${escape(node.nodeId)}"` : ""} data-id="${escape(node.nodeId)}" class="pub-text ${style}${heading ? ` adt-h${heading}` : ""}">${escape(node.text)}</${tag}>`
    return treated ? `<div class="pub-component ${component}${treatmentClass}"><div class="pub-box-body">${text}</div></div>` : text
  }
  const renderNodes = (nodes: ContentNodeData[]): string => {
    const chunks: string[] = []
    for (let i = 0; i < nodes.length; i++) {
      if (componentById.get(page.components[nodes[i].nodeId])?.treatment === "banner") {
        const banners = [renderNode(nodes[i])]
        while (i + 1 < nodes.length && componentById.get(page.components[nodes[i + 1].nodeId])?.treatment === "banner") banners.push(renderNode(nodes[++i]))
        chunks.push(banners.length > 1 ? `<div class="pub-banner-group">${banners.join("\n")}</div>` : banners[0])
      } else chunks.push(renderNode(nodes[i]))
    }
    return chunks.join("\n")
  }
  const nodes = new Map(page.nodes.map((node) => [node.nodeId, node]))
  const content = page.regions ? page.regions.map((region) => `<div class="pub-region"${region.sidebarWidth ? ` style="--pub-sidebar-width:${region.sidebarWidth}%"` : ""} data-region="${region.id}" data-layout="${region.template}"${region.flow === "wrap" ? ' data-flow="wrap"' : ""}>${region.slots.map((slot) => `<div class="pub-slot" data-column="${slot.column}">${renderNodes(slot.nodeIds.map((id) => nodes.get(id)!))}</div>`).join("\n")}</div>`).join("\n") : renderNodes(page.nodes)
  const html = `<article class="pub-page ${master.id}" data-master="${master.kind}"${doc.theme ? ' data-design="learning"' : ""} data-page-id="${escape(page.id)}"><div class="pub-content${page.regions ? " pub-regions" : ""}">${content}</div><footer class="pub-folio" aria-hidden="true"><span>${escape(page.sectionType.replace(/_/g, " "))}</span><span>${page.pageNumber}</span></footer></article>`
  if (master.kind === "activity") warnings.add("static-activity")
  return { html, warnings: [...warnings] }
}

/** Adapter for the regular versioned Storyboard path. CSS is the frozen shared
 * book library, carried inside #content so previews and saved HTML retain it.
 */
export function renderPublisherSection(design: PublisherDesignVersion, section: PageSectioningSection, sectionIndex: number, imageUrlPrefix: string): SectionRendering {
  const doc = PublisherDocument.parse(design.document)
  const page = doc.pages.find((p) => p.id === section.sectionId)
  if (!page?.regions) throw new Error(`No saved layout for ${section.sectionId}. Detect mixed layouts and save the Styles design.`)
  if (page.sectionType !== section.sectionType || JSON.stringify(page.nodes) !== JSON.stringify(section.nodes.map((node) => ContentNodeData.parse(node)))) {
    throw new Error(`Content changed for ${section.sectionId}. Analyze and save the Styles design again.`)
  }
  const rendered = renderPage(doc, page, imageUrlPrefix, true)
  const all = publisherNodes(page.nodes)
  const texts = all.filter((n) => !n.children && n.role !== "image" && n.text !== undefined)
  const html = `<section data-section-type="${escape(section.sectionType)}" data-section-id="${escape(section.sectionId)}">${rendered.html}</section>`
  const check = validateSectionHtml(html, texts.map((n) => n.nodeId), all.filter((n) => n.role === "image").map((n) => n.nodeId), imageUrlPrefix, {
    allowedContainerIds: all.filter((n) => ["group", "activity"].includes(n.structure ?? "")).map((n) => n.nodeId),
    expectedTexts: new Map(texts.map((n) => [n.nodeId, n.text!])),
    expectedSectionType: section.sectionType, expectedSectionId: section.sectionId,
    expectedContentIdOrder: all.filter((n) => !n.children).map((n) => n.nodeId),
  })
  // Validate semantic markup before attaching the schema-validated shared CSS.
  // Styles owns typography for this explicit strategy; the Fonts defaults do not.
  const headingErrors = validateTypographyHierarchy(html, texts.map((n) => ({ text_id: n.nodeId, text_type: n.role ?? "text", heading_level: n.headingLevel })))
  if (!check.valid || headingErrors.length) throw new Error(`Invalid publisher layout: ${[...check.errors, ...headingErrors].join("; ")}`)
  return {
    sectionIndex, sectionType: section.sectionType,
    reasoning: `Publisher styles design version ${design.version}; ${page.regions.length} layout regions. ${rendered.warnings.join(", ")}`,
    html: `<div id="content" data-publisher-design-version="${design.version}"><style>${buildCss(doc, false)}</style>${check.sectionHtml ?? html}</div>`,
  }
}
