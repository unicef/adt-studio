import path from "node:path"
import {
  loadBookConfig,
  buildRenderStrategyResolver,
  buildRenderContext,
  renderSectionLlm,
  type RenderConfig,
} from "@adt/pipeline"
import type { SectionRendering } from "@adt/types"
import type {
  ContentNodeData,
  PageSectioningSection,
} from "@adt/types"
import type { Storage } from "@adt/storage"
import { createLLMModel, createPromptEngine } from "@adt/llm"
import type { AgentCredentials } from "../resolve-model.js"

export interface RenderSyntheticActivityInput {
  storage: Storage
  bookLabel: string
  booksDir: string
  promptsDir: string
  configPath?: string
  /** The page this activity will live on — used as visual anchor for the renderer. */
  anchorPageId: string
  /** The section index this activity will occupy after createSection's storage write. */
  sectionIndex: number
  /** Stable section id, e.g. `${pageId}_s${nextIndex}`. */
  sectionId: string
  sectionType: string
  /** The agent-emitted sectioning nodes. */
  nodes: ContentNodeData[]
  /** Optional natural-language refinement from the user description. */
  userInstructions?: string
  /** The book's styleguide content (markdown), if any. */
  styleguide?: string
  /** Per-provider keys forwarded to the renderer's LLM client. */
  credentials: AgentCredentials
}

export interface RenderSyntheticActivityResult {
  /** The PageSectioningSection that should be persisted under page-sectioning. */
  section: PageSectioningSection
  /** The SectionRendering that should be persisted under web-rendering. */
  rendering: SectionRendering
}

/**
 * Render a synthetic activity section using the pipeline's existing renderer.
 *
 * "Synthetic" here means the section did not come from page-sectioning — the
 * agent invented it. We still go through the same render path so the output
 * inherits the book's styleguide and the activity-template's accessibility
 * patterns. The anchor page's image is used as visual context (its closest
 * visual neighbour); the renderer compares against it for tone/style cues.
 */
export async function renderSyntheticActivity(
  input: RenderSyntheticActivityInput,
): Promise<RenderSyntheticActivityResult> {
  // Build the section we're going to render. isPruned=false at every level
  // (the agent is the authority for what should appear).
  const section: PageSectioningSection = {
    sectionId: input.sectionId,
    sectionType: input.sectionType,
    backgroundColor: "#ffffff",
    textColor: "#000000",
    pageNumber: null,
    isPruned: false,
    nodes: input.nodes,
  }

  // Collect the images the renderer needs to embed previews of in the LLM
  // prompt. We pull base64 for every image leaf the agent referenced AND for
  // every image already on the anchor page (in case the agent referenced an
  // anchor-page image without listing it explicitly).
  const images = new Map<
    string,
    { base64: string; width?: number; height?: number }
  >()
  const collectImageNodes = (node: ContentNodeData): void => {
    if (node.role === "image" && node.nodeId) {
      try {
        const dims = input.storage.getImageDimensions(node.nodeId)
        images.set(node.nodeId, {
          base64: input.storage.getImageBase64(node.nodeId),
          ...(dims?.width != null && { width: dims.width }),
          ...(dims?.height != null && { height: dims.height }),
        })
      } catch {
        // Image not in storage — renderer will produce a broken <img>. The
        // agent must not have called listPageImages first; we keep going.
      }
    }
    if (node.children) {
      for (const c of node.children) collectImageNodes(c)
    }
  }
  for (const top of input.nodes) collectImageNodes(top)

  // Anchor page image — the renderer's `pageImageBase64` slot. The renderer
  // uses this as a visual reference; for a synthetic section the anchor page
  // is the closest analog and grounds tone/scale.
  const pageImageBase64 = (() => {
    try {
      return input.storage.getPageImageBase64(input.anchorPageId)
    } catch {
      // No page screenshot stored; rendering still works, just without
      // visual context. Liquid templates handle empty page_image_base64.
      return ""
    }
  })()

  // Resolve the right RenderConfig for this section type from the book's
  // config. This is what gives us the per-activity-type prompt name, the
  // answer-prompt name (which produces activityAnswers as a second call),
  // and the model id.
  const config = loadBookConfig(input.bookLabel, input.booksDir, input.configPath)
  const resolveConfig = buildRenderStrategyResolver(config)
  const renderConfig: RenderConfig = resolveConfig(input.sectionType)

  // The renderer expects the LLM model to be created with the book's prompt
  // engine + cache dir. Mirror the page-edit-service setup.
  const cacheDir = path.join(
    path.resolve(input.booksDir),
    input.bookLabel,
    ".cache",
  )
  const bookPromptsDir = path.join(
    path.resolve(input.booksDir),
    input.bookLabel,
    "prompts",
  )
  const promptEngine = createPromptEngine([bookPromptsDir, input.promptsDir])
  const llmModel = createLLMModel({
    modelId: renderConfig.modelId,
    cacheDir,
    promptEngine,
    onLog: (entry) => input.storage.appendLlmLog(entry),
    credentials: input.credentials,
  })

  const renderContext = buildRenderContext(section, images, input.bookLabel)

  const rendering = await renderSectionLlm(
    {
      label: input.bookLabel,
      pageId: input.anchorPageId,
      pageImageBase64,
      sectionIndex: input.sectionIndex,
      section,
      context: renderContext,
      styleguide: input.styleguide,
      userPrompt: input.userInstructions,
    },
    renderConfig,
    llmModel,
    // No visual-refinement: avoids the screenshot dependency chain for what
    // is already a one-shot creation. Users can re-render the section later
    // through the normal re-render flow if they want visual refinement.
    undefined,
  )

  return { section, rendering }
}
