import type { RedesignView } from "./types"

export const REDESIGN_PATHS = {
  home: "/redesign",
  library: "/redesign/library",
  handoffs: "/redesign/handoffs",
  settings: "/redesign/settings",
} as const satisfies Record<RedesignView, string>

export const REDESIGN_VIEWS = ["home", "library", "handoffs", "settings"] as const satisfies readonly RedesignView[]

export function activeRedesignView(pathname: string): RedesignView {
  return REDESIGN_VIEWS.find((view) => view !== "home" && pathname.startsWith(REDESIGN_PATHS[view])) ?? "home"
}
