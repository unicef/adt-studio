import {
  type AppConfig,
  type ContentNodeData,
  type PageSectioningOutput,
  type PageSectioningSection,
  type TypeDef,
  DEFAULT_LLM_MAX_RETRIES,
  buildPageSectioningLLMSchema,
  buildPageSectioningRefinementLLMSchema,
} from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"

// ── Types ───────────────────────────────────────────────────────

export interface PageSectioningConfig {
  structureTypes: TypeDef[]
  roleTypes: TypeDef[]
  sectionTypes: TypeDef[]
  prunedRoleTypes: string[]
  prunedSectionTypes: string[]
  disabledSectionTypes: string[]
  promptName: string
  refinementPromptName: string
  modelId: string
  maxRetries: number
  maxRefinements: number
  mode: "page" | "dynamic"
}

export interface PageSectioningInput {
  pageId: string
  pageNumber: number
  text: string
  imageBase64: string
  /** All images available to place in the tree. Callers filter pruned images out. */
  availableImages: Array<{ imageId: string; imageBase64: string }>
}

// ── LLM-facing shape (snake_case matching the prompt + schema) ──

interface LLMNode {
  structure?: string | null
  role?: string | null
  text?: string | null
  image_id?: string | null
  children?: LLMNode[] | null
}

interface LLMSection {
  section_type: string
  background_color: string
  text_color: string
  page_number: number | null
  nodes: LLMNode[]
}

interface LLMStructuringResult {
  reasoning: string
  sections: LLMSection[]
}

interface LLMRefinementResult {
  approved: boolean
  reasoning: string
  nodes_and_sections: LLMStructuringResult | null
}

// ── Entry point ─────────────────────────────────────────────────

/**
 * Structure and section a page in a single LLM call, with up to
 * `maxRefinements` self-review passes. Pure function — no side effects.
 * The caller handles concurrency, storage writes, and progress.
 */
export async function sectionPage(
  input: PageSectioningInput,
  config: PageSectioningConfig,
  llmModel: LLMModel
): Promise<PageSectioningOutput> {
  if (config.structureTypes.length === 0) {
    throw new Error("No structure types configured")
  }
  if (config.roleTypes.length === 0) {
    throw new Error("No role types configured")
  }
  if (config.sectionTypes.length === 0) {
    throw new Error("No section types configured")
  }

  const validatorContext: ValidatorContext = {
    structureKeys: new Set(config.structureTypes.map((t) => t.key)),
    roleKeys: new Set(config.roleTypes.map((t) => t.key)),
    sectionTypeKeys: new Set(config.sectionTypes.map((t) => t.key)),
    availableImageIds: new Set(input.availableImages.map((i) => i.imageId)),
  }

  // Initial generation (with built-in validation retry).
  const initial = await generateInitial(input, config, validatorContext, llmModel)
  let candidate = initial
  applyAutoRepairs(candidate)

  // Refinement loop — up to maxRefinements reviewer passes.
  const priorNotes: string[] = []
  for (let iteration = 1; iteration <= config.maxRefinements; iteration++) {
    const review = await generateReview(
      input,
      config,
      candidate,
      iteration,
      priorNotes,
      llmModel
    )
    if (review.approved) break

    // The reviewer proposed a replacement. Validate it before adopting.
    if (review.nodes_and_sections) {
      applyAutoRepairs(review.nodes_and_sections)
      const err = runValidator(review.nodes_and_sections, validatorContext)
      if (err.valid) {
        candidate = review.nodes_and_sections
      }
    }
    if (review.reasoning) priorNotes.push(review.reasoning)
  }

  return finalizePageSectioning(candidate, input, config)
}

async function generateInitial(
  input: PageSectioningInput,
  config: PageSectioningConfig,
  validatorContext: ValidatorContext,
  llmModel: LLMModel
): Promise<LLMStructuringResult> {
  const result = await llmModel.generateObject<LLMStructuringResult>({
    schema: buildPageSectioningLLMSchema(),
    mode: "json",
    prompt: config.promptName,
    context: {
      page: {
        pageNumber: input.pageNumber,
        text: input.text,
        imageBase64: input.imageBase64,
      },
      images: input.availableImages.map((img) => ({
        image_id: img.imageId,
        imageBase64: img.imageBase64,
      })),
      structure_types: config.structureTypes,
      role_types: config.roleTypes,
      section_types: config.sectionTypes,
      mode: config.mode,
    },
    validate: (raw) => {
      applyAutoRepairs(raw as LLMStructuringResult | null)
      return runValidator(raw, validatorContext)
    },
    maxRetries: config.maxRetries,
    maxTokens: 16384,
    log: {
      taskType: "page-sectioning",
      pageId: input.pageId,
      promptName: config.promptName,
    },
  })
  return result.object
}

