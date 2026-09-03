import { z } from "zod"

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
   * Optional because books written before this field exists don't have one.
   * Always read it through `resolveQuizId` / `ensureQuizIds`, never directly.
   */
  quizId: z.string().optional(),
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
  return `qz${String(seq).padStart(3, "0")}`
}

/** Sequence number of a quiz id, or null if `id` isn't one. */
export function parseQuizId(id: string): number | null {
  const match = /^qz(\d+)$/.exec(id)
  return match ? Number(match[1]) : null
}

/**
 * The quiz's stable id, falling back to the value every consumer derived before
 * `quizId` existed: `qz${arrayIndex + 1}`. `index` must be the quiz's position
 * in `QuizGenerationOutput.quizzes`.
 */
export function resolveQuizId(quiz: Quiz, index: number): string {
  return quiz.quizId ?? formatQuizId(index + 1)
}

/**
 * Fill in any missing `quizId`s so the rest of the code can treat them as
 * given. Back-compat is the whole point of the allocation order here: a quiz
 * with no id first tries the id today's consumers already derive for its array
 * position, so an existing book's catalog keys — and the translations and audio
 * keyed by them — stay byte-identical. Only when that number is taken does it
 * take a fresh one.
 *
 * `reservedIds` should carry ids used by *previous* stored versions so a
 * delete-then-add cannot resurrect a retired quiz's catalog entries.
 *
 * `changed` tells the caller whether persisting a new version is worthwhile;
 * readers can ignore it and use the returned value in memory.
 */
export function ensureQuizIds(
  output: QuizGenerationOutput,
  reservedIds: Iterable<string> = []
): { output: QuizGenerationOutput; changed: boolean } {
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
    used.add(seq)
    changed = true
    return { ...quiz, quizId: formatQuizId(seq) }
  })

  return { output: changed ? { ...output, quizzes } : output, changed }
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
