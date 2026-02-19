import { Liquid } from "liquidjs"
import type { SectionRendering } from "@adt/types"
import { validateSectionHtml } from "./validate-html.js"
import type { RenderConfig, RenderSectionInput } from "./web-rendering.js"

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

  const context: Record<string, unknown> = {
    section_id: input.sectionId,
    section_type: input.sectionType,
    background_color: input.backgroundColor,
    text_color: input.textColor,
    label: input.label,
    image_url_prefix: imageUrlPrefix,
    parts: input.parts.map((part) => {
      if (part.type === "group") {
        return {
          type: "group",
          group_id: part.groupId,
          group_type: part.groupType,
          texts: part.texts.map((t) => ({
            text_id: t.textId,
            text_type: t.textType,
            text: t.text,
          })),
        }
      }
      return {
        type: "image",
        image_id: part.imageId,
        image_url: `${imageUrlPrefix}/${part.imageId}`,
      }
    }),
  }

  const html = await templateEngine.render(config.templateName, context)

  // Validate the template output using the same validator as LLM output
  const allowedTextIds: string[] = []
  const allowedImageIds: string[] = []
  const expectedTexts = new Map<string, string>()
  for (const part of input.parts) {
    if (part.type === "group") {
      for (const t of part.texts) {
        allowedTextIds.push(t.textId)
        expectedTexts.set(t.textId, t.text)
      }
    } else {
      allowedImageIds.push(part.imageId)
    }
  }

  const check = validateSectionHtml(
    html,
    allowedTextIds,
    allowedImageIds,
    imageUrlPrefix,
    {
      expectedTexts,
      expectedSectionType: input.sectionType,
      expectedSectionId: input.sectionId,
    }
  )
  if (!check.valid) {
    throw new Error(
      `Template "${config.templateName}" produced invalid HTML: ${check.errors.join("; ")}`
    )
  }

  return {
    sectionIndex: input.sectionIndex,
    sectionType: input.sectionType,
    reasoning: "template-based rendering",
    html: check.sectionHtml ?? html,
  }
}
