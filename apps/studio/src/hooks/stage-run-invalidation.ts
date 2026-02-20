import {
  getCacheResourcesForNode,
  getCacheResourcesForStageClear,
  getCacheResourcesForStageOutput,
  STAGE_ORDER,
} from "@adt/types"
import type { PipelineCacheResource, StageName } from "@adt/types"

export type QueryKey = ReadonlyArray<unknown>

function getQueryKeysForResource(
  label: string,
  resource: PipelineCacheResource
): QueryKey[] {
  switch (resource) {
    case "books":
      return [["books"]]
    case "book":
      return [["books", label]]
    case "pages":
      return [["books", label, "pages"]]
    case "quizzes":
      return [["books", label, "quizzes"]]
    case "glossary":
      return [["books", label, "glossary"]]
    case "text-catalog":
      return [["books", label, "text-catalog"]]
    case "tts":
      return [["books", label, "tts"]]
    case "step-status":
      return [["books", label, "step-status"]]
    case "debug":
      return [["debug"]]
  }
}

function getQueryKeysForResources(
  label: string,
  resources: readonly PipelineCacheResource[]
): QueryKey[] {
  const out: QueryKey[] = []
  const seen = new Set<string>()
  for (const resource of resources) {
    const keys = getQueryKeysForResource(label, resource)
    for (const key of keys) {
      const hash = JSON.stringify(key)
      if (seen.has(hash)) continue
      seen.add(hash)
      out.push(key)
    }
  }
  return out
}

function isStageName(stage: string): stage is StageName {
  return (STAGE_ORDER as readonly string[]).includes(stage)
}

/** Query keys to refresh after a UI step fully completes. */
export function getInvalidationKeysForUiStep(
  label: string,
  uiStep: string
): QueryKey[] {
  if (!isStageName(uiStep)) {
    return [["books", label, "step-status"]]
  }
  const resources = getCacheResourcesForStageOutput(uiStep)
  return getQueryKeysForResources(label, resources)
}

/** Query keys to clear when a run starts (and downstream data is cleared). */
export function getStartInvalidationKeysForUiStep(
  label: string,
  fromStage: string
): QueryKey[] {
  if (!isStageName(fromStage)) {
    return [["books", label, "step-status"]]
  }
  const resources = getCacheResourcesForStageClear(fromStage)
  return getQueryKeysForResources(label, resources)
}

/** Refresh book metadata card/list as soon as metadata extraction completes. */
export function getMetadataInvalidationKeys(label: string): QueryKey[] {
  const resources = getCacheResourcesForNode("metadata")
  const keys = getQueryKeysForResources(label, resources)
  return keys
}