async function generateReview(
  input: PageSectioningInput,
  config: PageSectioningConfig,
  candidate: LLMStructuringResult,
  iteration: number,
  priorNotes: string[],
  llmModel: LLMModel
): Promise<LLMRefinementResult> {
  const result = await llmModel.generateObject<LLMRefinementResult>({
    schema: buildPageSectioningRefinementLLMSchema(),
    mode: "json",
    prompt: config.refinementPromptName,
    context: {
      page: {
        pageNumber: input.pageNumber,
        text: input.text,
        imageBase64: input.imageBase64,
      },
      images: input.availableImages.map((img) => ({
        image_id: img.imageId,
        imageBase64: img.imageBase64,
      })),
      structure_types: config.structureTypes,
      role_types: config.roleTypes,
      section_types: config.sectionTypes,
      mode: config.mode,
      max_refinements: config.maxRefinements,
      iteration,
      prior_notes: priorNotes,
      candidate: {
        reasoning: candidate.reasoning,
        sections_json: JSON.stringify(candidate.sections, null, 2),
      },
    },
    maxRetries: config.maxRetries,
    maxTokens: 16384,
    log: {
      taskType: "page-sectioning-refinement",
      pageId: input.pageId,
      promptName: config.refinementPromptName,
    },
  })
  return result.object
}

// ── Auto-repair ─────────────────────────────────────────────────

/**
 * Mutate an LLM structuring result in place to fix mechanically-fixable shape
 * issues that the validator would otherwise reject. Runs before validation so
 * the LLM doesn't burn retries on cheap repairs. Conservative — only the
 * unambiguous transformations listed; never invents missing content.
 *
 * Repairs:
 *  1. `image_group` with only the image as a child → unwrap to a bare
 *     `role: "image"` leaf.
 *  2. `image_group` with the image not first (and exactly one image child) →
 *     reorder so the image is the first child.
 *  3. Container that carries both `text` and `children` → move `text` into a
 *     synthetic leading `role: "text"` leaf.
 *  4. A leaf whose text is a row of single-letter tokens separated by spaces
 *     (crossword/letter-grid pattern) → split into one leaf per letter.
 */
export function applyAutoRepairs(raw: LLMStructuringResult | null | undefined): void {
  if (!raw || !Array.isArray(raw.sections)) return
  for (const section of raw.sections) {
    if (Array.isArray(section.nodes)) {
      section.nodes = repairChildren(section.nodes)
    }
  }
}

const SINGLE_LETTER_ROW = /^[A-Za-zÀ-ÿ](\s+[A-Za-zÀ-ÿ])+$/

// Canonicalize structure values the model reliably invents but that aren't in
// the allowed `structure_types`. The model frequently emits "boxed_text" for a
// bordered callout/box; "panel" (generic bordered/boxed layout) is the closest
// valid container. Mapping here (in the pre-validation repair pass) makes the
// value valid AND flows into the stored tree, avoiding a wasted retry.
const STRUCTURE_ALIASES: Record<string, string> = {
  boxed_text: "panel",
}

function repairChildren(children: LLMNode[]): LLMNode[] {
  const out: LLMNode[] = []
  for (const original of children) {
    if (!original || typeof original !== "object") {
      out.push(original)
      continue
    }
    let child = original

    // Recurse first so deeper repairs propagate up.
    if (Array.isArray(child.children)) {
      child.children = repairChildren(child.children)
    }

    // Canonicalize known invented structure synonyms (e.g. "boxed_text" → "panel")
    // so they pass validation instead of triggering a retry.
    if (
      typeof child.structure === "string" &&
      STRUCTURE_ALIASES[child.structure] !== undefined
    ) {
      child.structure = STRUCTURE_ALIASES[child.structure]
    }

    // Repair (3) — run before image_group repairs so reordering can still
    // place the image first if a text leaf gets prepended here.
    const isContainer =
      typeof child.structure === "string" && child.structure.length > 0
    if (
      isContainer &&
      typeof child.text === "string" &&
      child.text.length > 0 &&
      Array.isArray(child.children) &&
      child.children.length > 0
    ) {
      const textLeaf: LLMNode = { role: "text", text: child.text }
      child.children = [textLeaf, ...child.children]
      child.text = null
    }

    // Repair (1) + (2): image_group child arrangement.
    if (
      child.structure === "image_group" &&
      Array.isArray(child.children) &&
      child.children.length > 0
    ) {
      const imageChildren = child.children.filter(
        (c): c is LLMNode => !!c && c.role === "image"
      )
      if (child.children.length === 1 && imageChildren.length === 1) {
        // Unwrap: lone image inside image_group → bare image leaf.
        out.push(imageChildren[0])
        continue
      }
      if (
        imageChildren.length === 1 &&
        child.children[0]?.role !== "image"
      ) {
        const image = imageChildren[0]
        const rest = child.children.filter((c) => c !== image)
        child.children = [image, ...rest]
      }
    }

    // Repair (4): split single-letter-row leaves into one leaf per letter.
    const isLeaf = typeof child.role === "string" && child.role.length > 0
    if (
      isLeaf &&
      typeof child.text === "string" &&
      SINGLE_LETTER_ROW.test(child.text.trim())
    ) {
      const letters = child.text.trim().split(/\s+/)
      for (const letter of letters) {
        out.push({ ...child, text: letter })
      }
      continue
    }

    out.push(child)
  }
  return out
}

