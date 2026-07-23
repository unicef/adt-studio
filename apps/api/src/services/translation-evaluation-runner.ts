import path from "node:path"
import { z } from "zod"
import { createLLMModel, type LLMModel, type LlmLogEntry } from "@adt/llm"
import { createBookStorage } from "@adt/storage"
import {
  DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS,
  DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL,
  DEFAULT_TRANSLATION_EVALUATION_MAX_RETRIES,
  TranslationEvaluationIssueType,
  TranslationEvaluationResult,
  TranslationEvaluationRunRequest,
  TranslationEvaluationSeverity,
  type TranslationEvaluationIssueType as TranslationEvaluationIssueTypeData,
  type TranslationEvaluationResult as TranslationEvaluationResultData,
  type TranslationEvaluationRunPage,
  type TranslationEvaluationRunRequest as TranslationEvaluationRunRequestData,
} from "@adt/types"
import type { TaskProgressEmitter } from "./task-service.js"

const ISSUE_TYPES: TranslationEvaluationIssueTypeData[] = [
  "meaning",
  "fluency",
  "terminology",
  "omission-or-addition",
  "formatting",
  "context",
  "other",
]

const TERMINOLOGY_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "alone",
  "also",
  "been",
  "before",
  "being",
  "could",
  "dear",
  "does",
  "done",
  "from",
  "have",
  "into",
  "knew",
  "like",
  "more",
  "much",
  "over",
  "said",
  "same",
  "some",
  "soon",
  "sure",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "train",
  "very",
  "were",
  "what",
  "when",
  "will",
  "with",
  "would",
  "your",
])

const TranslationEvaluationJudgeItem = z.object({
  entry_id: z.string().min(1),
  acceptable: z.boolean(),
  rationale: z.string().min(1).nullable(),
  issue_types: z.array(TranslationEvaluationIssueType).nullable(),
  severity: TranslationEvaluationSeverity.nullable(),
  suggested_text: z.string().min(1).nullable(),
})

const TranslationEvaluationJudgeOutput = z.object({
  items: z.array(TranslationEvaluationJudgeItem).min(1),
})
type TranslationEvaluationJudgeOutput = z.infer<typeof TranslationEvaluationJudgeOutput>

const TranslationEvaluationSuggestionValidationOutput = z.object({
  acceptable: z.boolean(),
  rationale: z.string().min(1),
  repaired_suggested_text: z.string().min(1).nullable(),
})
type TranslationEvaluationSuggestionValidationOutput = z.infer<typeof TranslationEvaluationSuggestionValidationOutput>

export interface TranslationEvaluationRunnerOptions {
  booksDir: string
  /** OpenAI key. Still the common case, and the default judge is an OpenAI model. */
  apiKey: string
  anthropicApiKey?: string
  googleApiKey?: string
  customBaseUrl?: string
  customApiKey?: string
  createModel?: (options: {
    modelId: string
    cacheDir: string
    onLog: (entry: LlmLogEntry) => void
  }) => LLMModel
}

function utcNow(): string {
  return new Date().toISOString()
}

function normalizeJudgeModel(modelId: string | undefined): string {
  const resolved = modelId?.trim() || DEFAULT_TRANSLATION_EVALUATION_JUDGE_MODEL
  return resolved.replace(/^([a-zA-Z0-9_-]+):\/+/, "$1:")
}

/** Provider half of a `provider:model` id, defaulting to openai like resolveModel does. */
function judgeProvider(modelId: string): string {
  const colonIdx = modelId.indexOf(":")
  return colonIdx >= 0 ? modelId.slice(0, colonIdx) : "openai"
}

/**
 * The credential the configured judge actually needs. Requiring an OpenAI key
 * for an Anthropic judge would reject a perfectly valid setup.
 *
 * Mirrors resolveModel: each provider falls back to its SDK's own environment
 * variable when no per-request credential is supplied, so a server-configured
 * key counts. The custom provider is keyed on its base URL rather than a key —
 * it passes `apiKey || "dummy"`, so a local model with no auth is valid.
 */
