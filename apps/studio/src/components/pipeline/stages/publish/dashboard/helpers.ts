import { feedbackDestination, type FeedbackDestination } from "../feedback-destination"
import type { DashLink, DashThread } from "./dashboard-data"

export type DashboardTabId = "overview" | "feedback" | "readers"

/** The one attention the hero raises across its bottom edge, most urgent first. */
export type HeroNotice = "rejected" | "down" | "updating" | "edits" | null

export function heroNotice(link: DashLink): HeroNotice {
  if (link.workerRejected) return "rejected"
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
  return threadDestination(bookLabel, newest)
}

/** Where a thread's "open it" goes: its section in the Storyboard, or its quiz's page in Quizzes. */
export function threadDestination(bookLabel: string, thread: DashThread): FeedbackDestination {
  if (!thread.quiz) return feedbackDestination(bookLabel, thread.pageSectionId, thread.id)
  if (thread.quiz.pageId === null) return { to: "/books/$label/$step", params: { label: bookLabel, step: "quizzes" } }
  return { to: "/books/$label/$step/$pageId", params: { label: bookLabel, step: "quizzes", pageId: thread.quiz.pageId } }
}