// ── Validator ───────────────────────────────────────────────────

interface ValidatorContext {
  structureKeys: Set<string>
  roleKeys: Set<string>
  sectionTypeKeys: Set<string>
  availableImageIds: Set<string>
}

/**
 * Runtime validator for the LLM-shape tree. Enforces every invariant
 * the Zod schema cannot: container vs leaf exclusivity, empty-container
 * rules, image uniqueness, enum validity.
 */
export function runValidator(
  raw: unknown,
  ctx: ValidatorContext
): ValidationResult {
  const errors: string[] = []
  const result = raw as LLMStructuringResult | null
  if (!result || !Array.isArray(result.sections)) {
    return { valid: false, errors: ["Response is missing a `sections` array."] }
  }

  const usedImageIds = new Set<string>()
  for (let sIdx = 0; sIdx < result.sections.length; sIdx++) {
    const section = result.sections[sIdx]
    const path = `sections[${sIdx}]`

    if (!ctx.sectionTypeKeys.has(section.section_type)) {
      errors.push(
        `${path}: invalid section_type "${section.section_type}". ` +
          `Must be one of: ${[...ctx.sectionTypeKeys].join(", ")}`
      )
    }

    if (!Array.isArray(section.nodes)) {
      errors.push(`${path}.nodes: expected an array of top-level nodes`)
      continue
    }

    for (let nIdx = 0; nIdx < section.nodes.length; nIdx++) {
      validateNode(section.nodes[nIdx], `${path}.nodes[${nIdx}]`, ctx, usedImageIds, errors)
    }
  }

  // Available images may be omitted from the tree (e.g. when not visible or
  // not relevant to the page content). Any image placed in the tree must be
  // one of the available ones, and each placed image must appear exactly
  // once — both enforced in validateNode.

  return { valid: errors.length === 0, errors }
}