function requiredCredentialFor(
  provider: string,
  options: JudgeCredentialOptions,
): { value: string | undefined; label: string; hint: string } {
  switch (provider) {
    case "anthropic":
      return {
        value: options.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
        label: "Anthropic API key",
        hint: "X-Anthropic-API-Key header or ANTHROPIC_API_KEY",
      }
    case "google":
      return {
        value: options.googleApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        label: "Google API key",
        hint: "X-Google-API-Key header or GOOGLE_GENERATIVE_AI_API_KEY",
      }
    case "custom":
      return {
        value: options.customBaseUrl || process.env.CUSTOM_OPENAI_BASE_URL,
        label: "custom provider base URL",
        hint: "X-Custom-Base-URL header or CUSTOM_OPENAI_BASE_URL",
      }
    default:
      return {
        value: options.apiKey || process.env.OPENAI_API_KEY,
        label: "OpenAI API key",
        hint: "X-OpenAI-Key header or OPENAI_API_KEY",
      }
  }
}

export type JudgeCredentialOptions = Pick<
  TranslationEvaluationRunnerOptions,
  "apiKey" | "anthropicApiKey" | "googleApiKey" | "customBaseUrl" | "customApiKey"
>

/** Error message when the configured judge has no usable credential, else null. */
export function describeMissingJudgeCredential(
  judgeModel: string | undefined,
  options: JudgeCredentialOptions,
): string | null {
  const modelId = normalizeJudgeModel(judgeModel)
  const required = requiredCredentialFor(judgeProvider(modelId), options)
  if (required.value?.trim()) return null
  return `Translation evaluation with judge model "${modelId}" needs a ${required.label}. Set the ${required.hint} on the API server.`
}

function buildJudgeInstructions(request: TranslationEvaluationRunRequestData): string {
  const base = (request.judge_instructions || DEFAULT_TRANSLATION_EVALUATION_JUDGE_INSTRUCTIONS).trim()
  const issueTypes = request.issue_types && request.issue_types.length > 0 ? request.issue_types : ISSUE_TYPES
  const sections = [
    base,
    `Strictness: ${request.strictness ?? "balanced"}.`,
    `Flag severity threshold: ${request.severity_threshold ?? "medium"}. Issues below this threshold should be treated as acceptable.`,
    `Issue types to check: ${issueTypes.join(", ")}.`,
    request.generate_suggestions === false
      ? "Do not return suggested_text."
      : request.only_suggest_when_confident !== false
        ? "Return suggested_text only when the correction is clear and high confidence."
        : "Return suggested_text for entries that need attention when a clear correction is possible.",
    "Suggested text must be a complete replacement translation, not a partial edit.",
    "Suggested text must preserve every source meaning unit, including roles, names, numbers, actions, quoted text, and important modifiers.",
    "For terminology-only issues, make the smallest possible edit that fixes the terminology while preserving the rest of the translation.",
    "Do not fix one issue by omitting, weakening, or changing another part of the source meaning.",
    "Only return suggested_text if you would mark that suggested replacement acceptable under the same review criteria.",
  ]
  if (request.target_audience?.trim()) {
    sections.push(`Target audience: ${request.target_audience.trim()}`)
  }
  if (request.style_guidance?.trim()) {
    sections.push(`Style guidance: ${request.style_guidance.trim()}`)
  }
  if (request.terminology_guidance?.trim()) {
    sections.push(`Terminology guidance: ${request.terminology_guidance.trim()}`)
  }
  if (request.additional_guidance?.trim()) {
    sections.push(`Additional guidance:\n${request.additional_guidance.trim()}`)
  }
  return sections.join("\n\n")
}

function buildSystemPrompt(instructions: string, request: TranslationEvaluationRunRequestData): string {
  const issueTypes = request.issue_types && request.issue_types.length > 0 ? request.issue_types : ISSUE_TYPES
  return `
${instructions}

You are evaluating translated text-catalog entries for one visible book page.
Use all entries on the page as context when judging each individual entry.
Return structured JSON only.

Decision rules:
- acceptable=true means the entry can be used as-is.
- acceptable=false means the entry needs human attention.
- Always return one result for every entry_id provided.
- Always include issue_types. Use [] when acceptable=true.
- If acceptable=false, include one or more issue_types from: ${issueTypes.join(", ")}.
- If no issue type clearly applies, use "other".
- Assign severity as low, medium, or high for entries that need attention.
- Treat issues below the configured severity threshold as acceptable.
- If acceptable=false and suggested translations are enabled, include suggested_text containing only the corrected target-language translation when a clear correction is possible.
- suggested_text must be a full target-language replacement for translated_text, not a partial edit or explanation.
- suggested_text must preserve every source meaning unit. Do not fix one issue by dropping another phrase.
- Treat existing translations on the page as local terminology memory. Repeated source roles, names, objects, and domain terms should keep the same target-language term unless user guidance says otherwise.
- For terminology-only issues, change only the terminology needed to fix the problem. Preserve the current translation's structure, role order, punctuation, and wording as much as possible.
- Only include suggested_text if that exact replacement would be acceptable under these same review criteria.
- Do not include suggested_text when acceptable=true.
- Keep rationale concise and specific; for acceptable entries, use a short confirmation.
`.trim()
}

