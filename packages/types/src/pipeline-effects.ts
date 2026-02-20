import { PIPELINE } from "./pipeline.js"
import type { StageName, StepName } from "./pipeline.js"

export type PipelineNodeName =
  | StepName
  | "storyboard-acceptance"
  | "text-catalog-translation"

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
  | "text-catalog"
  | "tts"
  | "step-status"
  | "debug"

const EXTRA_STAGE_OUTPUT_NODES: Partial<Record<StageName, readonly PipelineNodeName[]>> = {
  "storyboard": ["storyboard-acceptance"],
  "text-and-speech": ["text-catalog-translation"],
}

/** All node_data node names written by each stage. */
export const STAGE_OUTPUT_NODES: Record<StageName, readonly PipelineNodeName[]> = {
  "extract": [],
  "storyboard": [],
  "quizzes": [],
  "captions": [],
  "glossary": [],
  "text-and-speech": [],
  "package": [],
}

const STAGE_DIRECT_DEPENDENTS: Record<StageName, StageName[]> = {
  "extract": [],
  "storyboard": [],
  "quizzes": [],
  "captions": [],
  "glossary": [],
  "text-and-speech": [],
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
  "image-cropping": ["pages"],
  "image-meaningfulness": ["pages"],
  "text-classification": ["pages"],
  "translation": ["pages"],
  "page-sectioning": ["pages"],
  "web-rendering": ["pages"],
  "quiz-generation": ["quizzes"],
  "image-captioning": ["pages"],
  "glossary": ["glossary"],
  "text-catalog": ["text-catalog"],
  "catalog-translation": ["text-catalog"],
  "tts": ["tts"],
  "package-web": [],
  "storyboard-acceptance": ["books", "book"],
  "text-catalog-translation": ["text-catalog"],
}

const CACHE_RESOURCE_ORDER: readonly PipelineCacheResource[] = [
  "books",
  "book",
  "pages",
  "quizzes",
  "glossary",
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