function validateNode(
  node: LLMNode | undefined | null,
  path: string,
  ctx: ValidatorContext,
  usedImageIds: Set<string>,
  errors: string[]
): void {
  if (!node || typeof node !== "object") {
    errors.push(`${path}: expected a node object`)
    return
  }

  const hasStructure =
    typeof node.structure === "string" && node.structure.length > 0
  const hasRole = typeof node.role === "string" && node.role.length > 0
  const hasText = typeof node.text === "string" && node.text.length > 0
  const hasImageId =
    typeof node.image_id === "string" && node.image_id.length > 0
  const children = Array.isArray(node.children) ? node.children : null
  const hasChildren = children !== null && children.length > 0

  if (hasStructure && hasRole) {
    errors.push(
      `${path}: a node cannot set both "structure" and "role". Use a container OR a leaf.`
    )
  }
  if (!hasStructure && !hasRole) {
    errors.push(
      `${path}: every node must have either "structure" (container) or "role" (leaf).`
    )
    return
  }

  if (hasStructure) {
    // Container node.
    if (!ctx.structureKeys.has(node.structure!)) {
      errors.push(
        `${path}.structure: invalid value "${node.structure}". ` +
          `Must be one of: ${[...ctx.structureKeys].join(", ")}`
      )
    }

    if (hasText) {
      errors.push(
        `${path}: a container node must not carry "text". Move the text into a child leaf.`
      )
    }

    if (hasImageId) {
      errors.push(
        `${path}: "image_id" is only valid on role:"image" leaves, not on containers.`
      )
    }

    const allowsEmpty = node.structure === "table_cell"
    if (!hasChildren && !allowsEmpty) {
      errors.push(
        `${path}: container "${node.structure}" must have children. ` +
          `Only "table_cell" may be empty.`
      )
    }

    if (node.structure === "image_group") {
      const firstChild = children && children.length > 0 ? children[0] : null
      const firstIsImage = firstChild && firstChild.role === "image"
      if (!firstIsImage) {
        errors.push(
          `${path}: image_group's first child must be a leaf with role "image".`
        )
      }
      if (children && children.length < 2) {
        errors.push(
          `${path}: image_group must contain the image leaf plus at least one associated content leaf (caption/label/overlay). A standalone image with no associated content should be emitted as a bare \`role: "image"\` leaf, not wrapped in image_group.`
        )
      }
    }

    if (children) {
      for (let cIdx = 0; cIdx < children.length; cIdx++) {
        validateNode(children[cIdx], `${path}.children[${cIdx}]`, ctx, usedImageIds, errors)
      }
    }
    return
  }

  // Leaf node.
  if (!ctx.roleKeys.has(node.role!)) {
    errors.push(
      `${path}.role: invalid value "${node.role}". ` +
        `Must be one of: ${[...ctx.roleKeys].join(", ")}`
    )
  }

  if (node.role === "image") {
    if (hasText) {
      errors.push(`${path}: image leaves must not carry "text".`)
    }
    if (!hasImageId) {
      errors.push(`${path}: image leaf must carry "image_id".`)
    } else {
      if (!ctx.availableImageIds.has(node.image_id!)) {
        errors.push(
          `${path}.image_id: "${node.image_id}" is not one of the available image IDs (${[...ctx.availableImageIds].join(", ") || "none"}).`
        )
      }
      if (usedImageIds.has(node.image_id!)) {
        errors.push(
          `${path}.image_id: image "${node.image_id}" is already placed elsewhere. Every image must appear exactly once.`
        )
      }
      usedImageIds.add(node.image_id!)
    }
  } else {
    if (!hasText) {
      errors.push(`${path}: leaf node with role "${node.role}" must have "text".`)
    }
    if (hasImageId) {
      errors.push(
        `${path}: "image_id" is only valid on role:"image" leaves.`
      )
    }
  }

  if (hasChildren) {
    errors.push(
      `${path}: a leaf node must not have "children". Use a container (structure) instead.`
    )
  }
}

// ── Finalization ────────────────────────────────────────────────

/**
 * Convert an LLM-shape result into the final PageSectioningOutput,
 * assigning nodeId, sectionId, and isPruned flags.
 */
export function finalizePageSectioning(
  raw: LLMStructuringResult,
  input: PageSectioningInput,
  config: PageSectioningConfig
): PageSectioningOutput {
  const prunedRoles = new Set(config.prunedRoleTypes)
  const prunedSectionTypes = new Set(config.prunedSectionTypes)
  const counter = { n: 0 }

  const sections: PageSectioningSection[] = raw.sections.map((section, sIdx) => {
    const sectionId = `${input.pageId}_sec${String(sIdx + 1).padStart(3, "0")}`
    const nodes = section.nodes.map((node) =>
      toContentNode(node, input.pageId, counter, prunedRoles)
    )
    return {
      sectionId,
      sectionType: section.section_type,
      backgroundColor: section.background_color,
      textColor: section.text_color,
      pageNumber: section.page_number,
      isPruned: prunedSectionTypes.has(section.section_type),
      nodes,
    }
  })

  return {
    reasoning: raw.reasoning,
    sections,
  }
}