function buildSuggestionValidationSystem(
  instructions: string,
  request: TranslationEvaluationRunRequestData,
  allowRepair: boolean,
): string {
  const issueTypes = request.issue_types && request.issue_types.length > 0 ? request.issue_types : ISSUE_TYPES
  return `
${instructions}

You are validating a proposed corrected translation for one entry.
Judge only the proposed_suggested_text as the replacement translation.
Return structured JSON only.

Validation rules:
- acceptable=true only when proposed_suggested_text would be acceptable under the same review criteria.
- proposed_suggested_text must preserve every source meaning unit, including roles, names, numbers, actions, quoted text, and important modifiers.
- proposed_suggested_text must be a complete target-language replacement, not a partial edit or explanation.
- proposed_suggested_text must fix the original issue without introducing omissions, additions, terminology drift, fluency problems, or context problems.
- Treat terminology_evidence as local terminology memory. If a repeated source term has neighboring translations that consistently use a target-language term, proposed_suggested_text must use that same term unless user guidance explicitly says otherwise.
- For terminology-only fixes, proposed_suggested_text should preserve the current translation's structure, role order, punctuation, and wording except for the necessary term replacement.
- Treat issues below the configured severity threshold as acceptable.
- Consider these issue types: ${issueTypes.join(", ")}.
- rationale should explain why the proposed suggestion passes or fails.
${allowRepair
    ? "- If proposed_suggested_text is not acceptable and a safe complete replacement is clear, return repaired_suggested_text with the corrected full target-language translation. Otherwise return repaired_suggested_text=null."
    : "- Return repaired_suggested_text=null."}
`.trim()
}

function sourceTerminologyTerms(sourceText: string): string[] {
  const words = sourceText
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}/g) ?? []
  return Array.from(new Set(words.filter((word) => !TERMINOLOGY_STOP_WORDS.has(word))))
}

function buildTerminologyEvidence(
  page: TranslationEvaluationRunPage,
  item: TranslationEvaluationResultData["items"][number],
) {
  const sourceText = item.source_text ?? ""
  const terms = sourceTerminologyTerms(sourceText)
  return terms
    .map((term) => {
      const neighboringEntries = page.entries
        .filter((entry) => entry.entry_id !== item.entry_id && entry.source_text.toLowerCase().includes(term))
        .slice(0, 5)
        .map((entry) => ({
          entry_id: entry.entry_id,
          source_text: entry.source_text,
          translated_text: entry.translated_text,
        }))
      return neighboringEntries.length > 0
        ? { source_term: term, neighboring_entries: neighboringEntries }
        : null
    })
    .filter((evidence): evidence is {
      source_term: string
      neighboring_entries: Array<{ entry_id: string; source_text: string; translated_text: string }>
    } => evidence != null)
}

function buildUserPrompt(page: TranslationEvaluationRunPage, request: TranslationEvaluationRunRequestData): string {
  const context = request.context ?? {}
  const includeBookMetadata = context.book_metadata !== false
  const includeSourceLanguage = context.source_language !== false
  const includeTargetLanguage = context.target_language !== false
  return JSON.stringify({
    book: {
      metadata: includeBookMetadata ? request.book_metadata ?? null : null,
      source_language: includeSourceLanguage ? request.source_language ?? "unknown" : "not included",
      target_language: includeTargetLanguage ? request.language : "not included",
    },
    page: {
      page_id: page.page_id,
      entries: page.entries.map((entry) => ({
        entry_id: entry.entry_id,
        source_text: entry.source_text,
        translated_text: entry.translated_text,
      })),
    },
  }, null, 2)
}

