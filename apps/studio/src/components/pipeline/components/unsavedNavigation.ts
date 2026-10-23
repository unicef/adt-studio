import { bookSettingsScope } from "@/components/app/screens/pipeline/book-settings/sections"
import type { FloatingSaveScope } from "./floating-save"

const PIPELINE_ROUTE_PREFIX = "/_app/pipeline/$label"
const PIPELINE_STEP_ROUTE_PREFIX = "/_app/pipeline/$label/$step"
const PIPELINE_SETTINGS_ROUTE_PREFIX = "/_app/pipeline/$label/$step/settings"
const BOOK_SETTINGS_ROUTE_PREFIX = "/_app/pipeline/$label/settings"

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
  step: string | undefined
  tab: string | undefined
}

export function guardLocation(location: NavigationLocation): GuardLocation {
  if (location.routeId.startsWith(PIPELINE_ROUTE_PREFIX)) {
    // The book settings hub keeps the storyboard's settings and the book's own
    // settings side by side. Each group owns the drafts of its sections, so it
    // stands in for a stage: switching group has to warn, switching section
    // inside one does not.
    if (location.routeId.startsWith(BOOK_SETTINGS_ROUTE_PREFIX)) {
      const section = location.params.section
      return {
        screen: `pipeline:${location.params.label ?? ""}`,
        settingsStep: section ? bookSettingsScope(section) : undefined,
        step: undefined,
        tab: section,
      }
    }
    const isSettings = location.routeId.startsWith(PIPELINE_SETTINGS_ROUTE_PREFIX)
    const isStep = !isSettings && location.routeId.startsWith(PIPELINE_STEP_ROUTE_PREFIX)
    return {
      screen: `pipeline:${location.params.label ?? ""}`,
      settingsStep: isSettings ? location.params.step : undefined,
      step: isStep ? location.params.step : undefined,
      tab: isSettings ? location.params.tab : undefined,
    }
  }

  // The classic pipeline keeps the stage in its pathname and the tab in search.
  return {
    screen: location.pathname,
    settingsStep: undefined,
    step: undefined,
    tab: typeof location.search.tab === "string" ? location.search.tab : undefined,
  }
}

export interface UnsavedNavigationInput {
  current: NavigationLocation
  next: NavigationLocation
  hasUnsaved: boolean
  /** Tabs whose edits live only in memory until the tab is left. */
  ephemeralDirtyTabs: Iterable<string>
  dirtyScopes?: Iterable<FloatingSaveScope | undefined>
}

function searchValue(location: NavigationLocation, key: string): string | undefined {
  const value = location.search[key]
  return typeof value === "string" && value ? value : undefined
}

/** Whether a navigation has to stop and ask about unsaved edits first. */
export function shouldBlockNavigation({
  current,
  next,
  hasUnsaved,
  ephemeralDirtyTabs,
  dirtyScopes = [],
}: UnsavedNavigationInput): boolean {
  if (!hasUnsaved) return false

  const from = guardLocation(current)
  const to = guardLocation(next)

  if (from.screen !== to.screen) return true
  if (from.step && to.step !== from.step) return true
  if (from.step) {
    const pageChanges = searchValue(current, "page") !== searchValue(next, "page")
    const languageChanges = searchValue(current, "language") !== searchValue(next, "language")
    for (const scope of dirtyScopes) {
      if (scope?.page && pageChanges) return true
      if (scope?.language && languageChanges) return true
    }
  }
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
