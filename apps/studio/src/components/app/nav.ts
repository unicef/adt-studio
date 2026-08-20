import type { AppView } from "./types"

export const APP_PATHS = {
  home: "/",
  library: "/library",
  handoffs: "/handoffs",
  pipeline: "/pipeline",
  settings: "/settings",
} as const satisfies Record<AppView, string>

export const APP_VIEWS = ["home", "library", "handoffs", "pipeline", "settings"] as const satisfies readonly AppView[]

/** Views that replace the whole window and bring their own chrome. */
const FULL_BLEED_VIEWS: readonly AppView[] = ["pipeline", "settings"]

export function activeAppView(pathname: string): AppView {
  return APP_VIEWS.find((view) => view !== "home" && pathname.startsWith(APP_PATHS[view])) ?? "home"
}

export function isFullBleedAppView(pathname: string): boolean {
  return FULL_BLEED_VIEWS.includes(activeAppView(pathname))
}