function buildSuggestionValidationPrompt(
  page: TranslationEvaluationRunPage,
  request: TranslationEvaluationRunRequestData,
  item: TranslationEvaluationResultData["items"][number],
  proposedSuggestedText: string,
): string {
  const context = request.context ?? {}
  const includeBookMetadata = context.book_metadata !== false
  const includeSourceLanguage = context.source_language !== false
  const includeTargetLanguage = context.target_language !== false
  return JSON.stringify({
    book: {
      metadata: includeBookMetadata ? request.book_metadata ?? null : null,
      source_language: includeSourceLanguage ? request.source_language ?? "unknown" : "not included",
      target_language: includeTargetLanguage ? request.language : "not included",
    },
    page: {
      page_id: page.page_id,
      entries: page.entries.map((entry) => ({
        entry_id: entry.entry_id,
        source_text: entry.source_text,
        translated_text: entry.translated_text,
      })),
    },
    candidate: {
      entry_id: item.entry_id,
      source_text: item.source_text,
      current_translated_text: item.translated_text,
      original_rationale: item.rationale,
      original_issue_types: item.issue_types ?? [],
      proposed_suggested_text: proposedSuggestedText,
      terminology_evidence: buildTerminologyEvidence(page, item),
    },
  }, null, 2)
}

function severityRank(severity: "low" | "medium" | "high" | null | undefined): number {
  if (severity === "high") return 3
  if (severity === "medium") return 2
  if (severity === "low") return 1
  return 2
}

function normalizeJudgeOutput(
  page: TranslationEvaluationRunPage,
  output: TranslationEvaluationJudgeOutput,
  request: TranslationEvaluationRunRequestData,
) {
  const sourceById = new Map(page.entries.map((entry) => [entry.entry_id, entry]))
  const items = []
  const seen = new Set<string>()
  const severityThreshold = request.severity_threshold ?? "medium"
  const allowedIssueTypes = new Set(request.issue_types && request.issue_types.length > 0 ? request.issue_types : ISSUE_TYPES)
  for (const outputItem of output.items) {
    const entry = sourceById.get(outputItem.entry_id)
    if (!entry) continue
    seen.add(outputItem.entry_id)
    const issueAboveThreshold = severityRank(outputItem.severity) >= severityRank(severityThreshold)
    const acceptable = outputItem.acceptable || !issueAboveThreshold
    const rawIssueTypes = outputItem.issue_types?.filter((issueType) => allowedIssueTypes.has(issueType)) ?? []
    const issueTypes = acceptable
      ? []
      : rawIssueTypes.length > 0
        ? rawIssueTypes
        : ["other" as const]
    const rationale = outputItem.rationale?.trim()
    items.push({
      entry_id: entry.entry_id,
      acceptable,
      page_id: page.page_id,
      source_text: entry.source_text,
      translated_text: entry.translated_text,
      rationale: rationale || (acceptable
        ? "Translation is acceptable."
        : "Translation needs human review."),
      issue_types: issueTypes,
      ...(!acceptable && outputItem.severity ? { severity: outputItem.severity } : {}),
      ...(entry.source_hash ? { source_hash: entry.source_hash } : {}),
      ...(entry.translated_hash ? { translated_hash: entry.translated_hash } : {}),
      ...(!acceptable && request.generate_suggestions !== false && outputItem.suggested_text?.trim()
        ? { suggested_text: outputItem.suggested_text.trim() }
        : {}),
    })
  }

  for (const entry of page.entries) {
    if (seen.has(entry.entry_id)) continue
    items.push({
      entry_id: entry.entry_id,
      acceptable: false,
      page_id: page.page_id,
      source_text: entry.source_text,
      translated_text: entry.translated_text,
      rationale: "Translation judge did not return a verdict for this entry.",
      issue_types: ["other" as const],
      severity: "medium" as const,
      ...(entry.source_hash ? { source_hash: entry.source_hash } : {}),
      ...(entry.translated_hash ? { translated_hash: entry.translated_hash } : {}),
    })
  }

  return items
}

function buildFailedEvaluationItems(page: TranslationEvaluationRunPage, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return page.entries.map((entry) => ({
    entry_id: entry.entry_id,
    acceptable: false,
    page_id: page.page_id,
    source_text: entry.source_text,
    translated_text: entry.translated_text,
    rationale: `Translation judge failed: ${message}`,
    issue_types: ["other" as const],
    severity: "medium" as const,
    ...(entry.source_hash ? { source_hash: entry.source_hash } : {}),
    ...(entry.translated_hash ? { translated_hash: entry.translated_hash } : {}),
  }))
}

