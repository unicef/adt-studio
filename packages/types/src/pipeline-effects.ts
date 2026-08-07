import { PIPELINE, STAGE_ORDER } from "./pipeline.js"
import type { StageName, StepName } from "./pipeline.js"

export type PipelineNodeName =
  | StepName
  | "text-catalog-translation"
  // Sub-product of the `extract` step — written alongside the main
  // page data, not its own pipeline step.
  | "positioned-text"
  // Sub-product of the `storyboard` step for fixed-layout books — the
  // positioned section tree used for fixed-layout rendering and the content
  // pipeline. Kept separate from `page-sectioning` (which always holds the
  // semantic tree) so switching render strategy never destroys sectioning.
  | "fixed-layout-sectioning"

/**
 * Shared, UI-agnostic cache/resource tags used by apps to derive
 * concrete query invalidation keys.
 */
export type PipelineCacheResource =
  | "books"
  | "book"
  | "pages"
  | "quizzes"
  | "glossary"
  | "toc"
  | "text-catalog"
  | "tts"
  | "step-status"
  | "debug"

const EXTRA_STAGE_OUTPUT_NODES: Partial<Record<StageName, readonly PipelineNodeName[]>> = {
  "translate": ["text-catalog-translation"],
  "extract": ["positioned-text"],
  "storyboard": ["fixed-layout-sectioning"],
}

/** All node_data node names written by each stage. */
export const STAGE_OUTPUT_NODES: Record<StageName, readonly PipelineNodeName[]> = {
  "extract": [],
  "sectioning": [],
  "storyboard": [],
  "quizzes": [],
  "captions": [],
  "glossary": [],
  "toc": [],
  "easy-read": [],
  "translate": [],
  "speech": [],
  "package": [],
}

const STAGE_DIRECT_DEPENDENTS: Record<StageName, StageName[]> = {
  "extract": [],
  "sectioning": [],
  "storyboard": [],
  "quizzes": [],
  "captions": [],
  "glossary": [],
  "toc": [],
  "easy-read": [],
  "translate": [],
  "speech": [],
  "package": [],
}

/** Node data invalidated when the book's image set changes. Shared by the API
 * mutation and the Studio warning so the reset behavior and user-facing stage
 * list cannot drift apart. */
export const IMAGE_SET_CHANGE_CLEAR_NODE_TYPES = [
  "image-captioning",
  "text-catalog",
  "easy-read",
  "text-catalog-translation",
  "tts",
  "tts-timestamps",
  "accessibility-assessment",
] as const

/** Pipeline step results invalidated by an image-set change. */
export const IMAGE_SET_CHANGE_CLEAR_STEPS = [
  "image-captioning",
  "text-catalog",
  "easy-read",
  "catalog-translation",
  "image-translation",
  "tts",
  "word-timestamps",
  "package-web",
  "accessibility-assessment",
] as const satisfies readonly StepName[]

/** Ordered stages shown in the confirmation before an image-set change. */
export const IMAGE_SET_CHANGE_CLEAR_STAGES: readonly StageName[] = STAGE_ORDER.filter(
  (stageName) => {
    const stage = PIPELINE.find((candidate) => candidate.name === stageName)
    return stage?.steps.some((step) =>
      IMAGE_SET_CHANGE_CLEAR_STEPS.includes(step.name as (typeof IMAGE_SET_CHANGE_CLEAR_STEPS)[number]),
    )
  },
)

for (const stage of PIPELINE) {
  STAGE_OUTPUT_NODES[stage.name] = [
    ...stage.steps.map((step) => step.name),
    ...(EXTRA_STAGE_OUTPUT_NODES[stage.name] ?? []),
  ]

  STAGE_DIRECT_DEPENDENTS[stage.name] = PIPELINE
    .filter((candidate) => candidate.dependsOn.includes(stage.name))
    .map((candidate) => candidate.name)
}

/** Canonical invalidation/resource tags for each node type. */
const NODE_CACHE_RESOURCES: Record<PipelineNodeName, readonly PipelineCacheResource[]> = {
  "extract": ["books", "book", "pages"],
  "metadata": ["books", "book"],
  "book-summary": ["books", "book"],
  "book-outline": ["book", "pages"],
  "image-filtering": ["pages"],
  "image-segmentation": ["pages"],
  "image-cropping": ["pages"],
  "image-meaningfulness": ["pages"],
  "page-sectioning": ["pages"],
  "translation": ["pages"],
  "web-rendering": ["pages"],
  "quiz-generation": ["quizzes"],
  "image-captioning": ["pages"],
  "glossary": ["glossary"],
  "toc-generation": ["toc"],
  "text-catalog": ["text-catalog"],
  "easy-read": ["text-catalog"],
  "catalog-translation": ["text-catalog"],
  "image-translation": ["pages"],
  "tts": ["tts"],
  "word-timestamps": ["tts"],
  "package-web": [],
  "accessibility-assessment": ["debug"],
  "text-catalog-translation": ["text-catalog"],
  "positioned-text": ["pages"],
  "fixed-layout-sectioning": ["pages"],
}

