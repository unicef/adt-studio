import { Liquid } from "liquidjs"
import type { SectionRendering } from "@adt/types"
import { validateSectionHtml } from "./validate-html.js"
import { validateTypographyHierarchy } from "./validate-typography-hierarchy.js"
import type {
  RenderConfig,
  RenderNode,
  RenderSectionInput,
} from "./web-rendering.js"

function subtreeHasImage(node: RenderNode): boolean {
  if (node.role === "image") return true
  if (!node.children) return false
  for (const child of node.children) {
    if (subtreeHasImage(child)) return true
  }
  return false
}

/**
 * Partition top-level nodes into image-bearing vs text-only lists for
 * two-column layouts. A mixed `image_group` (image leaf + non-image
 * children — text visually overlaid on the illustration) is split one
 * level deep: image children go to `image_nodes`, non-image children go
 * to `text_nodes`. All other nodes stay intact.
 */
function partitionNodes(nodes: RenderNode[]): {
  image_nodes: RenderNode[]
  text_nodes: RenderNode[]
} {
  const image_nodes: RenderNode[] = []
  const text_nodes: RenderNode[] = []
  for (const node of nodes) {
    const children = node.children ?? []
    const imageChildren = children.filter((c) => c.role === "image")
    const nonImageChildren = children.filter((c) => c.role !== "image")
    const isMixedImageGroup =
      node.structure === "image_group" &&
      imageChildren.length > 0 &&
      nonImageChildren.length > 0
    if (isMixedImageGroup) {
      image_nodes.push(...imageChildren)
      text_nodes.push(...nonImageChildren)
    } else if (subtreeHasImage(node)) {
      image_nodes.push(node)
    } else {
      text_nodes.push(node)
    }
  }
  return { image_nodes, text_nodes }
}

export interface TemplateEngine {
  render(templateName: string, context: Record<string, unknown>): Promise<string>
}

/**
 * Create a template engine that renders Liquid templates from a directory.
 * Plain Liquid — no custom tags (unlike the prompt engine).
 */
export function createTemplateEngine(templatesDir: string): TemplateEngine {
  const liquid = new Liquid({
    root: [templatesDir],
    extname: ".liquid",
    strictVariables: false,
  })

  return {
    async render(
      templateName: string,
      context: Record<string, unknown>
    ): Promise<string> {
      return liquid.renderFile(templateName, context)
    },
  }
}

/**
 * Render a single section using a Liquid template.
 * Deterministic — no LLM call, no retries. If validation fails, throws.
 */
export async function renderSectionTemplate(
  input: RenderSectionInput,
  config: RenderConfig,
  templateEngine: TemplateEngine
): Promise<SectionRendering> {
  const imageUrlPrefix = `/api/books/${input.label}/images`
  const { section, context: renderContext } = input

  const { image_nodes, text_nodes } = partitionNodes(renderContext.nodes)

  const templateContext: Record<string, unknown> = {
    section_id: section.sectionId,
    section_type: section.sectionType,
    background_color: section.backgroundColor,
    text_color: section.textColor,
    label: input.label,
    image_url_prefix: imageUrlPrefix,
    nodes: renderContext.nodes,
    image_nodes,
    text_nodes,
    leaf_texts: renderContext.leaf_texts,
    image_refs: renderContext.image_refs,
    group_ids: renderContext.group_ids,
  }

  const html = await templateEngine.render(config.templateName, templateContext)

  // Validate the template output using the same validator as LLM output
  const allowedTextIds = renderContext.leaf_texts.map((t) => t.text_id)
  const allowedImageIds = renderContext.image_refs.map((i) => i.image_id)
  const expectedTexts = new Map(
    renderContext.leaf_texts.map((t) => [t.text_id, t.text])
  )

  const check = validateSectionHtml(
    html,
    allowedTextIds,
    allowedImageIds,
    imageUrlPrefix,
    {
      allowedContainerIds: renderContext.group_ids,
      expectedTexts,
      expectedSectionType: section.sectionType,
      expectedSectionId: section.sectionId,
    }
  )
  const typographyErrors = validateTypographyHierarchy(
    check.sectionHtml ?? html,
    renderContext.leaf_texts,
  )
  if (!check.valid || typographyErrors.length > 0) {
    throw new Error(
      `Template "${config.templateName}" produced invalid HTML: ${[
        ...check.errors,
        ...typographyErrors,
      ].join("; ")}`
    )
  }

  return {
    sectionIndex: input.sectionIndex,
    sectionType: section.sectionType,
    reasoning: "template-based rendering",
    html: check.sectionHtml ?? html,
  }
}
