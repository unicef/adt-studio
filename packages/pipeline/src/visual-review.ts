import { visualReviewLLMSchema } from "@adt/types"
import type { TextbookGeometryPlan, TextbookPixelRect } from "@adt/types"
import type { LLMModel, Message, ContentPart } from "@adt/llm"
import { DomUtils, parseDocument } from "htmlparser2"
import { buildScreenshotHtml } from "./screenshot-html.js"
import { SCREENSHOT_VIEWPORTS, getViewportBreakpoints, type ScreenshotRenderer } from "./screenshot.js"
import { applyTextbookGeometryPlan } from "./textbook-geometry.js"
import type { ImageRef } from "./web-rendering.js"

export const DEFAULT_VISUAL_REVIEW_MODEL_ID = "openai:gpt-5.4"

export interface VisualReviewDeps {
  llmModel: LLMModel
  screenshotRenderer: ScreenshotRenderer
  webAssetsDir: string
  storeScreenshot?: (base64: string) => void
  /** Book typography CSS so review screenshots use the same pinned sizes the
   *  packaged book does (avoids the reviewer fighting the shared scale). */
  typographyCss?: string
}

export interface VisualReviewValidation {
  valid: boolean
  errors: string[]
  cleanedHtml?: string
}

export interface RunVisualReviewLoopOptions {
  initialHtml: string
  label: string
  pageId: string
  images: Map<string, { base64: string; width?: number; height?: number }>
  deps: VisualReviewDeps
  promptName: string
  maxIterations: number
  timeoutMs: number
  temperature?: number
  pageImageBase64?: string
  /**
   * Page images for content merged into the section from other pages —
   * shown after the primary page image so the reviewer doesn't flag merged
   * content as missing from the original.
   */
  additionalPageImages?: Array<{ pageId: string; imageBase64: string }>
  promptContext?: Record<string, unknown>
  originalImageIntroText?: string
  firstIterationScreenshotsText: string
  nextIterationScreenshotsText: string
  trailingContextText: string
  textbookGeometryPlan?: TextbookGeometryPlan
  validateHtml: (html: string) => VisualReviewValidation
  signal?: AbortSignal
}

export interface VisualReviewResult {
  html: string
  approved: boolean
}

interface ConversationTurn {
  user: Message
  assistant?: Message
  feedback?: Message
}

