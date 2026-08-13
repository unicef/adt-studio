import {
  type AppConfig,
  type ContentNodeData,
  type PageSectioningOutput,
  type PageSectioningSection,
  type SectionRendering,
  type BookTypography,
  type WebRenderingOutput,
  DEFAULT_LLM_MAX_RETRIES,
  DEFAULT_LLM_MODEL_ID,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"
import type { BookFontPromptEntry } from "./fonts-bundle.js"
import { renderSectionLlm, type VisualRefinementDeps } from "./render-llm.js"
import { renderSectionTemplate, type TemplateEngine } from "./render-template.js"
import { repairTableOfContentsLayout } from "./toc-layout.js"

export interface VisualRefinementConfig {
  enabled: boolean
  maxIterations: number
  promptName: string
  timeoutMs: number
  temperature: number
}

export interface RenderConfig {
  renderType: "llm" | "template" | "activity" | "fixed_layout"
  // llm / activity fields
  promptName: string
  modelId: string
  maxRetries: number
  timeoutMs: number
  temperature: number
  // activity fields — answer generation prompt
  answerPromptName: string
  // template fields
  templateName: string
  // visual refinement — screenshot-based LLM feedback loop
  visualRefinement?: VisualRefinementConfig
}

/**
 * Liquid-friendly render tree node. Produced by `buildRenderContext` from
 * `ContentNodeData`; pruned nodes are filtered out upstream. Either
 * `structure` (container) or `role` (leaf) is set.
 */
export interface RenderNode {
  node_id: string
  structure?: string
  role?: string
  text?: string
  heading_level?: number
  outline_entry_id?: string
  heading_style_cluster_id?: string
  image_id?: string
  image_url?: string
  children?: RenderNode[]
}

export interface LeafText {
  text_id: string
  text_type: string
  text: string
  heading_level?: number
  outline_entry_id?: string
  heading_style_cluster_id?: string
}

export interface ImageRef {
  image_id: string
  image_url: string
  image_base64?: string
  width?: number
  height?: number
}

/**
 * Context derived from a section's tree. `nodes` is passed to Liquid for
 * tree-aware rendering; `leaf_texts`/`image_refs`/`group_ids` drive the
 * validator and prompt image-listing.
 */
export interface RenderContext {
  nodes: RenderNode[]
  leaf_texts: LeafText[]
  image_refs: ImageRef[]
  group_ids: string[]
}

/** A page image supplied as an extra visual reference for merged-in content. */
export interface SourcePageImage {
  pageId: string
  imageBase64: string
}

export interface RenderSectionInput {
  label: string
  pageId: string
  pageImageBase64: string
  sectionIndex: number
  section: PageSectioningSection
  context: RenderContext
  /**
   * Page images for content merged into this section from other pages
   * (section.sourcePageIds) — shown to the LLM alongside the hosting page's
   * image so merged content has a visual reference.
   */
  sourcePages?: SourcePageImage[]
  styleguide?: string
  bookFonts?: BookFontPromptEntry[]
  /** Book typography (editable size-per-role map), shared with every page. */
  typography?: BookTypography
  /** Optional user instructions appended to the LLM prompt during re-render */
  userPrompt?: string
}

export interface RenderPageInput {
  label: string
  pageId: string
  pageImageBase64: string
  sectioning: PageSectioningOutput
  images: Map<string, { base64: string; width?: number; height?: number }>
  /**
   * Page images keyed by pageId for every page referenced by any section's
   * `sourcePageIds`. Sections pick their own subset at render time.
   */
  sourcePageImages?: Map<string, string>
  styleguide?: string
  bookFonts?: BookFontPromptEntry[]
  /** Book typography (editable size-per-role map), shared with every page. */
  typography?: BookTypography
  /** Optional user instructions appended to the LLM prompt during re-render */
  userPrompt?: string
}

export interface RenderExecutionOptions {
  signal?: AbortSignal
}

export type ResolveLLMModel = LLMModel | ((modelId: string) => LLMModel)

function getLLMModel(
  resolver: ResolveLLMModel,
  modelId: string
): LLMModel {
  return typeof resolver === "function"
    ? resolver(modelId)
    : resolver
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted")
}

/**
 * Container `structure` kinds whose node_id may carry `data-id` on the
 * rendered wrapper element. All other container kinds must render as bare
 * wrappers (no data-id) so the validator's "element with data-id has string
 * children only" rule holds. Templates and prompts must stay in sync with
 * this set.
 */
export const GROUP_CONTAINER_STRUCTURES: ReadonlySet<string> = new Set([
  "group",
  "activity",
])

function imageUrlFor(label: string, imageId: string): string {
  return `/api/books/${label}/images/${imageId}`
}

/**
 * Collect the imageIds of every unpruned image leaf referenced by the given
 * sections. Sections can reference images extracted on other pages (cross-page
 * merges, images added from another page), so render-image maps must be built
 * from this set — not from the hosting page's own image list alone.
 */
export function collectReferencedImageIds(
  sections: PageSectioningSection[]
): Set<string> {
  const ids = new Set<string>()
  const walk = (node: ContentNodeData): void => {
    if (node.isPruned) return
    if (node.role === "image") {
      ids.add(node.nodeId)
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  for (const section of sections) {
    if (section.isPruned) continue
    for (const top of section.nodes) walk(top)
  }
  return ids
}

/**
 * Build the pageId → page-image map for every page referenced by any
 * section's `sourcePageIds` (cross-page merges). Getter failures (source
 * page deleted) are skipped. Returns undefined when no section carries
 * cross-page provenance.
 */
export function collectSourcePageImages(
  sections: PageSectioningSection[],
  getPageImageBase64: (pageId: string) => string
): Map<string, string> | undefined {
  const ids = new Set<string>()
  for (const section of sections) {
    for (const id of section.sourcePageIds ?? []) ids.add(id)
  }
  if (ids.size === 0) return undefined
  const images = new Map<string, string>()
  for (const id of ids) {
    try {
      images.set(id, getPageImageBase64(id))
    } catch {
      // Source page no longer exists — render without its image.
    }
  }
  return images
}

/**
 * Walk a section's content tree once and produce the Liquid-friendly render
 * context. Pruned nodes are dropped. Leaves, image references, and
 * group/activity container node_ids are collected in DFS order so the
 * validator can build its allow-list.
 */
export function buildRenderContext(
  section: PageSectioningSection,
  images: Map<string, { base64: string; width?: number; height?: number }>,
  label: string
): RenderContext {
  const leaf_texts: LeafText[] = []
  const image_refs: ImageRef[] = []
  const group_ids: string[] = []

  function walk(node: ContentNodeData): RenderNode | null {
    if (node.isPruned) return null

    if (node.role === "image") {
      const imageId = node.nodeId
      const img = images.get(imageId)
      // Drop image nodes whose bytes aren't available. This happens when the
      // sectioning tree references an id that a later crop/segment step
      // superseded in image-filtering (the tree still points at the pre-crop
      // id, e.g. `..._seg003_v1` after it became `..._seg003_v1_crop1`).
      // Emitting a base64-less ref would send the literal string "undefined"
      // to the render prompt and crash the whole storyboard step; the missing
      // id was pruned by image-filtering anyway, so it should not render.
      if (!img?.base64) return null
      const url = imageUrlFor(label, imageId)
      image_refs.push({
        image_id: imageId,
        image_url: url,
        image_base64: img.base64,
        ...(img.width != null && { width: img.width }),
        ...(img.height != null && { height: img.height }),
      })
      return {
        node_id: imageId,
        role: "image",
        image_id: imageId,
        image_url: url,
      }
    }

    if (node.role) {
      leaf_texts.push({
        text_id: node.nodeId,
        text_type: node.role,
        text: node.text ?? "",
        ...(node.headingLevel !== undefined && { heading_level: node.headingLevel }),
        ...(node.outlineEntryId !== undefined && { outline_entry_id: node.outlineEntryId }),
        ...(node.headingStyleClusterId !== undefined && {
          heading_style_cluster_id: node.headingStyleClusterId,
        }),
      })
      return {
        node_id: node.nodeId,
        role: node.role,
        text: node.text ?? "",
        ...(node.headingLevel !== undefined && { heading_level: node.headingLevel }),
        ...(node.outlineEntryId !== undefined && { outline_entry_id: node.outlineEntryId }),
        ...(node.headingStyleClusterId !== undefined && {
          heading_style_cluster_id: node.headingStyleClusterId,
        }),
      }
    }

    if (node.structure) {
      const out: RenderNode = {
        node_id: node.nodeId,
        structure: node.structure,
      }
      if (GROUP_CONTAINER_STRUCTURES.has(node.structure)) {
        group_ids.push(node.nodeId)
      }
      if (node.children) {
        const kids: RenderNode[] = []
        for (const c of node.children) {
          const rendered = walk(c)
          if (rendered) kids.push(rendered)
        }
        if (kids.length > 0) out.children = kids
      }
      return out
    }

    return null
  }

  const nodes: RenderNode[] = []
  for (const top of section.nodes) {
    const rendered = walk(top)
    if (rendered) nodes.push(rendered)
  }

  return { nodes, leaf_texts, image_refs, group_ids }
}

/**
 * Render all sections for a page. Pure function — no side effects.
 * The caller handles concurrency, storage writes, and progress.
 *
 * Dispatches each section to the appropriate renderer based on config.renderType.
 */
export async function renderPage(
  input: RenderPageInput,
  resolveConfig: (sectionType: string) => RenderConfig,
  llmModel: ResolveLLMModel,
  templateEngine?: TemplateEngine,
  visualRefinement?: VisualRefinementDeps,
  options: RenderExecutionOptions = {},
): Promise<WebRenderingOutput> {
  const sections: SectionRendering[] = []

  for (let i = 0; i < input.sectioning.sections.length; i++) {
    throwIfAborted(options.signal)

    const section = input.sectioning.sections[i]

    // Skip pruned sections
    if (section.isPruned) continue

    const context = buildRenderContext(section, input.images, input.label)

    // Skip sections with no renderable content
    if (context.leaf_texts.length === 0 && context.image_refs.length === 0) continue

    const config = resolveConfig(section.sectionType)

    const sourcePages: SourcePageImage[] = []
    for (const sourcePageId of section.sourcePageIds ?? []) {
      const imageBase64 = input.sourcePageImages?.get(sourcePageId)
      if (imageBase64) sourcePages.push({ pageId: sourcePageId, imageBase64 })
    }

    const sectionInput: RenderSectionInput = {
      label: input.label,
      pageId: input.pageId,
      pageImageBase64: input.pageImageBase64,
      sectionIndex: i,
      section,
      context,
      ...(sourcePages.length > 0 && { sourcePages }),
      styleguide: input.styleguide,
      bookFonts: input.bookFonts,
      typography: input.typography,
      userPrompt: input.userPrompt,
    }

    let rendering: SectionRendering
    if (config.renderType === "template") {
      if (!templateEngine) {
        throw new Error(
          "Template engine required for template render type"
        )
      }
      rendering = await renderSectionTemplate(
        sectionInput,
        config,
        templateEngine
      )
    } else {
      // Both "llm" and "activity" use the LLM renderer.
      // Activity-specific behaviour (looser validation, answer generation)
      // is driven by config fields (renderType, answerPromptName).
      rendering = await renderSectionLlm(
        sectionInput,
        config,
        getLLMModel(llmModel, config.modelId),
        visualRefinement,
        options,
      )
    }

    // LLM rendering already applies this repair; templates bypass that path.
    if (
      config.renderType === "template" &&
      section.sectionType === "table_of_contents"
    ) {
      rendering = {
        ...rendering,
        html: repairTableOfContentsLayout(rendering.html, context.leaf_texts),
      }
    }

    throwIfAborted(options.signal)
    sections.push(rendering)
  }

  return { sections }
}

const DEFAULT_RENDER_CONFIG = {
  prompt: "web_generation_html",
  model: DEFAULT_LLM_MODEL_ID,
  max_retries: DEFAULT_LLM_MAX_RETRIES,
  timeout: 180,
  temperature: 0.3,
}

const DEFAULT_VISUAL_REFINEMENT = {
  prompt: "visual_review",
  max_iterations: 3,
  timeout: 180,
  temperature: 0.3,
}

/**
 * Build a resolver that returns a RenderConfig for a given section type.
 *
 * Resolution order:
 *   1. section_render_strategies[sectionType] → named strategy in render_strategies
 *   2. default_render_strategy → named strategy in render_strategies
 *   3. Hard-coded defaults
 *
 * After resolution, applies the `storyboard_effort` knob (relaxed/medium/high)
 * to scale LLM retries and visual-refinement iterations on top of the per-
 * strategy defaults. Only affects `llm` and `activity` render types — template
 * strategies pass through unchanged.
 */
export function buildRenderStrategyResolver(
  appConfig: AppConfig
): (sectionType: string) => RenderConfig {
  const strategies = appConfig.render_strategies ?? {}
  const rawSectionMapping = appConfig.section_render_strategies ?? {}
  const sectionMapping =
    appConfig.generate_activities === false
      ? Object.fromEntries(Object.entries(rawSectionMapping).filter(([k]) => !k.startsWith("activity_")))
      : rawSectionMapping
  const defaultName = appConfig.default_render_strategy
  const effort = appConfig.storyboard_effort

  return (sectionType: string): RenderConfig => {
    const sectionStrategyName = sectionMapping[sectionType]
    const sectionStrategy = sectionStrategyName
      ? strategies[sectionStrategyName]
      : undefined
    const defaultStrategy = defaultName
      ? strategies[defaultName]
      : undefined
    const strategy = sectionStrategy ?? defaultStrategy
    const cfg = strategy?.config

    const vr = cfg?.visual_refinement

    const base: RenderConfig = {
      renderType: strategy?.render_type ?? "llm",
      promptName: cfg?.prompt ?? DEFAULT_RENDER_CONFIG.prompt,
      modelId: cfg?.model ?? appConfig.default_model ?? DEFAULT_RENDER_CONFIG.model,
      maxRetries: cfg?.max_retries ?? DEFAULT_RENDER_CONFIG.max_retries,
      timeoutMs: (cfg?.timeout ?? DEFAULT_RENDER_CONFIG.timeout) * 1000,
      temperature: cfg?.temperature ?? DEFAULT_RENDER_CONFIG.temperature,
      answerPromptName: cfg?.answer_prompt ?? "",
      templateName: cfg?.template ?? "",
      ...(vr?.enabled && {
        visualRefinement: {
          enabled: true,
          // Top-level overrides apply globally so users can tune visual review
          // without editing every render strategy.
          maxIterations:
            appConfig.visual_review_max_iterations ?? vr.max_iterations ?? DEFAULT_VISUAL_REFINEMENT.max_iterations,
          promptName: appConfig.visual_review_prompt ?? vr.prompt ?? DEFAULT_VISUAL_REFINEMENT.prompt,
          timeoutMs: (vr.timeout ?? DEFAULT_VISUAL_REFINEMENT.timeout) * 1000,
          temperature: vr.temperature ?? DEFAULT_VISUAL_REFINEMENT.temperature,
        },
      }),
    }

    return applyEffort(base, effort)
  }
}

/**
 * Scale a `RenderConfig` based on the `storyboard_effort` knob. No-op for
 * template render types and for `medium`/unset (treated as the baseline).
 */
function applyEffort(
  base: RenderConfig,
  effort: "high" | "medium" | "relaxed" | undefined,
): RenderConfig {
  if (!effort || effort === "medium") return base
  if (base.renderType !== "llm" && base.renderType !== "activity") return base
  if (effort === "relaxed") {
    return {
      ...base,
      maxRetries: Math.min(base.maxRetries, 2),
      visualRefinement: undefined,
    }
  }
  // effort === "high"
  return {
    ...base,
    maxRetries: base.maxRetries + 2,
    visualRefinement: base.visualRefinement
      ? {
          ...base.visualRefinement,
          maxIterations: base.visualRefinement.maxIterations + 1,
        }
      : undefined,
  }
}
