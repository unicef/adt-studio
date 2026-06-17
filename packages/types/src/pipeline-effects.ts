import { PIPELINE } from "./pipeline.js"
import type { StageName, StepName } from "./pipeline.js"

export type PipelineNodeName =
  | StepName
  | "text-catalog-translation"
  // Sub-product of the `extract` step — written alongside the main
  // page data, not its own pipeline step.
  | "positioned-text"

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
