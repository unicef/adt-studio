import { createBookStorage } from "@adt/storage"
import {
  MathSpeechEvaluationResult,
  type MathSpeechEvaluationItem,
} from "@adt/types"

/**
 * Storage for maths speech verdicts.
 *
 * One node per language, versioned like every other entity — a re-run never
 * overwrites the previous verdict, so a reviewer's decisions remain
 * recoverable if a run goes wrong.
 */

const NODE = "math-speech-evaluation"

export interface StoredMathSpeechEvaluation {
  evaluation: MathSpeechEvaluationResult | null
  version: number | null
  currentCatalogVersion: number | null
}

export function getMathSpeechEvaluation(
  label: string,
  booksDir: string,
  language: string,
): StoredMathSpeechEvaluation {
  const storage = createBookStorage(label, booksDir)
  try {
    const row = storage.getLatestNodeData(NODE, language)
    const catalogRow = storage.getLatestNodeData("text-catalog", "book")

    if (!row) {
      return {
        evaluation: null,
        version: null,
        currentCatalogVersion: catalogRow?.version ?? null,
      }
    }

    const parsed = MathSpeechEvaluationResult.safeParse(row.data)
    return {
      // A verdict that no longer parses is treated as absent rather than
      // thrown: a schema change should mean "evaluate again", not a dead page.
      evaluation: parsed.success ? parsed.data : null,
      version: row.version,
      currentCatalogVersion: catalogRow?.version ?? null,
    }
  } finally {
    storage.close()
  }
}

export function saveMathSpeechEvaluation(
  label: string,
  booksDir: string,
  evaluation: MathSpeechEvaluationResult,
): { version: number; evaluation: MathSpeechEvaluationResult } {
  const storage = createBookStorage(label, booksDir)
  try {
    const version = storage.putNodeData(NODE, evaluation.language, evaluation)
    return { version, evaluation }
  } finally {
    storage.close()
  }
}

function updateItem(
  evaluation: MathSpeechEvaluationResult,
  entryId: string,
  update: (item: MathSpeechEvaluationItem) => MathSpeechEvaluationItem,
): MathSpeechEvaluationResult {
  const items = evaluation.items.map((item) =>
    item.entry_id === entryId ? update(item) : item,
  )
  return {
    ...evaluation,
    items,
    summary: {
      ...evaluation.summary,
      accepted_anyway: items.filter((i) => i.accepted_anyway).length,
    },
  }
}

/** The reviewer read the flag and decided the walker's output is fine. */
export function withAcceptedAnyway(
  evaluation: MathSpeechEvaluationResult,
  entryId: string,
): MathSpeechEvaluationResult {
  return updateItem(evaluation, entryId, (item) => ({
    ...item,
    accepted_anyway: true,
    accepted_anyway_at: new Date().toISOString(),
    // Clearing any resolution keeps the two decisions from both applying.
    resolved_text: undefined,
    resolved_at: undefined,
  }))
}

/**
 * The reviewer chose wording to speak instead of the walker's output — the
 * judge's suggestion as offered, or their own text. This is the only path by
 * which a model's rewrite of a mathematical expression reaches a learner.
 */
export function withResolvedText(
  evaluation: MathSpeechEvaluationResult,
  entryId: string,
  resolvedText: string,
): MathSpeechEvaluationResult {
  return updateItem(evaluation, entryId, (item) => ({
    ...item,
    resolved_text: resolvedText,
    resolved_at: new Date().toISOString(),
    accepted_anyway: undefined,
    accepted_anyway_at: undefined,
  }))
}

/** Undo a decision, returning the entry to the review queue. */
export function withClearedDecision(
  evaluation: MathSpeechEvaluationResult,
  entryId: string,
): MathSpeechEvaluationResult {
  return updateItem(evaluation, entryId, (item) => ({
    ...item,
    resolved_text: undefined,
    resolved_at: undefined,
    accepted_anyway: undefined,
    accepted_anyway_at: undefined,
  }))
}

/**
 * Entries still awaiting a decision: flagged, and neither overridden nor
 * resolved. This is what the review queue shows and what blocks a clean run.
 */
export function pendingReviewItems(
  evaluation: MathSpeechEvaluationResult | null,
): MathSpeechEvaluationItem[] {
  if (!evaluation) return []
  return evaluation.items.filter(
    (item) => !item.acceptable && !item.accepted_anyway && !item.resolved_text,
  )
}
