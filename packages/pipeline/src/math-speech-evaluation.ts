import crypto from "node:crypto"
import {
  type MathSpeechEvaluationItem,
  type MathSpeechEvaluationResult,
  type MathSpeechEvaluationRunEntry,
  type ResolvedMathSpeechEvaluationConfig,
  MathSpeechEvaluationIssueType,
  MathSpeechEvaluationSeverity,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"
import { z } from "zod"
import { latexToSpeech } from "./math-speech.js"

/**
 * Second opinion on the spoken form of maths.
 *
 * `latexToSpeech` is deterministic but symbol-only, so constructs whose spoken
 * form needs words come out as notation a voice cannot read. This module asks
 * a judge whether the walker's output states the same mathematics, and keeps
 * the walker's output either way — the judge's version is a suggestion for a
 * human, never applied on its own. An unreviewed model edit to a child's
 * arithmetic is the failure this flow exists to prevent.
 */

/** Notation the walker could not render in a form a voice can speak. Each of
 *  these is a construct that needs words rather than symbols. */
const CARET_LEFTOVER = /\^[^\s²³⁰¹⁴-⁹ⁿⁱ⁺⁻]/
const UNDERSCORE_LEFTOVER = /_/
const RESIDUAL_LATEX = /\\[a-zA-Z]+/

/**
 * Whether the walker's own output shows it could not express the expression.
 *
 * This is the escalation gate: it keeps the judge off the ~99% of entries the
 * walker handles cleanly, so cost tracks difficulty rather than book size.
 */
export function needsMathSpeechReview(walkerText: string): boolean {
  if (RESIDUAL_LATEX.test(walkerText)) return true
  if (CARET_LEFTOVER.test(walkerText)) return true
  if (UNDERSCORE_LEFTOVER.test(walkerText)) return true
  const open = (walkerText.match(/[([{]/g) ?? []).length
  const close = (walkerText.match(/[)\]}]/g) ?? []).length
  return open !== close
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16)
}

export interface MathSpeechCatalogEntry {
  id: string
  text: string
  pageId?: string
}

/**
 * Convert a text catalog into the entries worth judging.
 *
 * Only entries the walker actually changed are candidates — an entry it left
 * alone contains no maths. `evaluateAll` widens the selection from "the walker
 * asked for help" to "everything it converted", which finds weaknesses we have
 * not anticipated at the cost of a call per entry.
 */
export function collectMathSpeechEntries(
  entries: MathSpeechCatalogEntry[],
  options: { evaluateAll?: boolean } = {},
): { candidates: MathSpeechEvaluationRunEntry[]; convertedCount: number } {
  const candidates: MathSpeechEvaluationRunEntry[] = []
  let convertedCount = 0

  for (const entry of entries) {
    const walkerText = latexToSpeech(entry.text)
    if (walkerText === entry.text) continue
    convertedCount++

    if (!options.evaluateAll && !needsMathSpeechReview(walkerText)) continue

    candidates.push({
      entry_id: entry.id,
      ...(entry.pageId ? { page_id: entry.pageId } : {}),
      latex: entry.text,
      walker_text: walkerText,
      latex_hash: hashText(entry.text),
      walker_hash: hashText(walkerText),
    })
  }

  return { candidates, convertedCount }
}

const judgeSchema = z.object({
  reasoning: z.string(),
  results: z.array(
    z.object({
      entry_id: z.string(),
      acceptable: z.boolean(),
      rationale: z.string(),
      issue_type: MathSpeechEvaluationIssueType.optional(),
      severity: MathSpeechEvaluationSeverity.optional(),
      suggested_text: z.string().optional(),
    }),
  ),
})

export interface EvaluateMathSpeechOptions {
  entries: MathSpeechEvaluationRunEntry[]
  config: ResolvedMathSpeechEvaluationConfig
  language: string
  catalogVersion: number
  evalConfigHash: string
  bookLanguage?: string
  promptName?: string
  /** Entries the walker converted but that were never sent to the judge. */
  notEvaluated?: number
  signal?: AbortSignal
}

/**
 * Ask the judge about each candidate and assemble the stored verdict.
 *
 * An entry the judge does not return a result for is recorded as acceptable
 * with a stated reason, rather than silently dropped: a missing verdict must
 * not read as a passing one, and must not remove the entry from the record.
 */
