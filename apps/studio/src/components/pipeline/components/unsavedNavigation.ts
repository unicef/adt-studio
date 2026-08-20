const PIPELINE_ROUTE_PREFIX = "/_app/pipeline/$label"
const PIPELINE_SETTINGS_ROUTE_PREFIX = "/_app/pipeline/$label/$step/settings"

export interface NavigationLocation {
  routeId: string
  pathname: string
  params: Record<string, string | undefined>
  search: Record<string, unknown>
}

export interface GuardLocation {
  /**
   * Identity of the screen being left. Every new-UI pipeline screen collapses to
   * the book: they were once one route with the step in search, and the guard
   * has never fired on moving between them.
   */
  screen: string
  /** Stage whose settings are open, when this is a settings screen. */
  settingsStep: string | undefined
  tab: string | undefined
}

export function guardLocation(location: NavigationLocation): GuardLocation {
  if (location.routeId.startsWith(PIPELINE_ROUTE_PREFIX)) {
    const isSettings = location.routeId.startsWith(PIPELINE_SETTINGS_ROUTE_PREFIX)
    return {
      screen: `pipeline:${location.params.label ?? ""}`,
      settingsStep: isSettings ? location.params.step : undefined,
      tab: isSettings ? location.params.tab : undefined,
    }
  }

  // The classic pipeline keeps the stage in its pathname and the tab in search.
  return {
    screen: location.pathname,
    settingsStep: undefined,
    tab: typeof location.search.tab === "string" ? location.search.tab : undefined,
  }
}

export interface UnsavedNavigationInput {
  current: NavigationLocation
  next: NavigationLocation
  hasUnsaved: boolean
  /** Tabs whose edits live only in memory until the tab is left. */
  ephemeralDirtyTabs: Iterable<string>
}

/** Whether a navigation has to stop and ask about unsaved edits first. */
export function shouldBlockNavigation({
  current,
  next,
  hasUnsaved,
  ephemeralDirtyTabs,
}: UnsavedNavigationInput): boolean {
  if (!hasUnsaved) return false

  const from = guardLocation(current)
  const to = guardLocation(next)

  if (from.screen !== to.screen) return true
  // Closing the settings being edited, or jumping to another stage's. Entering
  // settings from elsewhere is not blocked — only leaving them is.
  if (from.settingsStep && to.settingsStep !== from.settingsStep) return true
  // Overview re-runs the stage, so it must never be reached with pending edits.
  if (to.tab === "overview" && from.tab !== "overview") return true
  for (const tab of ephemeralDirtyTabs) {
    if (tab !== to.tab) return true
  }
  return false
}
