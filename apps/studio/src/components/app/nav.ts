import type { AppView } from "./types"

export const APP_PATHS = {
  home: "/",
  library: "/library",
  handoffs: "/handoffs",
  settings: "/settings",
} as const satisfies Record<AppView, string>

export const APP_VIEWS = ["home", "library", "handoffs", "settings"] as const satisfies readonly AppView[]

export function activeAppView(pathname: string): AppView {
  return APP_VIEWS.find((view) => view !== "home" && pathname.startsWith(APP_PATHS[view])) ?? "home"
}
