import type { RedesignView } from "./types"

export const REDESIGN_PATHS = {
  home: "/redesign",
  library: "/redesign/library",
  handoffs: "/redesign/handoffs",
  pipeline: "/redesign/pipeline",
  settings: "/redesign/settings",
} as const satisfies Record<RedesignView, string>

export const REDESIGN_VIEWS = [
  "home",
  "library",
  "handoffs",
  "pipeline",
  "settings",
] as const satisfies readonly RedesignView[]

/** Views that replace the whole window and bring their own chrome. */
const FULL_BLEED_VIEWS: readonly RedesignView[] = ["pipeline", "settings"]

export function activeRedesignView(pathname: string): RedesignView {
  return REDESIGN_VIEWS.find((view) => view !== "home" && pathname.startsWith(REDESIGN_PATHS[view])) ?? "home"
}

export function isFullBleedRedesignView(pathname: string): boolean {
  return FULL_BLEED_VIEWS.includes(activeRedesignView(pathname))
}