async function validateSuggestedTranslations({
  page,
  items,
  request,
  instructions,
  llmModel,
  maxRetries,
}: {
  page: TranslationEvaluationRunPage
  items: TranslationEvaluationResultData["items"]
  request: TranslationEvaluationRunRequestData
  instructions: string
  llmModel: LLMModel
  maxRetries: number
}): Promise<TranslationEvaluationResultData["items"]> {
  if (request.generate_suggestions === false) return items

  const validateCandidate = async (
    item: TranslationEvaluationResultData["items"][number],
    proposedSuggestedText: string,
    allowRepair: boolean,
  ): Promise<TranslationEvaluationSuggestionValidationOutput> => {
    const result = await llmModel.generateObject<TranslationEvaluationSuggestionValidationOutput>({
      schema: TranslationEvaluationSuggestionValidationOutput,
      system: buildSuggestionValidationSystem(instructions, request, allowRepair),
      messages: [
        {
          role: "user",
          content: buildSuggestionValidationPrompt(page, request, item, proposedSuggestedText),
        },
      ],
      maxRetries,
      temperature: request.temperature ?? 0,
      log: {
        taskType: "translation-evaluation",
        pageId: page.page_id,
        promptName: allowRepair
          ? "translation-evaluation-suggestion-validation"
          : "translation-evaluation-suggestion-revalidation",
      },
    })
    return result.object
  }

  const suppressSuggestion = (
    item: TranslationEvaluationResultData["items"][number],
    rationale: string,
  ): TranslationEvaluationResultData["items"][number] => {
    const itemWithoutSuggestion = { ...item }
    delete itemWithoutSuggestion.suggested_text
    return {
      ...itemWithoutSuggestion,
      suggestion_validated: false,
      suggestion_validation_rationale: rationale,
    }
  }

  const validatedItems: TranslationEvaluationResultData["items"] = []
  for (const item of items) {
    if (item.acceptable || !item.suggested_text) {
      validatedItems.push(item)
      continue
    }

    try {
      const validation = await validateCandidate(item, item.suggested_text, true)
      if (validation.acceptable) {
        validatedItems.push({
          ...item,
          suggestion_validated: true,
          suggestion_validation_rationale: validation.rationale,
        })
        continue
      }

      const repaired = validation.repaired_suggested_text?.trim()
      if (repaired) {
        const repairValidation = await validateCandidate(item, repaired, false)
        if (repairValidation.acceptable) {
          validatedItems.push({
            ...item,
            suggested_text: repaired,
            suggestion_validated: true,
            suggestion_validation_rationale: repairValidation.rationale,
          })
          continue
        }
        validatedItems.push(suppressSuggestion(item, repairValidation.rationale))
        continue
      }

      validatedItems.push(suppressSuggestion(item, validation.rationale))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      validatedItems.push(suppressSuggestion(item, `Automatic suggestion withheld because validation failed: ${message}`))
    }
  }

  return validatedItems
}

