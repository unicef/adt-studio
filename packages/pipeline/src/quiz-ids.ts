import { isProtectedContent, stampManualEdits } from "./manual-edits.js"
import { randomUUID } from "node:crypto"
import type { Storage } from "@adt/storage"
import {
  ensureQuizIds,
  assertQuizIdCapacity,
  formatQuizId,
  parseQuizId,
  withResolvedQuizIds,
  QuizIdentityError,
  type Quiz,
  type QuizGenerationOutput,
} from "@adt/types"

/** History survives invalidation and extraction resets. Read leniently: old
 * versions still spent IDs even if their other fields no longer validate. */
export function collectSpentQuizIds(storage: Storage): Set<string> {
  const ids = new Set<string>()
  for (const row of storage.getAllNodeVersions("quiz-generation", "book")) {
    const quizzes = (row.data as { quizzes?: unknown } | null)?.quizzes
    if (!Array.isArray(quizzes)) continue
    quizzes.forEach((quiz, index) => {
      const id = (quiz as { quizId?: unknown } | null)?.quizId
      if (typeof id === "string" && parseQuizId(id) !== null) ids.add(id)
      else if (id == null) ids.add(formatQuizId(index + 1))
    })
  }
  return ids
}

/** Advisory preflight only: saveQuizOutput rechecks in its transaction because
 * another write can consume IDs while a model request is in flight. */
export function assertQuizGenerationCapacity(storage: Storage, requested: number): void {
  assertQuizIdCapacity(collectSpentQuizIds(storage).size, requested)
}

function contentKey(quiz: Quiz): string {
  return JSON.stringify([
    quiz.afterPageId, quiz.pageIds, quiz.question,
    quiz.options.map((option) => [option.text, option.explanation]),
    quiz.answerIndex, quiz.reasoning,
  ])
}

/** Resolve unambiguous ID-less round trips by content, never by their edited
 * positions. Older clients can retry, delete, reorder, or append unchanged
 * entries; ambiguous content replacement must round-trip GET's explicit IDs. */
function reconcileLegacyUpdate(output: QuizGenerationOutput, current: Quiz[]): QuizGenerationOutput {
  // An exact unchanged round trip is unambiguous even when two quizzes have
  // identical content: the complete ordered set still matches the source.
  if (
    output.quizzes.length === current.length &&
    output.quizzes.every((quiz, index) => !quiz.quizId && contentKey(quiz) === contentKey(current[index]))
  ) {
    return { ...output, quizzes: output.quizzes.map((quiz, index) => ({ ...quiz, quizId: current[index].quizId })) }
  }
  const claimed = new Set(output.quizzes.flatMap((q) => q.quizId ? [q.quizId] : []))
  const hasExplicitIds = claimed.size > 0
  let unassigned = false
  const quizzes = output.quizzes.map((quiz) => {
    if (quiz.quizId) return quiz
    const matches = current.filter((prior) => !claimed.has(prior.quizId!) && contentKey(prior) === contentKey(quiz))
    if (matches.length > 1) {
      throw new QuizIdentityError("Ambiguous quiz update. Reload quizzes and include their quizId when saving.")
    }
    if (matches.length === 1) {
      claimed.add(matches[0].quizId!)
      return { ...quiz, quizId: matches[0].quizId }
    }
    unassigned = true
    return quiz
  })
  if (!hasExplicitIds && unassigned && current.some((q) => !claimed.has(q.quizId!))) {
    throw new QuizIdentityError("Cannot identify edited quizzes. Reload quizzes and include their quizId when saving.")
  }
  return { ...output, quizzes }
}

/** All quiz writes share one atomic allocation/persistence boundary.
 * - edit: reconcile compatible legacy requests before allocating additions.
 * - insert: existing quizzes already carry IDs; every missing ID is new.
 * - replace: full generation creates new entities, even when its LLM is cached.
 * No generation or filesystem work is performed while the transaction is held. */
