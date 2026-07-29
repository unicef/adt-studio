export function getKnownPromptVariables(promptName: string): string[] {
  const direct = PROMPT_VARIABLES[promptName]
  if (direct) return direct
  if (promptName.startsWith("activity_")) return ACTIVITY_PROMPT_VARIABLES
  return []
}

export function extractLiquidVariables(content: string): string[] {
  const found = new Set<string>()
  const addExpressionVariables = (expression: string) => {
    const withoutFilters = expression.split("|")[0] ?? expression
    const matches = withoutFilters.matchAll(/\b[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*\b/g)
    for (const match of matches) {
      const value = match[0]
      if (!value.startsWith("_") && !LIQUID_RESERVED_WORDS.has(value)) {
        found.add(value)
      }
    }
  }

  for (const match of content.matchAll(/\{\{\s*([\s\S]*?)\s*\}\}/g)) {
    addExpressionVariables(match[1] ?? "")
  }

  for (const match of content.matchAll(/\{%\s*([\s\S]*?)\s*%\}/g)) {
    const tag = match[1] ?? ""
    const forMatch = tag.match(/^for\s+\w+\s+in\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/)
    if (forMatch?.[1]) found.add(forMatch[1])

    const imageMatch = tag.match(/^image\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/)
    if (imageMatch?.[1]) found.add(imageMatch[1])

    if (/^(if|elsif|unless|case|assign|include)\b/.test(tag)) {
      addExpressionVariables(tag)
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b))
}

/* eslint-disable lingui/no-unlocalized-strings -- Liquid snippets and prompt variable names are technical identifiers, not UI prose. */
export const LIQUID_SNIPPETS = {
  printVariable: "{{ language }}",
  loopArray: "{% for image in images %}\n{{ image.image_id }}\n{% endfor %}",
  condition: "{% if grade_level != \"\" %}\nUse grade-level guidance.\n{% endif %}",
  filters: "{{ text | strip | truncate: 120 }}",
  chat: "{% chat role: \"system\" %}\nSystem instructions...\n{% endchat %}",
  image: "{% image page.imageBase64 %}",
}

const LIQUID_RESERVED_WORDS = new Set([
  "and",
  "assign",
  "blank",
  "capture",
  "case",
  "comment",
  "contains",
  "else",
  "elsif",
  "endcapture",
  "endcase",
  "endchat",
  "endcomment",
  "endif",
  "endfor",
  "false",
  "for",
  "if",
  "image",
  "in",
  "include",
  "nil",
  "not",
  "null",
  "or",
  "role",
  "system",
  "true",
  "unless",
  "when",
])

const IMAGE_FILTER_VARIABLES = [
  "page_image_base64",
  "images",
  "images[].imageId",
  "images[].imageBase64",
  "images[].width",
  "images[].height",
]

const RENDER_PROMPT_VARIABLES = [
  "label",
  "page_image_base64",
  "section_id",
  "section_type",
  "nodes",
  "leaf_texts",
  "images",
  "group_ids",
  "styleguide",
  "book_fonts",
  "viewports",
  "user_instructions",
]

const ACTIVITY_PROMPT_VARIABLES = [
  ...RENDER_PROMPT_VARIABLES,
  "activity_html",
]

const PROMPT_VARIABLES: Record<string, string[]> = {
  metadata_extraction: [
    "pages",
    "pages[].pageNumber",
    "pages[].text",
    "pages[].imageBase64",
  ],
  image_meaningfulness: IMAGE_FILTER_VARIABLES,
  image_cropping: IMAGE_FILTER_VARIABLES,
  image_segmentation: IMAGE_FILTER_VARIABLES,
  page_sectioning: [
    "page",
    "page.pageNumber",
    "page.text",
    "page.imageBase64",
    "images",
    "images[].image_id",
    "images[].imageBase64",
    "structure_types",
    "role_types",
    "section_types",
    "mode",
  ],
  page_sectioning_refinement: [
    "page",
    "page.pageNumber",
    "page.text",
    "page.imageBase64",
    "images",
    "structure_types",
    "role_types",
    "section_types",
    "mode",
    "max_refinements",
    "iteration",
    "prior_notes",
    "candidate",
    "candidate.reasoning",
    "candidate.sections_json",
  ],
  image_captioning: [
    "page_image_base64",
    "images",
    "images[].imageId",
    "images[].imageBase64",
    "language",
    "language_code",
    "book_summary",
    "user_instructions",
    "grade_level",
  ],
  translation: [
    "source_language",
    "source_language_code",
    "target_language",
    "target_language_code",
    "texts",
    "texts[].index",
    "texts[].text",
  ],
  image_translation: [],
  easy_read: [
    "language",
    "language_code",
    "section_text",
    "section_type",
    "texts",
    "texts[].index",
    "texts[].text",
  ],
  glossary: [
    "language",
    "language_code",
    "pages",
    "amount",
    "user_instructions",
    "seed_terms",
    "excluded_words",
  ],
  glossary_one: [
    "language",
    "language_code",
    "word",
    "context",
    "candidate_variations",
  ],
  book_summary: [
    "pages",
    "pages[].pageNumber",
    "pages[].text",
    "output_language",
    "output_language_code",
  ],
  toc_generation: [
    "language",
    "language_code",
    "headings",
    "headings[].sectionId",
    "headings[].title",
    "headings[].textType",
    "has_original_toc",
    "original_toc_text",
    "mode",
  ],
  quiz_generation: [
    "language",
    "language_code",
    "page_texts",
    "page_texts[].pageId",
    "page_texts[].text",
  ],
  font_assignment: [
    "fonts",
    "page_images",
    "book_summary",
    "book_title",
  ],
  styleguide_generation: [
    "page_images",
    "book_fonts",
  ],
  web_generation_html: RENDER_PROMPT_VARIABLES,
  web_generation_html_overlay: RENDER_PROMPT_VARIABLES,
  visual_review: [
    "page_image_base64",
    "section_type",
    "current_html",
    "nodes",
    "leaf_texts",
    "viewports",
  ],
  visual_review_flexible: [
    "page_image_base64",
    "section_type",
    "current_html",
    "nodes",
    "leaf_texts",
    "viewports",
  ],
  html_edit: [
    "current_html",
    "instruction",
    "screenshots",
    "previous_attempt_failure",
  ],
  html_edit_verify: [
    "instruction",
    "before_base64",
    "after_base64",
  ],
  ai_image_generation: [
    "user_prompt",
    "style",
    "image_type",
  ],
  ai_image_edit: [
    "user_prompt",
    "style",
    "image_type",
  ],
}
/* eslint-enable lingui/no-unlocalized-strings */
