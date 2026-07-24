import type {
  AppConfig,
  ContentNodeData,
  PageSectioningSection,
  TocEntry,
  TocGenerationOutput,
} from "@adt/types"
import {
  tocLLMSchema,
  WebRenderingOutput,
  DEFAULT_LLM_MAX_RETRIES,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"
import type { Storage, PageData } from "@adt/storage"
import { buildLanguageContext } from "./language-context.js"
import { stripHtml } from "./glossary.js"
import { getRenderSectioning, getSemanticSectioning } from "./render-sectioning.js"

/** Role values (leaves) whose text acts as a section heading for TOC. */
const HEADING_ROLE_TYPES = new Set(["heading"])

export interface TocGenerationConfig {
  promptName: string
  modelId: string
  maxRetries: number
  language: string
  mode: "extract" | "dynamic"
}

export function buildTocGenerationConfig(
  appConfig: AppConfig,
  language: string,
): TocGenerationConfig {
  return {
    promptName: appConfig.toc_generation?.prompt ?? "toc_generation",
    modelId:
      appConfig.toc_generation?.model ??
      appConfig.page_sectioning?.model ??
      "openai:gpt-4.1",
    maxRetries: appConfig.toc_generation?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    language,
    mode: appConfig.toc_mode ?? "extract",
  }
}

interface HeadingInfo {
  sectionId: string
  title: string
  textId: string
  roleType: string
  pageNumber: number | null
}

/** Find the first heading leaf anywhere within a section's node tree. */
function findFirstHeading(section: PageSectioningSection): ContentNodeData | null {
  const stack: ContentNodeData[] = [...section.nodes]
  while (stack.length > 0) {
    const node = stack.shift()!
    if (node.isPruned) continue
    if (node.role && HEADING_ROLE_TYPES.has(node.role)) return node
    if (node.children) stack.unshift(...node.children)
  }
  return null
}

/**
 * Collect all section headings and any original TOC page text from storage.
 */
function collectHeadingsAndToc(
  storage: Storage,
  pages: PageData[],
): { headings: HeadingInfo[]; originalTocText: string | null } {
  const headings: HeadingInfo[] = []
  let originalTocText: string | null = null

  for (const page of pages) {
    const sectioning = getRenderSectioning(storage, page.pageId)
    if (!sectioning) continue

    // Check for TOC page — collect its rendered text.
    const hasTocSection = sectioning.sections.some(
      (s) => s.sectionType === "table_of_contents" && !s.isPruned,
    )
    if (hasTocSection && originalTocText === null) {
      const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
      if (renderRow) {
        const renderParsed = WebRenderingOutput.safeParse(renderRow.data)
        if (renderParsed.success) {
          const tocHtml = renderParsed.data.sections
            .filter((s) => {
              const meta = sectioning.sections[s.sectionIndex]
              return meta?.sectionType === "table_of_contents" && !meta.isPruned
            })
            .map((s) => s.html)
            .join(" ")
          const text = stripHtml(tocHtml)
          if (text.length > 0) originalTocText = text
        }
      }
    }

    // Also check if the rendered section exists (so we have valid hrefs).
    const renderRow = storage.getLatestNodeData("web-rendering", page.pageId)
    const renderParsed = renderRow ? WebRenderingOutput.safeParse(renderRow.data) : null
    const renderedIndices = new Set(
      renderParsed?.success ? renderParsed.data.sections.map((s) => s.sectionIndex) : [],
    )

    // Collect first heading per non-pruned, rendered section.
    let semanticSections: PageSectioningSection[] | null | undefined
    for (let i = 0; i < sectioning.sections.length; i++) {
      const section = sectioning.sections[i]
      if (section.isPruned || !renderedIndices.has(i)) continue

      let heading = findFirstHeading(section)
      if (!heading && section.sectionType === "fixed-layout-page") {
        // Fixed-layout pages render from a positioned tree that has no heading
        // roles; read the semantic page-sectioning tree for the page instead.
        if (semanticSections === undefined) {
          semanticSections = getSemanticSectioning(storage, page.pageId)?.sections ?? null
        }
        for (const s of semanticSections ?? []) {
          const h = findFirstHeading(s)
          if (h) {
            heading = h
            break
          }
        }
      }
      if (!heading) continue

      headings.push({
        sectionId: section.sectionId,
        title: heading.text ?? "",
        textId: heading.nodeId,
        roleType: heading.role ?? "heading",
        pageNumber: section.pageNumber,
      })
    }
  }

  return { headings, originalTocText }
}

export interface GenerateTocOptions {
  storage: Storage
  pages: PageData[]
  config: TocGenerationConfig
  llmModel: LLMModel
}

export async function generateToc(
  options: GenerateTocOptions,
): Promise<TocGenerationOutput> {
  const { storage, pages, config, llmModel } = options
  const languageContext = buildLanguageContext(config.language)

  const { headings, originalTocText } = collectHeadingsAndToc(storage, pages)

  if (headings.length === 0) {
    return {
      entries: [],
      pageCount: pages.length,
      generatedAt: new Date().toISOString(),
    }
  }

  const result = await llmModel.generateObject<{
    reasoning: string
    entries: Array<{ title: string; level: number; sectionId: string }>
  }>({
    schema: tocLLMSchema,
    prompt: config.promptName,
    context: {
      ...languageContext,
      headings: headings.map((h) => ({
        sectionId: h.sectionId,
        title: h.title,
        textType: h.roleType,
      })),
      // Dynamic mode ignores the original TOC even when one is present —
      // the model rewrites titles from heading text instead of mirroring
      // the printed TOC.
      has_original_toc: config.mode === "extract" && originalTocText !== null,
      original_toc_text:
        config.mode === "extract" ? (originalTocText ?? "") : "",
      mode: config.mode,
    },
    maxRetries: config.maxRetries,
    maxTokens: Math.max(8192, headings.length * 80),
    log: {
      taskType: "toc-generation",
      promptName: config.promptName,
    },
  })

  // Build a lookup from sectionId to heading info for enrichment
  const headingMap = new Map(headings.map((h) => [h.sectionId, h]))

  const generatedEntries = result.object.entries
    .filter((e) => headingMap.has(e.sectionId))

  const entries: TocEntry[] = generatedEntries.map((e, i) => {
    const heading = headingMap.get(e.sectionId)!
    return {
      id: `toc_${String(i + 1).padStart(3, "0")}`,
      title: e.title,
      sectionId: e.sectionId,
      href: `${e.sectionId}.html`,
      chapterId: heading.textId,
      level: Math.max(1, Math.min(3, e.level)),
    }
  })

  return {
    entries,
    pageCount: pages.length,
    generatedAt: new Date().toISOString(),
  }
}