export function saveQuizOutput(
  storage: Storage,
  output: QuizGenerationOutput,
  mode: "edit" | "insert" | "replace",
): { output: QuizGenerationOutput; version: number } {
  return storage.transaction(() => {
    const spent = collectSpentQuizIds(storage)
    let incoming = output
    const currentRow = storage.getLatestNodeData("quiz-generation", "book")
    const currentData = currentRow?.data as QuizGenerationOutput | undefined
    // Invalid AI identities need not become current again to be regenerated.
    // Protected legacy quizzes resolve their positional IDs before filtering.
    const protectedQuizzes = mode === "replace" && currentData ? withResolvedQuizIds({ ...currentData, quizzes: currentData.quizzes.flatMap((quiz, index) =>
      isProtectedContent(quiz) ? [{ ...quiz, quizId: quiz.quizId ?? formatQuizId(index + 1) }] : []
    ) }).quizzes : []
    if (mode === "replace") {
      incoming = { ...output, quizzes: [...protectedQuizzes, ...output.quizzes.map(({ quizId: _id, ...quiz }) => ({ ...quiz, source: "ai" as const }))] }
    } else {
      const row = storage.getLatestNodeData("quiz-generation", "book")
      const current = row ? withResolvedQuizIds(row.data as QuizGenerationOutput).quizzes : []
      const currentIds = new Set(current.map((quiz) => quiz.quizId))
      for (const quiz of output.quizzes) {
        if (quiz.quizId && spent.has(quiz.quizId) && !currentIds.has(quiz.quizId)) {
          throw new QuizIdentityError("A quiz id is no longer current. Reload quizzes or restore its version before saving.")
        }
      }
      if (mode === "edit") incoming = reconcileLegacyUpdate(output, current)
    }
    const stamped = ensureQuizIds(incoming, spent).output
    const priorRow = storage.getLatestNodeData("quiz-generation", "book")
    const prior = mode === "replace" ? protectedQuizzes : priorRow ? withResolvedQuizIds(priorRow.data as QuizGenerationOutput).quizzes : []
    const quizzes = stamped.quizzes.map((quiz, quizIndex) => {
      const old = prior.find((item) => item.quizId === quiz.quizId)
      if (mode === "replace" && old && isProtectedContent(old)) return { ...old, quizIndex }
      const claimed = new Set(quiz.options.flatMap((option) => option.optionId ? [option.optionId] : []))
      const options = quiz.options.map((option, index) => {
        if (mode !== "replace" && option.optionId) {
          if (old && !old.options.some((item) => item.optionId === option.optionId)) throw new QuizIdentityError("Option identity is no longer current. Reload before editing.")
          return option
        }
        const matches = old?.options.filter((item) => !claimed.has(item.optionId!) && item.text === option.text && item.explanation === option.explanation) ?? []
        const optionId = matches.length === 1 ? matches[0].optionId! : old ? `${quiz.quizId}_o_${randomUUID()}` : `${quiz.quizId}_o${index}`
        claimed.add(optionId)
        return { ...option, optionId }
      })
      return { ...quiz, quizIndex, options }
    })
    // Resolve legacy identities/options first; only authored content participates
    // in the comparison. Position-only reorder does not change ownership.
    const authored = mode === "edit" ? stampManualEdits(prior, quizzes, (quiz) => quiz.quizId!, (a, b) => contentKey(a) === contentKey(b)) : quizzes
    if (mode === "replace") {
      const pageOrder = new Map(storage.getPages().map((page, index) => [page.pageId, index]))
      authored.sort((a, b) => (pageOrder.get(a.afterPageId) ?? 0) - (pageOrder.get(b.afterPageId) ?? 0))
    }
    const normalized = withResolvedQuizIds({ ...stamped, quizzes: authored.map((quiz, quizIndex) => ({ ...quiz, quizIndex })) })
    const version = storage.putNodeData("quiz-generation", "book", normalized)
    return { output: normalized, version }
  })
}
