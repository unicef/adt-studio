import type { CommentAnchor } from "@/api/client"

/**
 * Comments on a quiz page.
 *
 * A quiz is its own page in the published book — `qz004.html`, whose section id is the quiz id —
 * but in Studio it is data in the Quizzes step, not a Storyboard page. So a comment on one names
 * no `pgNNN_secNNN` section, and everything that reads a page from the id has to ask here first.
 */

/** The quiz a thread is on, as far as Studio can place it. */
export interface ThreadQuiz {
  id: string
  /** Its position among the book's quizzes, 1-based — the number the author sees in Quizzes.
   *  `null` when the quiz is no longer in the book. */
  number: number | null
  /** The page the Quizzes step files it under, for "open it there". */
  pageId: string | null
}

export function isQuizSectionId(sectionId: string): boolean {
  return /^qz\d{3,}$/.test(sectionId)
}

export type QuizPart = { kind: "question" } | { kind: "option"; index: number }

/**
 * Which part of the quiz a comment points at, read from its anchor: the published quiz tags its
 * question `${quizId}_que` and each option `${quizId}_o${n}`. `null` for the quiz as a whole.
 */
export function quizPartOf(anchor: CommentAnchor | null, quizId: string): QuizPart | null {
  if (!anchor) return null
  const dataId = /data-id="([^"]+)"/.exec(anchor.selector)?.[1]
  if (!dataId?.startsWith(`${quizId}_`)) return null
  const rest = dataId.slice(quizId.length + 1)
  if (rest === "que") return { kind: "question" }
  const option = /^o(\d+)/.exec(rest)
  return option ? { kind: "option", index: Number(option[1]) } : null
}
