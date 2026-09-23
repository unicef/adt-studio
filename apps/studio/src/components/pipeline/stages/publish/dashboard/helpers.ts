import { feedbackDestination } from "../feedback-destination"
import type { DashLink, DashThread } from "./dashboard-data"

export type DashboardTabId = "overview" | "feedback" | "readers"

/** The one attention the hero raises across its bottom edge, most urgent first. */
export type HeroNotice = "down" | "updating" | "edits" | null

export function heroNotice(link: DashLink): HeroNotice {
  if (!link.workerReachable) return "down"
  if (link.isUpdating) return "updating"
  if (link.changesWaiting === true) return "edits"
  return null
}

export function initialOf(name: string): string {
  return [...name][0]?.toUpperCase() ?? "?"
}

/** Where "Open in Storyboard" goes: the newest thread's page, with the comments open on it. */
export function storyboardDestination(bookLabel: string, threads: DashThread[]) {
  const newest = threads[0]
  if (!newest) return { to: "/books/$label/$step" as const, params: { label: bookLabel, step: "storyboard" } }
  return feedbackDestination(bookLabel, newest.pageSectionId, newest.id)
}
