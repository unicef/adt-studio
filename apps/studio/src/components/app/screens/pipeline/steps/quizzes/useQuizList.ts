import { useCallback, useEffect, useMemo, useState } from "react"
import type { QuizRow } from "./quizRows"

export interface ListedQuiz {
  quiz: QuizRow
  position: number
  removed: boolean
  leaving: boolean
}

export const LEAVE_MS = 300

export function listQuizzes(server: readonly QuizRow[], items: readonly QuizRow[]): ListedQuiz[] {
  const current = new Map(items.map((quiz) => [quiz.quizId, quiz]))
  const known = new Set(server.map((quiz) => quiz.quizId))
  const rows: ListedQuiz[] = server.map((quiz, index) => ({
    quiz: current.get(quiz.quizId) ?? quiz,
    position: index + 1,
    removed: !current.has(quiz.quizId),
    leaving: false,
  }))
  for (const quiz of items) if (!known.has(quiz.quizId)) rows.push({ quiz, position: rows.length + 1, removed: false, leaving: false })
  return rows
}

interface Leaving {
  row: ListedQuiz
  afterKey: string | null
}

function withLeaving(rows: ListedQuiz[], leaving: readonly Leaving[]): ListedQuiz[] {
  if (leaving.length === 0) return rows
  const next = [...rows]
  for (const { row, afterKey } of leaving) {
    const at = afterKey === null ? 0 : next.findIndex((entry) => entry.quiz.quizId === afterKey) + 1
    next.splice(at, 0, { ...row, leaving: true })
  }
  return next
}

function useLeavingRows(rows: ListedQuiz[]): ListedQuiz[] {
  const [previous, setPrevious] = useState(rows)
  const [leaving, setLeaving] = useState<Leaving[]>([])
  if (previous !== rows) {
    setPrevious(rows)
    const kept = new Set(rows.map((row) => row.quiz.quizId))
    const gone: Leaving[] = []
    previous.forEach((row, index) => {
      if (!row.removed || kept.has(row.quiz.quizId)) return
      const anchor = previous.slice(0, index).reverse().find((entry) => kept.has(entry.quiz.quizId))
      gone.push({ row, afterKey: anchor?.quiz.quizId ?? null })
    })
    if (gone.length > 0) setLeaving((current) => [...current.filter((entry) => kept.has(entry.row.quiz.quizId) === false), ...gone])
  }

  useEffect(() => {
    if (leaving.length === 0) return
    const timer = window.setTimeout(() => setLeaving([]), LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [leaving])

  return useMemo(() => withLeaving(rows, leaving), [rows, leaving])
}

export function useQuizList(server: readonly QuizRow[], items: readonly QuizRow[]) {
  const rows = useMemo(() => listQuizzes(server, items), [server, items])
  const listed = useLeavingRows(rows)
  const positions = useMemo(() => new Map(rows.map((row) => [row.quiz.quizId, row.position])), [rows])
  const positionOf = useCallback((quiz: QuizRow) => positions.get(quiz.quizId) ?? 0, [positions])
  const removedKeys = useMemo(() => new Set(rows.filter((row) => row.removed).map((row) => row.quiz.quizId)), [rows])
  const restoreAfter = useCallback(
    (key: string): string | null => {
      const index = rows.findIndex((row) => row.quiz.quizId === key)
      const anchor = rows.slice(0, Math.max(0, index)).reverse().find((row) => !row.removed)
      return anchor?.quiz.quizId ?? null
    },
    [rows],
  )
  return { rows, listed, positionOf, removedKeys, restoreAfter }
}