function toContentNode(
  node: LLMNode,
  pageId: string,
  counter: { n: number },
  prunedRoles: Set<string>
): ContentNodeData {
  const hasStructure =
    typeof node.structure === "string" && node.structure.length > 0

  if (hasStructure) {
    counter.n += 1
    const nodeId = `${pageId}_n${String(counter.n).padStart(4, "0")}`
    const out: ContentNodeData = {
      nodeId,
      isPruned: false,
      structure: node.structure!,
    }
    const children = Array.isArray(node.children) ? node.children : null
    if (children && children.length > 0) {
      out.children = children.map((c) =>
        toContentNode(c, pageId, counter, prunedRoles)
      )
    }
    return out
  }

  const role = typeof node.role === "string" ? node.role : ""

  // Image leaves carry image_id from the LLM — use it as the nodeId so the
  // leaf's data-id equals the image file's id.
  if (role === "image" && typeof node.image_id === "string" && node.image_id.length > 0) {
    return {
      nodeId: node.image_id,
      isPruned: prunedRoles.has(role),
      role,
    }
  }

  counter.n += 1
  const nodeId = `${pageId}_n${String(counter.n).padStart(4, "0")}`
  return {
    nodeId,
    isPruned: prunedRoles.has(role),
    role,
    text: typeof node.text === "string" ? node.text : "",
  }
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Walk the finalized tree and concatenate all non-pruned leaf text
 * in reading order. Used by book-summary to turn the tree back into
 * a page-level text representation.
 */
export function flattenTreeToText(output: PageSectioningOutput): string {
  const parts: string[] = []
  for (const section of output.sections) {
    if (section.isPruned) continue
    for (const node of section.nodes) {
      collectNodeText(node, parts)
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

function collectNodeText(node: ContentNodeData, out: string[]): void {
  if (node.isPruned) return
  if (node.text && node.text.length > 0) {
    out.push(node.text)
  }
  if (node.children) {
    for (const child of node.children) {
      collectNodeText(child, out)
    }
  }
}

/**
 * Map each leaf's text across a finalized output in reading order.
 * The callback receives the current text; the returned string replaces it.
 * Preserves all other node fields (nodeId, sectionId, structure, role,
 * isPruned, children). Image leaves (role="image") have no text and are
 * skipped. Used by translation.
 */
export function mapLeafTexts(
  output: PageSectioningOutput,
  mapText: (text: string, index: number) => string
): PageSectioningOutput {
  const counter = { n: 0 }
  return {
    reasoning: output.reasoning,
    sections: output.sections.map((section) => ({
      ...section,
      nodes: section.nodes.map((node) => mapNode(node, counter, mapText)),
    })),
  }
}

function mapNode(
  node: ContentNodeData,
  counter: { n: number },
  mapText: (text: string, index: number) => string
): ContentNodeData {
  const out: ContentNodeData = { ...node }
  if (typeof node.text === "string") {
    out.text = mapText(node.text, counter.n)
    counter.n += 1
  }
  if (node.children) {
    out.children = node.children.map((c) => mapNode(c, counter, mapText))
  }
  return out
}

/**
 * Count leaves with text across the output, in the same reading order
 * as mapLeafTexts walks.
 */
export function countLeafTexts(output: PageSectioningOutput): number {
  let n = 0
  for (const section of output.sections) {
    for (const node of section.nodes) {
      n += countNode(node)
    }
  }
  return n
}

function countNode(node: ContentNodeData): number {
  let n = 0
  if (typeof node.text === "string") n += 1
  if (node.children) {
    for (const c of node.children) n += countNode(c)
  }
  return n
}

// ── Config ──────────────────────────────────────────────────────

export function buildPageSectioningConfig(
  appConfig: AppConfig
): PageSectioningConfig {
  const structureTypes: TypeDef[] = Object.entries(appConfig.structure_types).map(
    ([key, description]) => ({ key, description })
  )
  const roleTypes: TypeDef[] = Object.entries(appConfig.role_types).map(
    ([key, description]) => ({ key, description })
  )
  const disabledSet = new Set(appConfig.disabled_section_types ?? [])
  // `generate_activities: false` disables every activity section type by the
  // `activity_` prefix convention (the same rule web-rendering uses). This is
  // the single source of truth for the activities on/off choice, so it can't
  // drift from a hand-maintained list (e.g. missing `activity_other`).
  const activitiesOff = appConfig.generate_activities === false
  const sectionTypes: TypeDef[] = Object.entries(appConfig.section_types ?? {})
    .filter(([key]) => !disabledSet.has(key) && !(activitiesOff && key.startsWith("activity_")))
    .map(([key, description]) => ({ key, description }))

  return {
    structureTypes,
    roleTypes,
    sectionTypes,
    prunedRoleTypes: appConfig.pruned_role_types ?? [],
    prunedSectionTypes: appConfig.pruned_section_types ?? [],
    disabledSectionTypes: [...disabledSet],
    promptName: appConfig.page_sectioning?.prompt ?? "page_sectioning",
    refinementPromptName: "page_sectioning_refinement",
    modelId: appConfig.page_sectioning?.model ?? "openai:gpt-5.4",
    maxRetries:
      appConfig.page_sectioning?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    maxRefinements: appConfig.page_sectioning?.max_refinements ?? 0,
    mode: appConfig.page_sectioning?.mode ?? "dynamic",
  }
}