export async function evaluateTranslationInApi(
  request: TranslationEvaluationRunRequestData,
  options: TranslationEvaluationRunnerOptions,
  emitProgress?: TaskProgressEmitter,
): Promise<TranslationEvaluationResultData> {
  const parsedRequest = TranslationEvaluationRunRequest.parse(request)
  const modelId = normalizeJudgeModel(parsedRequest.judge_model)
  const missingCredential = describeMissingJudgeCredential(modelId, options)
  if (missingCredential) {
    throw new Error(missingCredential)
  }

  const instructions = buildJudgeInstructions(parsedRequest)
  const system = buildSystemPrompt(instructions, parsedRequest)
  const maxRetries = parsedRequest.max_retries ?? DEFAULT_TRANSLATION_EVALUATION_MAX_RETRIES
  const cacheDir = path.join(path.resolve(options.booksDir), parsedRequest.book_label, ".cache")
  const storage = createBookStorage(parsedRequest.book_label, options.booksDir)

  try {
    const onLog = (entry: LlmLogEntry) => storage.appendLlmLog(entry)
    const credentials = {
      openaiApiKey: options.apiKey,
      anthropicApiKey: options.anthropicApiKey,
      googleApiKey: options.googleApiKey,
      customBaseUrl: options.customBaseUrl,
      customApiKey: options.customApiKey,
    }
    const llmModel = options.createModel
      ? options.createModel({ modelId, cacheDir, onLog })
      : createLLMModel({ modelId, cacheDir, onLog, credentials })
    {
      const items: TranslationEvaluationResultData["items"] = []
      let failedPages = 0
      let completedPages = 0
      const totalPages = parsedRequest.pages.length

      for (const page of parsedRequest.pages) {
        emitProgress?.(
          `Evaluating translation page ${completedPages + 1} of ${totalPages}`,
          40 + Math.round((completedPages / Math.max(1, totalPages)) * 40),
        )

        try {
          const result = await llmModel.generateObject<TranslationEvaluationJudgeOutput>({
            schema: TranslationEvaluationJudgeOutput,
            system,
            messages: [
              {
                role: "user",
                content: buildUserPrompt(page, parsedRequest),
              },
            ],
            maxRetries,
            temperature: parsedRequest.temperature ?? 0,
            log: {
              taskType: "translation-evaluation",
              pageId: page.page_id,
              promptName: "translation-evaluation-judge",
            },
          })
          const pageItems = normalizeJudgeOutput(page, result.object, parsedRequest)
          items.push(...await validateSuggestedTranslations({
            page,
            items: pageItems,
            request: parsedRequest,
            instructions,
            llmModel,
            maxRetries,
          }))
        } catch (err) {
          failedPages += 1
          items.push(...buildFailedEvaluationItems(page, err))
        }
        completedPages += 1
        emitProgress?.(
          `Evaluated ${completedPages} of ${totalPages} pages`,
          40 + Math.round((completedPages / Math.max(1, totalPages)) * 40),
        )
      }

      const acceptableCount = items.filter((item) => item.acceptable).length
      const selectedEntryIds = parsedRequest.pages.flatMap((page) => page.entries.map((entry) => entry.entry_id))
      const result = TranslationEvaluationResult.parse({
        generated_at: utcNow(),
        provider: "adt-llm",
        language: parsedRequest.language,
        ...(parsedRequest.source_language ? { source_language: parsedRequest.source_language } : {}),
        source_catalog_version: parsedRequest.source_catalog_version,
        translation_version: parsedRequest.translation_version,
        eval_config_hash: parsedRequest.eval_config_hash,
        judge: {
          model: modelId,
          instructions,
          additional_guidance: parsedRequest.additional_guidance ?? null,
          max_retries: maxRetries,
          temperature: parsedRequest.temperature ?? 0,
          strictness: parsedRequest.strictness ?? "balanced",
          severity_threshold: parsedRequest.severity_threshold ?? "medium",
          issue_types: parsedRequest.issue_types ?? ISSUE_TYPES,
          generate_suggestions: parsedRequest.generate_suggestions ?? true,
          only_suggest_when_confident: parsedRequest.only_suggest_when_confident ?? true,
          context: parsedRequest.context,
          target_audience: parsedRequest.target_audience ?? null,
          style_guidance: parsedRequest.style_guidance ?? null,
          terminology_guidance: parsedRequest.terminology_guidance ?? null,
        },
        summary: {
          total: items.length,
          acceptable: acceptableCount,
          unacceptable: items.length - acceptableCount,
        },
        items,
        metadata: {
          failed_pages: failedPages,
          selected_entry_count: selectedEntryIds.length,
          page_id: parsedRequest.pages.length === 1 ? parsedRequest.pages[0].page_id : null,
          page_ids: parsedRequest.pages.map((page) => page.page_id),
          scope_hash: parsedRequest.scope_hash,
          selected_entry_ids: selectedEntryIds,
          book_metadata: parsedRequest.book_metadata ?? null,
        },
      })

      emitProgress?.("Translation evaluation completed", 80)
      return result
    }
  } finally {
    storage.close()
  }
}

export const translationEvaluationRunnerInternals = {
  buildJudgeInstructions,
  buildSuggestionValidationPrompt,
  buildSuggestionValidationSystem,
  buildTerminologyEvidence,
  buildSystemPrompt,
  buildUserPrompt,
  normalizeJudgeModel,
}