function stripMarkdownFence(content: string): string {
  return content
    .replace(/^```(?:html)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "")
}

function buildConversationWindow(turns: ConversationTurn[]): Message[] {
  // Keep only the most recent turn (carries the latest screenshots and HTML).
  // Earlier turns add tokens (especially base64 screenshots) without helping the
  // model evaluate the current state — the system prompt + the current screenshots
  // are sufficient.
  const selectedTurns = turns.slice(-1)

  const messages: Message[] = []
  for (const turn of selectedTurns) {
    messages.push(turn.user)
    if (turn.assistant) messages.push(turn.assistant)
    if (turn.feedback) messages.push(turn.feedback)
  }
  return messages
}

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function applyGeometryUpdates(
  plan: TextbookGeometryPlan | undefined,
  updates: Array<{ image_id: string; crop: TextbookPixelRect }>,
): { plan: TextbookGeometryPlan | undefined; errors: string[] } {
  if (updates.length === 0) return { plan, errors: [] }
  if (!plan) return { plan, errors: ["Visual review returned crop geometry without an active textbook geometry plan."] }
  const next: TextbookGeometryPlan = structuredClone(plan)
  const errors: string[] = []
  for (const update of updates) {
    const image = next.images.find((candidate) => candidate.image_id === update.image_id)
    if (!image?.crop) {
      errors.push(`Visual review cannot refine unknown or uncropped image ${update.image_id}.`)
      continue
    }
    if (image.writable_regions.length > 0) {
      errors.push(`Visual review cannot refine crop ${update.image_id} because it contains anchored writable regions.`)
      continue
    }
    const current = image.crop
    const revised = update.crop
    const inside =
      revised.x >= current.x &&
      revised.y >= current.y &&
      revised.x + revised.width <= current.x + current.width &&
      revised.y + revised.height <= current.y + current.height
    if (!inside) {
      errors.push(
        `Visual review crop ${update.image_id} must tighten the current rectangle ` +
        `(${current.x},${current.y},${current.width},${current.height}), not expand or move outside it.`,
      )
      continue
    }
    image.crop = revised
  }
  return { plan: next, errors }
}

function applyTranscriptionUpdates(
  plan: TextbookGeometryPlan | undefined,
  html: string,
  updates: Array<{ image_id: string; text_id: string }>,
): { plan: TextbookGeometryPlan | undefined; html: string; errors: string[] } {
  if (updates.length === 0) return { plan, html, errors: [] }
  if (!plan) {
    return {
      plan,
      html,
      errors: ["Visual review returned baked-text updates without an active textbook geometry plan."],
    }
  }
  const next: TextbookGeometryPlan = structuredClone(plan)
  const doc = parseDocument(html)
  const contentNodes = DomUtils.findAll(
    (node) => node.type === "tag" && typeof node.attribs?.["data-id"] === "string",
    doc.children,
  )
  const errors: string[] = []

  for (const update of updates) {
    const imagePlan = next.images.find((candidate) => candidate.image_id === update.image_id)
    if (!imagePlan?.keep_visible) {
      errors.push(`Visual review cannot attach baked text to unknown or omitted image ${update.image_id}.`)
      continue
    }
    const imageIndex = contentNodes.findIndex(
      (node) => node.name.toLowerCase() === "img" && node.attribs?.["data-id"] === update.image_id,
    )
    const textIndex = contentNodes.findIndex(
      (node) => node.name.toLowerCase() !== "img" && node.attribs?.["data-id"] === update.text_id,
    )
    const interveningImage = imageIndex >= 0 && textIndex > imageIndex
      ? contentNodes.slice(imageIndex + 1, textIndex).some((node) => node.name.toLowerCase() === "img")
      : true
    if (imageIndex < 0 || textIndex <= imageIndex || interveningImage) {
      errors.push(
        `Visual review cannot mark ${update.text_id} as baked into ${update.image_id}; ` +
        "the text must follow that image before the next image in authoritative DOM order.",
      )
      continue
    }
    const textNode = contentNodes[textIndex]
    const classes = (textNode.attribs.class ?? "").split(/\s+/).filter(Boolean)
    if (classes.includes("sr-only")) {
      errors.push(
        `Visual review baked-text update ${update.text_id} is a no-op because that transcription is already sr-only; ` +
        "identify the still-visible duplicate text ID instead.",
      )
      continue
    }
    classes.push("sr-only")
    textNode.attribs.class = classes.join(" ")
    if (!imagePlan.baked_text_ids.includes(update.text_id)) {
      imagePlan.baked_text_ids.push(update.text_id)
    }
  }

  return {
    plan: next,
    html: DomUtils.getOuterHTML(doc.children),
    errors,
  }
}

/**
 * Visual review may remove an ordinary image that screenshot comparison proves
 * is a page replica or worksheet composite, but it must never expand the image
 * set. Generated textbook crops are stricter and handled below.
 * Image admission belongs to the generation prompt's textbook triage; letting
 * the reviewer add an image from the source-page screenshot silently undoes
 * that decision and can reintroduce a full-page raster.
 */
function imageAdditionErrors(currentHtml: string, revisedHtml: string): string[] {
  const collectImageIds = (html: string): Set<string> => {
    const doc = parseDocument(html)
    const images = DomUtils.findAll(
      (node) => node.type === "tag" && node.name.toLowerCase() === "img",
      doc.children,
    )
    return new Set(
      images
        .map((node) => node.attribs?.["data-id"])
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    )
  }

  const currentImageIds = collectImageIds(currentHtml)
  const revisedImageIds = collectImageIds(revisedHtml)
  return [...revisedImageIds]
    .filter((id) => !currentImageIds.has(id))
    .map(
      (id) =>
        `Visual review cannot add or restore image data-id "${id}". ` +
        "Image admission is decided before visual review; revise the existing semantic HTML without adding an <img>.",
    )
}

interface TextbookCropSignature {
  imageId: string
  wrapperClass: string
  wrapperStyle: string
  imageClass: string
  imageStyle: string
}

type ReviewImageMap = Map<string, { base64: string; width?: number; height?: number }>

function classNumber(
  className: string,
  prefix: "aspect" | "w" | "h" | "left" | "top",
): number | undefined {
  if (prefix === "aspect") {
    const match = className.match(/(?:^|\s)aspect-\[(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\](?:\s|$)/)
    if (!match) return undefined
    return Number(match[1]) / Number(match[2])
  }
  const escaped = prefix === "w" || prefix === "h" ? prefix : prefix
  const match = className.match(new RegExp(`(?:^|\\s)${escaped}-\\[(\\-?\\d+(?:\\.\\d+)?)%\\](?:\\s|$)`))
  if (match) return Number(match[1])
  if ((prefix === "left" || prefix === "top") && className.split(/\s+/).includes(`${prefix}-0`)) return 0
  return undefined
}

/** Decode the native-image rectangles represented by Tailwind percentage
 * geometry. Supplying this alongside screenshots gives the visual reviewer an
 * exact coordinate reference instead of asking it to reverse-engineer CSS by
 * eye. */
export function textbookGeometryManifest(html: string, images: ReviewImageMap): string {
  const doc = parseDocument(html)
  const lines: string[] = []
  const wrappers = DomUtils.findAll(
    (node) => node.type === "tag" && node.attribs?.["data-textbook-crop"] === "true",
    doc.children,
  )

  for (const wrapper of wrappers) {
    const image = DomUtils.findOne(
      (node) => node.type === "tag" && node.name.toLowerCase() === "img",
      wrapper.children ?? [],
      true,
    )
    const imageId = image?.attribs?.["data-id"]
    const source = imageId ? images.get(imageId) : undefined
    if (!imageId || !source?.width || !source.height || !image) continue
    const aspect = classNumber(wrapper.attribs?.class ?? "", "aspect")
    const widthPct = classNumber(image.attribs?.class ?? "", "w")
    const leftPct = classNumber(image.attribs?.class ?? "", "left")
    const topPct = classNumber(image.attribs?.class ?? "", "top")
    if (aspect == null || widthPct == null || leftPct == null || topPct == null || widthPct <= 0) continue
    const width = source.width * 100 / widthPct
    const height = width / aspect
    const x = -leftPct / 100 * width
    const y = -topPct / 100 * height
    lines.push(
      `- Crop ${imageId}: source ${source.width}x${source.height}px; current decoded native rectangle ` +
      `(x=${x.toFixed(1)}, y=${y.toFixed(1)}, width=${width.toFixed(1)}, height=${height.toFixed(1)}).`,
    )
  }

  const relativeWrappers = DomUtils.findAll(
    (node) =>
      node.type === "tag" &&
      (node.attribs?.class ?? "").split(/\s+/).includes("relative"),
    doc.children,
  )
  for (const wrapper of relativeWrappers) {
    const image = DomUtils.findOne(
      (node) => node.type === "tag" && node.name.toLowerCase() === "img",
      wrapper.children ?? [],
      true,
    )
    const controls = DomUtils.findAll(
      (node) =>
        node.type === "tag" &&
        (node.name.toLowerCase() === "input" || node.name.toLowerCase() === "textarea") &&
        (node.attribs?.class ?? "").split(/\s+/).includes("absolute"),
      wrapper.children ?? [],
    )
    const imageId = image?.attribs?.["data-id"]
    const source = imageId ? images.get(imageId) : undefined
    if (!imageId || !source?.width || !source.height || controls.length === 0) continue
    for (const control of controls) {
      const className = control.attribs?.class ?? ""
      const left = classNumber(className, "left")
      const top = classNumber(className, "top")
      const width = classNumber(className, "w")
      const height = classNumber(className, "h")
      if (left == null || top == null || width == null || height == null) continue
      const id = control.attribs?.["data-activity-item"] ?? control.attribs?.id ?? "unnamed-control"
      lines.push(
        `- Control ${id} on ${imageId}: source ${source.width}x${source.height}px; current decoded native rectangle ` +
        `(x=${(source.width * left / 100).toFixed(1)}, y=${(source.height * top / 100).toFixed(1)}, ` +
        `width=${(source.width * width / 100).toFixed(1)}, height=${(source.height * height / 100).toFixed(1)}).`,
      )
    }
  }

  if (lines.length === 0) return ""
  return "TEXTBOOK GEOMETRY MANIFEST (decoded from the current HTML; use these native-pixel values when auditing and revising):\n" + lines.join("\n")
}

/** Percentage-positioned controls must scale with their anchor image. A
 * min/max dimension silently overrides that geometry on narrow viewports and
 * creates the detached duplicate fields seen in textbook activities. */
export function anchoredOverlayGeometryErrors(html: string): string[] {
  const doc = parseDocument(html)
  const controls = DomUtils.findAll(
    (node) =>
      node.type === "tag" &&
      (node.name.toLowerCase() === "input" || node.name.toLowerCase() === "textarea") &&
      (node.attribs?.class ?? "").split(/\s+/).includes("absolute"),
    doc.children,
  )
  const errors: string[] = []
  for (const control of controls) {
    // Only validate controls whose nearest relative positioning ancestor also
    // contains their anchor image. Walking every outer relative container used
    // to report the same control several times and bury useful retry feedback.
    let wrapper = control.parent
    while (wrapper && wrapper.type === "tag") {
      const wrapperTokens = (wrapper.attribs?.class ?? "").split(/\s+/)
      if (wrapperTokens.includes("relative")) break
      wrapper = wrapper.parent
    }
    if (!wrapper || wrapper.type !== "tag") continue
    const hasImage = Boolean(DomUtils.findOne(
      (node) => node.type === "tag" && node.name.toLowerCase() === "img",
      wrapper.children ?? [],
      true,
    ))
    if (!hasImage) continue

    const id = control.attribs?.["data-activity-item"] ?? control.attribs?.id ?? "unknown"
    const tokens = (control.attribs?.class ?? "").split(/\s+/).filter(Boolean)
    const hasCoordinates = ["left", "top", "w", "h"].every((prefix) =>
      tokens.some((token) => new RegExp(`^${prefix}-\\[\\d+(?:\\.\\d+)?%\\]$`).test(token)),
    )
    const overridesGeometry = tokens.some((token) =>
      /^(?:max-[^:]+:)?(?:min|max)-(?:w|h)-/.test(token) ||
      (/^(?:max-[^:]+:)?(?:left|top|right|bottom|inset|w-|h-)/.test(token) && token.includes(":")),
    )
    if (!hasCoordinates || overridesGeometry) {
      errors.push(
        `Image-anchored response control "${id}" must use one invariant percentage left/top/width/height rectangle and no min/max dimension or breakpoint coordinate that can override it.`,
      )
    }
  }
  return errors
}

/**
 * Stable page-source crops are represented as one exact-aspect-ratio wrapper
 * plus percentage image width/offsets. Review may tighten those four values as
 * one rectangle after seeing screenshots, but it must preserve that coordinate
 * grammar and may never remove the crop or fall back to object-fit.
 */
export function textbookCropMutationErrors(currentHtml: string, revisedHtml: string): string[] {
  const collectCrops = (html: string): TextbookCropSignature[] => {
    const doc = parseDocument(html)
    const wrappers = DomUtils.findAll(
      (node) =>
        node.type === "tag" &&
        node.attribs?.["data-textbook-crop"] === "true",
      doc.children,
    )
    const signatures: TextbookCropSignature[] = []
    for (const wrapper of wrappers) {
      const image = DomUtils.findOne(
        (node) => node.type === "tag" && node.name.toLowerCase() === "img",
        wrapper.children ?? [],
        true,
      )
      const imageId = image?.attribs?.["data-id"]
      if (!image || typeof imageId !== "string" || imageId.length === 0) continue
      signatures.push({
        imageId,
        wrapperClass: wrapper.attribs?.class ?? "",
        wrapperStyle: wrapper.attribs?.style ?? "",
        imageClass: image.attribs?.class ?? "",
        imageStyle: image.attribs?.style ?? "",
      })
    }
    return signatures
  }

  const currentCrops = collectCrops(currentHtml)
  if (currentCrops.length === 0) return []

  const revisedDoc = parseDocument(revisedHtml)
  const revisedImageIds = new Set(
    DomUtils.findAll(
      (node) => node.type === "tag" && node.name.toLowerCase() === "img",
      revisedDoc.children,
    )
      .map((node) => node.attribs?.["data-id"])
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  )
  const revisedCrops = collectCrops(revisedHtml)

  const errors: string[] = []
  for (const current of currentCrops) {
    if (!revisedImageIds.has(current.imageId)) {
      errors.push(
        `Visual review cannot remove generated data-textbook-crop image "${current.imageId}". ` +
        "The crop geometry and its sr-only transcription decisions are atomic; keep the crop unchanged and request regeneration if it is unsafe.",
      )
      continue
    }
    const candidate = revisedCrops.find((crop) => crop.imageId === current.imageId)
    if (!candidate) {
      errors.push(
        `Visual review must keep data-textbook-crop image "${current.imageId}" inside its crop wrapper.`,
      )
      continue
    }

    const wrapperTokens = candidate.wrapperClass.split(/\s+/).filter(Boolean)
    const imageTokens = candidate.imageClass.split(/\s+/).filter(Boolean)
    const hasWrapperGeometry =
      wrapperTokens.includes("relative") &&
      wrapperTokens.includes("overflow-hidden") &&
      wrapperTokens.some((token) => /^aspect-\[\d+(?:\.\d+)?\/\d+(?:\.\d+)?\]$/.test(token))
    const hasImageGeometry =
      imageTokens.includes("absolute") &&
      imageTokens.includes("max-w-none") &&
      imageTokens.includes("h-auto") &&
      imageTokens.some((token) => /^w-\[\d+(?:\.\d+)?%\]$/.test(token)) &&
      imageTokens.some((token) => token === "left-0" || /^left-\[-\d+(?:\.\d+)?%\]$/.test(token)) &&
      imageTokens.some((token) => token === "top-0" || /^top-\[-\d+(?:\.\d+)?%\]$/.test(token))
    const hasForbiddenGeometry = imageTokens.some(
      (token) =>
        token === "h-full" ||
        token === "w-full" ||
        token === "max-w-full" ||
        token.startsWith("object-") ||
        /^(?:max-[^:]+:)?(?:aspect-|w-\[|left-|top-)/.test(token) && token.includes(":"),
    )

    if (
      !hasWrapperGeometry ||
      !hasImageGeometry ||
      hasForbiddenGeometry ||
      candidate.wrapperStyle.trim() !== "" ||
      candidate.imageStyle.trim() !== ""
    ) {
      errors.push(
        `Visual review produced unstable coordinate geometry for data-textbook-crop image "${current.imageId}". ` +
        "Keep relative/overflow-hidden/aspect-[W/H] on the wrapper and absolute/max-w-none/h-auto plus one percentage width, left, and top on the image; do not use inline styles, object-fit, full sizing, or breakpoint-specific crop coordinates.",
      )
    }
  }
  return errors
}

/** A reviewer may add sr-only to suppress a proven baked-text duplicate, but
 * may not surface a transcription the generator/reviewer already hid. */
export function srOnlyPreservationErrors(currentHtml: string, revisedHtml: string): string[] {
  const collectHiddenTextIds = (html: string): Set<string> => {
    const doc = parseDocument(html)
    return new Set(
      DomUtils.findAll(
        (node) =>
          node.type === "tag" &&
          node.name.toLowerCase() !== "img" &&
          typeof node.attribs?.["data-id"] === "string" &&
          (node.attribs?.class ?? "").split(/\s+/).includes("sr-only"),
        doc.children,
      )
        .map((node) => node.attribs!["data-id"])
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    )
  }

  const hiddenIds = collectHiddenTextIds(currentHtml)
  const revisedHiddenIds = collectHiddenTextIds(revisedHtml)
  return [...hiddenIds]
    .filter((id) => !revisedHiddenIds.has(id))
    .map(
      (id) =>
        `Visual review cannot remove sr-only from transcription data-id "${id}". ` +
        "The text was already hidden because it duplicates legible text inside a retained figure.",
    )
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error ? signal.reason : new Error("Operation aborted")
}

export async function runVisualReviewLoop(
  options: RunVisualReviewLoopOptions
): Promise<VisualReviewResult> {
  const {
    initialHtml,
    label,
    pageId,
    images,
    deps,
    promptName,
    maxIterations,
    timeoutMs,
    temperature,
    pageImageBase64,
    additionalPageImages,
    promptContext,
    originalImageIntroText = "Here is the original page image for reference:",
    firstIterationScreenshotsText,
    nextIterationScreenshotsText,
    trailingContextText,
    textbookGeometryPlan,
    validateHtml,
    signal,
  } = options

  throwIfAborted(signal)
  const initialMessages = await deps.llmModel.renderPrompt(promptName, {
    ...(promptContext ?? {}),
    viewports: getViewportBreakpoints(),
  })
  throwIfAborted(signal)
  const systemMsg = initialMessages.find((m) => m.role === "system")
  const systemPrompt = typeof systemMsg?.content === "string" ? systemMsg.content : undefined

  let html = initialHtml
  const turns: ConversationTurn[] = []
  let approved = false
  let activeGeometryPlan = textbookGeometryPlan
  const seenRevisions = new Set<string>([normalizeForCompare(initialHtml)])
  // Validation feedback carried forward when the previous revision failed
  // structural checks. Surfaced into the next user message so the model can fix
  // it. Cleared after each emit.
  let pendingValidationFeedback: string | null = null

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    throwIfAborted(signal)
    const screenshotHtml = await buildScreenshotHtml({
      sectionHtml: html,
      label,
      images,
      webAssetsDir: deps.webAssetsDir,
      typographyCss: deps.typographyCss,
    })

    // Render all viewport screenshots in parallel — they're independent and
    // each takes ~1-2s, so serialising them was a 3-6s tax per iteration.
    const screenshots = await Promise.all(
      SCREENSHOT_VIEWPORTS.map((vp) =>
        deps.screenshotRenderer.screenshot(
          screenshotHtml,
          { width: vp.width, height: vp.height },
          { signal },
        )
      )
    )
    throwIfAborted(signal)
    const screenshotParts: ContentPart[] = []
    for (let i = 0; i < SCREENSHOT_VIEWPORTS.length; i++) {
      const vp = SCREENSHOT_VIEWPORTS[i]
      const base64 = screenshots[i]
      deps.storeScreenshot?.(base64)
      screenshotParts.push(
        { type: "text", text: `${vp.label} screenshot (${vp.width}px wide):` },
        { type: "image", image: base64 },
      )
    }

    // Each iteration's user message is self-contained: original page image (if any)
    // + current screenshots + current HTML. The conversation window keeps only the
    // most recent turn, so prior screenshots aren't carried forward.
    const userParts: ContentPart[] = []
    if (pageImageBase64) {
      userParts.push(
        { type: "text", text: originalImageIntroText },
        { type: "image", image: pageImageBase64 },
      )
    }
    for (const sp of additionalPageImages ?? []) {
      userParts.push(
        {
          type: "text",
          text: `This section also includes content merged from another page (${sp.pageId}). That content does NOT appear in the page image above — use this additional page image as its visual reference:`,
        },
        { type: "image", image: sp.imageBase64 },
      )
    }
    userParts.push({
      type: "text",
      text: iteration === 0 ? firstIterationScreenshotsText : nextIterationScreenshotsText,
    })

    userParts.push(...screenshotParts)
    const geometryManifest = activeGeometryPlan
      ? textbookGeometryManifest(html, images)
      : ""
    if (geometryManifest) {
      userParts.push({ type: "text", text: `\n${geometryManifest}` })
    }
    userParts.push({
      type: "text",
      text: `\n${trailingContextText}\n\nCurrent HTML:\n\`\`\`html\n${html}\n\`\`\``,
    })
    if (pendingValidationFeedback) {
      userParts.push({ type: "text", text: pendingValidationFeedback })
      pendingValidationFeedback = null
    }

    const userMessage: Message = { role: "user", content: userParts }
    turns.push({ user: userMessage })

    const reviewResult = await deps.llmModel.generateObject<{
      approved: boolean
      reasoning: string
      content: string
      geometry_updates: Array<{ image_id: string; crop: TextbookPixelRect }>
      transcription_updates: Array<{ image_id: string; text_id: string }>
    }>({
      schema: visualReviewLLMSchema,
      system: systemPrompt,
      messages: buildConversationWindow(turns),
      maxRetries: 2,
      maxTokens: 16384,
      temperature,
      timeoutMs,
      signal,
      validate: (raw: unknown) => {
        const candidate = raw as {
          approved?: boolean
          content?: string
          geometry_updates?: Array<{ image_id: string; crop: TextbookPixelRect }>
          transcription_updates?: Array<{ image_id: string; text_id: string }>
        }
        const geometryUpdates = candidate.geometry_updates ?? []
        const transcriptionUpdates = candidate.transcription_updates ?? []
        const errors: string[] = []
        if (candidate.approved && (geometryUpdates.length > 0 || transcriptionUpdates.length > 0)) {
          errors.push("A response with geometry or transcription updates must set approved to false for re-screenshot verification.")
        }
        errors.push(...applyGeometryUpdates(activeGeometryPlan, geometryUpdates).errors)
        const proposedHtml = candidate.content
          ? stripMarkdownFence(candidate.content)
          : html
        errors.push(
          ...applyTranscriptionUpdates(
            activeGeometryPlan,
            proposedHtml,
            transcriptionUpdates,
          ).errors,
        )
        return { valid: errors.length === 0, errors }
      },
      log: {
        taskType: "visual-review",
        pageId,
        promptName,
      },
    })

    const assistantMessage: Message = {
      role: "assistant",
      content: JSON.stringify(reviewResult.object, null, 2),
    }
    turns[turns.length - 1].assistant = assistantMessage

    const geometryUpdates = reviewResult.object.geometry_updates ?? []
    const transcriptionUpdates = reviewResult.object.transcription_updates ?? []
    if (
      reviewResult.object.approved &&
      geometryUpdates.length === 0 &&
      transcriptionUpdates.length === 0
    ) {
      approved = true
      break
    }
    if (
      !reviewResult.object.content &&
      geometryUpdates.length === 0 &&
      transcriptionUpdates.length === 0
    ) break

    const geometryResult = applyGeometryUpdates(activeGeometryPlan, geometryUpdates)
    if (geometryResult.errors.length > 0) {
      pendingValidationFeedback =
        "Your geometry update failed validation with these errors:\n" +
        geometryResult.errors.map((error) => `- ${error}`).join("\n")
      continue
    }
    activeGeometryPlan = geometryResult.plan
    let revised = reviewResult.object.content
      ? stripMarkdownFence(reviewResult.object.content)
      : html
    if (geometryUpdates.length > 0 && activeGeometryPlan) {
      const imageRefs: ImageRef[] = [...images.entries()].map(([imageId, image]) => ({
        image_id: imageId,
        image_url: "",
        image_base64: image.base64,
        width: image.width,
        height: image.height,
      }))
      revised = applyTextbookGeometryPlan(revised, activeGeometryPlan, imageRefs)
    }
    const transcriptionResult = applyTranscriptionUpdates(
      activeGeometryPlan,
      revised,
      transcriptionUpdates,
    )
    if (transcriptionResult.errors.length > 0) {
      pendingValidationFeedback =
        "Your baked-text update failed validation with these errors:\n" +
        transcriptionResult.errors.map((error) => `- ${error}`).join("\n")
      continue
    }
    activeGeometryPlan = transcriptionResult.plan
    revised = transcriptionResult.html
    const visualIntegrityErrors = activeGeometryPlan
      ? [
          ...imageAdditionErrors(html, revised),
          ...textbookCropMutationErrors(html, revised),
          ...srOnlyPreservationErrors(html, revised),
          ...anchoredOverlayGeometryErrors(revised),
        ]
      : []
    const check = visualIntegrityErrors.length > 0
      ? { valid: false, errors: visualIntegrityErrors }
      : validateHtml(revised)

    if (check.valid) {
      const cleaned = check.cleanedHtml ?? revised
      const fingerprint = normalizeForCompare(cleaned)
      // Stop if the model produced a revision we've already seen (no progress).
      if (seenRevisions.has(fingerprint)) break
      seenRevisions.add(fingerprint)
      html = cleaned
    } else {
      pendingValidationFeedback =
        "Your previous revision failed structural validation with these errors:\n" +
        check.errors.map((e) => `- ${e}`).join("\n") +
        "\n\nThe revision you produced was:\n```html\n" + revised + "\n```\n\n" +
        "Please fix these issues in your next revision."
    }
  }

  return { html, approved }
}