const CACHE_RESOURCE_ORDER: readonly PipelineCacheResource[] = [
  "books",
  "book",
  "pages",
  "quizzes",
  "glossary",
  "toc",
  "text-catalog",
  "tts",
  "step-status",
  "debug",
]

function orderedUniqueResources(
  resources: Iterable<PipelineCacheResource>
): PipelineCacheResource[] {
  const seen = new Set(resources)
  const ordered: PipelineCacheResource[] = []
  for (const resource of CACHE_RESOURCE_ORDER) {
    if (seen.has(resource)) ordered.push(resource)
  }
  return ordered
}

function collectTransitiveDependents(stage: StageName): StageName[] {
  const out: StageName[] = []
  const queue = [...STAGE_DIRECT_DEPENDENTS[stage]]
  const visited = new Set<StageName>()

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    out.push(current)
    queue.push(...STAGE_DIRECT_DEPENDENTS[current])
  }

  return out
}

/** Stage execution order starting at `stage`, including all transitive dependents. */
export function getStageClearOrder(stage: StageName): StageName[] {
  return [stage, ...collectTransitiveDependents(stage)]
}

/** Every stage that consumes `stage`'s output, transitively — `stage` excluded.
 *  Use when a stage's own output is known to be current but the outputs derived
 *  from it are not. */
export function getStageDependents(stage: StageName): StageName[] {
  return collectTransitiveDependents(stage)
}

/** All node types that should be cleared when starting from `stage`. */
export function getStageClearNodes(stage: StageName): PipelineNodeName[] {
  const seen = new Set<PipelineNodeName>()
  const nodes: PipelineNodeName[] = []

  for (const current of getStageClearOrder(stage)) {
    for (const node of STAGE_OUTPUT_NODES[current]) {
      if (seen.has(node)) continue
      seen.add(node)
      nodes.push(node)
    }
  }

  return nodes
}

/** Stages whose handler merges its own prior output on re-run (e.g. glossary
 * preserves manual, edited, and pruned terms) rather than replacing it. */
const STAGES_PRESERVING_OWN_OUTPUT: readonly StageName[] = ["glossary"]

/** Like getStageClearNodes(fromStage), but keeps a merge-preserving stage's own
 * output when that stage is inside the [fromStage, toStage] run range so its
 * handler can re-merge the prior version. Outside the range it is still cleared. */
export function getStageRerunClearNodes(
  fromStage: StageName,
  toStage: StageName
): PipelineNodeName[] {
  const clearNodes = getStageClearNodes(fromStage)
  const fromIndex = STAGE_ORDER.indexOf(fromStage)
  const toIndex = STAGE_ORDER.indexOf(toStage)

  const preservedNodes = new Set<PipelineNodeName>()
  for (const stage of STAGES_PRESERVING_OWN_OUTPUT) {
    const index = STAGE_ORDER.indexOf(stage)
    if (index >= fromIndex && index <= toIndex) {
      for (const node of STAGE_OUTPUT_NODES[stage]) preservedNodes.add(node)
    }
  }

  if (preservedNodes.size === 0) return clearNodes
  return clearNodes.filter((node) => !preservedNodes.has(node))
}

/** Resource tags that should be refreshed when a node is updated or cleared. */
export function getCacheResourcesForNode(node: PipelineNodeName): PipelineCacheResource[] {
  return [...NODE_CACHE_RESOURCES[node]]
}

export function getCacheResourcesForNodes(
  nodes: readonly PipelineNodeName[]
): PipelineCacheResource[] {
  const resources = new Set<PipelineCacheResource>()
  for (const node of nodes) {
    for (const resource of getCacheResourcesForNode(node)) {
      resources.add(resource)
    }
  }
  return orderedUniqueResources(resources)
}

/** Resources to refresh when a stage fully completes (its own outputs only). */
export function getCacheResourcesForStageOutput(
  stage: StageName
): PipelineCacheResource[] {
  return orderedUniqueResources([
    ...getCacheResourcesForNodes(STAGE_OUTPUT_NODES[stage]),
    "step-status",
  ])
}

/** Resources to refresh when a stage run starts and downstream data is cleared. */
export function getCacheResourcesForStageClear(
  stage: StageName
): PipelineCacheResource[] {
  return orderedUniqueResources([
    ...getCacheResourcesForNodes(getStageClearNodes(stage)),
    "step-status",
  ])
}
