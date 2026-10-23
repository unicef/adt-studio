import { STAGE_DEPENDENTS, STAGE_BY_NAME, type StageName } from "@adt/types"
import type { DockItem } from "./usePipelineState"

export const STARTED: ReadonlySet<string> = new Set(["done", "running", "queued"])
const BLOCKING = new Set(["running", "queued", "error"])
const DOCK_SLUG_OF_STAGE: Partial<Record<StageName, string>> = { package: "validation" }
const STAGE_OF_DOCK_SLUG: Record<string, StageName> = { validation: "package" }

function dockSlugOf(stage: StageName): string {
  return DOCK_SLUG_OF_STAGE[stage] ?? stage
}

function stageOf(slug: string): StageName | undefined {
  const stage = STAGE_OF_DOCK_SLUG[slug] ?? slug
  return stage in STAGE_BY_NAME ? (stage as StageName) : undefined
}

export function nextDependent(slug: string, dock: readonly DockItem[]): string | null {
  const stage = stageOf(slug)
  if (!stage) return null
  const stateOf = (dockSlug: string) => dock.find((item) => item.slug === dockSlug)?.state
  for (const dependent of STAGE_DEPENDENTS[stage]) {
    const candidate = dockSlugOf(dependent)
    const state = stateOf(candidate)
    if (!state || STARTED.has(state)) continue
    const waiting = STAGE_BY_NAME[dependent].dependsOn.some((upstream) => {
      const upstreamState = stateOf(dockSlugOf(upstream))
      return upstreamState !== undefined && BLOCKING.has(upstreamState)
    })
    if (!waiting) return candidate
  }
  return null
}