export async function evaluateMathSpeech(
  llmModel: LLMModel,
  options: EvaluateMathSpeechOptions,
): Promise<MathSpeechEvaluationResult> {
  const { entries, config, language, catalogVersion, evalConfigHash } = options
  const promptName = options.promptName ?? "math_speech_evaluation"

  const result = await llmModel.generateObject<z.infer<typeof judgeSchema>>({
    schema: judgeSchema,
    prompt: promptName,
    context: {
      judge_instructions: config.judge_instructions,
      additional_guidance: config.additional_guidance ?? "",
      generate_suggestions: config.generate_suggestions,
      issue_types: config.issue_types.join(", "),
      book_language: options.bookLanguage ?? "",
      entries: entries.map((e) => ({
        entry_id: e.entry_id,
        latex: e.latex,
        walker_text: e.walker_text,
      })),
    },
    maxRetries: config.max_retries,
    temperature: config.temperature,
    signal: options.signal,
    log: {
      taskType: "math-speech-evaluation",
      promptName,
    },
  })

  const byId = new Map(result.object.results.map((r) => [r.entry_id, r]))

  const items: MathSpeechEvaluationItem[] = entries.map((entry) => {
    const verdict = byId.get(entry.entry_id)
    if (!verdict) {
      return {
        entry_id: entry.entry_id,
        ...(entry.page_id ? { page_id: entry.page_id } : {}),
        latex: entry.latex,
        walker_text: entry.walker_text,
        acceptable: true,
        rationale: "The judge returned no verdict for this entry.",
        flagged_by: "walker-low-confidence" as const,
        ...(entry.latex_hash ? { latex_hash: entry.latex_hash } : {}),
        ...(entry.walker_hash ? { walker_hash: entry.walker_hash } : {}),
      }
    }

    return {
      entry_id: entry.entry_id,
      ...(entry.page_id ? { page_id: entry.page_id } : {}),
      latex: entry.latex,
      walker_text: entry.walker_text,
      acceptable: verdict.acceptable,
      rationale: verdict.rationale.trim() || "No rationale supplied.",
      ...(verdict.issue_type && !verdict.acceptable
        ? { issue_type: verdict.issue_type }
        : {}),
      ...(verdict.severity && !verdict.acceptable ? { severity: verdict.severity } : {}),
      // A suggestion on an acceptable entry has nothing to correct, so it is
      // dropped rather than offered to a reviewer as a needless edit.
      ...(config.generate_suggestions && !verdict.acceptable && verdict.suggested_text?.trim()
        ? { suggested_text: verdict.suggested_text.trim() }
        : {}),
      flagged_by: "walker-low-confidence" as const,
      ...(entry.latex_hash ? { latex_hash: entry.latex_hash } : {}),
      ...(entry.walker_hash ? { walker_hash: entry.walker_hash } : {}),
    }
  })

  const unacceptable = items.filter((i) => !i.acceptable).length

  return {
    generated_at: new Date().toISOString(),
    provider: "adt-llm",
    language,
    catalog_version: catalogVersion,
    eval_config_hash: evalConfigHash,
    judge: {
      model: config.judge_model,
      instructions: config.judge_instructions,
      additional_guidance: config.additional_guidance,
      max_retries: config.max_retries,
      temperature: config.temperature,
      severity_threshold: config.severity_threshold,
      issue_types: config.issue_types,
      generate_suggestions: config.generate_suggestions,
      evaluate_all_entries: config.evaluate_all_entries,
    },
    summary: {
      total: items.length,
      acceptable: items.length - unacceptable,
      unacceptable,
      ...(options.notEvaluated !== undefined ? { not_evaluated: options.notEvaluated } : {}),
    },
    items,
  }
}

/**
 * The text to speak for an entry, given any stored verdict.
 *
 * The walker's output is the default and the fallback. A judge's suggestion is
 * used only once a reviewer has accepted it, and a flag a reviewer overrode
 * with `accepted_anyway` returns the walker's output as normal. A stale
 * verdict — one whose hashes no longer match the current text — is ignored.
 */
export function resolveSpokenText(
  latex: string,
  verdict?: MathSpeechEvaluationItem,
): string {
  const walkerText = latexToSpeech(latex)
  if (!verdict?.resolved_text) return walkerText
  // The LaTeX changed after the review, so the reviewer approved wording for
  // an expression that no longer exists. Fall back rather than speak it.
  if (verdict.latex_hash && verdict.latex_hash !== hashText(latex)) return walkerText
  if (verdict.accepted_anyway) return walkerText
  return verdict.resolved_text
}
