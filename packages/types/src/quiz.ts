import { z } from "zod"

/** Canonical, filename-safe quiz identity. */
export const QuizId = z.string().length(5).regex(/^qz(?!000)\d{3}$/, "Expected a quiz id from qz001 through qz999")

export class QuizIdentityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "QuizIdentityError"
  }
}

export const QuizOption = z.object({
  text: z.string(),
  explanation: z.string(),
})
export type QuizOption = z.infer<typeof QuizOption>

export const Quiz = z.object({
  /**
   * Stable output-page id (`qz001`, …), allocated once and never reused. Names
   * the quiz's HTML file and, through `${quizId}_que` / `${quizId}_o${n}`, its
   * text-catalog entries — and therefore its translations and generated audio.
   *
   * Optional for legacy data and quizzes awaiting allocation. Stored data must
   * pass `withResolvedQuizIds` before consumers use identity.
   */
  quizId: QuizId.optional(),
  /**
   * @deprecated Positional. Kept so older readers keep working, and normalized
   * to the array position on write, but never read for identity — inserting a
   * quiz shifts it, which is exactly what `quizId` exists to avoid.
   */
  quizIndex: z.number().int(),
  /**
   * The page this quiz is generated to follow. Provenance and the default
   * placement for a newly generated quiz — not an authoritative position once
   * an explicit reading order exists.
   */
  afterPageId: z.string(),
  pageIds: z.array(z.string()),
  question: z.string(),
  options: z.array(QuizOption).length(3),
  answerIndex: z.number().int().min(0).max(2),
  reasoning: z.string(),
})
export type Quiz = z.infer<typeof Quiz>

export const QuizGenerationOutput = z.object({
  generatedAt: z.string(),
  language: z.string(),
  pagesPerQuiz: z.number().int(),
  quizzes: z.array(Quiz),
})
export type QuizGenerationOutput = z.infer<typeof QuizGenerationOutput>

// ── Quiz identity ───────────────────────────────────────────────

/** Sequence numbers are zero-padded to 3 digits, so this is the ceiling. */
export const MAX_QUIZ_SEQ = 999

/** Build the canonical quiz id for a sequence number. */
export function formatQuizId(seq: number): string {
  if (seq > MAX_QUIZ_SEQ) throw new QuizIdExhaustedError()
  if (!Number.isInteger(seq) || seq < 1) throw new QuizIdentityError("Invalid quiz sequence number")
  return `qz${String(seq).padStart(3, "0")}`
}

/** Sequence number of a quiz id, or null if `id` isn't one. */
export function parseQuizId(id: string): number | null {
  return QuizId.safeParse(id).success ? Number(id.slice(2)) : null
}

/**
 * Thrown when a book has burned all `MAX_QUIZ_SEQ` sequence numbers.
 *
 * A named error rather than an HTTP exception so this module stays usable from
 * the pipeline; the route layer maps it to a 400. Mirrors
 * `SectionIdExhaustedError`.
 */
export class QuizIdExhaustedError extends Error {
  constructor() {
    super(
      `This book has allocated all ${MAX_QUIZ_SEQ} of its quiz ids. New quizzes cannot be allocated without reusing an existing identity.`
    )
    this.name = "QuizIdExhaustedError"
  }
}

/**
 * The quiz's stable id, falling back to the value every consumer derived before
 * `quizId` existed: `qz${arrayIndex + 1}`. `index` must be the quiz's position
 * in `QuizGenerationOutput.quizzes`.
 *
 * Validate the whole array with `withResolvedQuizIds` before consuming it:
 * a partially stamped array can otherwise give a legacy positional fallback
 * the same ID as an explicit entry.
 */
export function resolveQuizId(quiz: Quiz, index: number): string {
  const id = quiz.quizId ?? formatQuizId(index + 1)
  if (!QuizId.safeParse(id).success) throw new QuizIdentityError(`Invalid quiz id: ${id}`)
  return id
}

/**
 * Every quiz's id filled in from `resolveQuizId`, so callers downstream can
 * treat `quizId` as given. Unlike `ensureQuizIds` this allocates nothing: the
 * result is exactly what the read paths (text catalog, packaging, adt-preview)
 * derive from the same array, which is what makes it safe on a read path.
 *
 * Use it before *mutating* a stored quiz set, so legacy ids get pinned to the
 * positions their catalog entries were written for rather than to the positions
 * they happen to land on after the edit.
 */
export function withResolvedQuizIds(
  output: QuizGenerationOutput
): QuizGenerationOutput {
  const ids = output.quizzes.map(resolveQuizId)
  assertUniqueQuizIds(ids)
  if (output.quizzes.every((q) => q.quizId)) return output
  return {
    ...output,
    quizzes: output.quizzes.map((quiz, index) => ({
      ...quiz,
      quizId: ids[index],
    })),
  }
}

/**
 * Fill in any missing `quizId`s so the rest of the code can treat them as
 * given. Back-compat is the whole point of the allocation order here: a quiz
 * with no id first tries the id today's consumers already derive for its array
 * position, so an existing book's catalog keys — and the translations and audio
 * keyed by them — stay byte-identical. Only when that number is taken does it
 * take a fresh one.
 *
 * `reservedIds` must carry ids used by all stored versions, including the current
 * version, so a delete-then-add cannot resurrect a retired quiz's catalog entries.
 *
 * Positional back-compat only holds if `output.quizzes` is still in its *stored*
 * order. Callers that reorder, insert or delete must run `withResolvedQuizIds`
 * on the stored set first, so legacy ids are pinned before the edit moves
 * anything — otherwise the newcomer inherits the catalog entries, translations
 * and audio of whichever quiz used to sit at its index.
 *
 * `changed` tells the caller whether persisting a new version is worthwhile;
 * readers can ignore it and use the returned value in memory.
 *
 * @throws {QuizIdExhaustedError} when every sequence number is spent.
 */
export function ensureQuizIds(
  output: QuizGenerationOutput,
  reservedIds: Iterable<string> = []
): { output: QuizGenerationOutput; changed: boolean } {
  const explicitIds = output.quizzes.flatMap((quiz) => {
    if (quiz.quizId === undefined) return []
    if (!QuizId.safeParse(quiz.quizId).success) throw new QuizIdentityError(`Invalid quiz id: ${quiz.quizId}`)
    return [quiz.quizId]
  })
  assertUniqueQuizIds(explicitIds)
  const used = new Set<number>()
  for (const id of reservedIds) {
    const seq = parseQuizId(id)
    if (seq !== null) used.add(seq)
  }
  for (const quiz of output.quizzes) {
    const seq = quiz.quizId ? parseQuizId(quiz.quizId) : null
    if (seq !== null) used.add(seq)
  }

  let changed = false
  const quizzes = output.quizzes.map((quiz, index) => {
    if (quiz.quizId) return quiz
    let seq = index + 1
    while (used.has(seq)) seq += 1
    if (seq > MAX_QUIZ_SEQ) {
      // Sparse explicit IDs can leave a lower unused slot. Search it before
      // reporting exhaustion; retired slots remain in `used` forever.
      seq = 1
      while (used.has(seq)) seq += 1
      if (seq > MAX_QUIZ_SEQ) throw new QuizIdExhaustedError()
    }
    used.add(seq)
    changed = true
    return { ...quiz, quizId: formatQuizId(seq) }
  })

  return { output: changed ? { ...output, quizzes } : output, changed }
}

function assertUniqueQuizIds(ids: string[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) throw new QuizIdentityError(`Duplicate quiz id: ${id}`)
    seen.add(id)
  }
}

/** Schema for what the LLM returns (simpler than the stored Quiz type) */
export const quizLLMSchema = z.object({
  reasoning: z.string(),
  question: z.string(),
  options: z.array(
    z.object({
      text: z.string(),
      explanation: z.string(),
    })
  ),
  answer_index: z.number().int(),
})
