import type { OutputReference } from "@adt/types"
import { outputSkipped } from "./output-freshness.js"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import yaml from "js-yaml"
import { z } from "zod"
import {
  CoreTtsCatalogOutput as CoreTtsCatalogOutputSchema,
  containsLatexSpeechCandidate,
  type AppConfig,
  type CoreTtsCatalogEntry,
  type CoreTtsCatalogOutput,
  type CoreTtsTransformationKind,
  type TextCatalogEntry,
  type OutputRunScope,
} from "@adt/types"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import type { Storage } from "@adt/storage"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"
import { inputSignature, outputEvidence, deriveOutputStatus, withOutputLocations, selectedForGeneration } from "./output-freshness.js"

export type CoreTtsProfiles = Record<string, string>

export interface ResolvedCoreTtsProfile {
  key: string
  guidance: string
}

export interface CoreTtsPreparationLocale {
  language: string
  usesSourceDisplayText: boolean
}

export interface CoreTtsPreparationConfig {
  modelId: string
  promptName: string
  maxRetries: number
  batchSize: number
  latexToSpeech: boolean
  languageNormalization: boolean
  /** Resolved effective template contents, supplied by the execution adapter. */
  promptSignature?: string
}

export interface CoreTtsSourceContextEntry {
  displayText: string
  speechText: string | null
}

export function buildCoreTtsPreparationConfig(
  appConfig: AppConfig,
): CoreTtsPreparationConfig {
  return {
    modelId:
      appConfig.core_tts?.model ??
      appConfig.translation?.model ??
      appConfig.default_model ??
      "openai:gpt-5.4",
    promptName: appConfig.core_tts?.prompt ?? "core_tts_preparation",
    maxRetries:
      appConfig.core_tts?.max_retries ?? DEFAULT_LLM_MAX_RETRIES,
    batchSize: appConfig.core_tts?.batch_size ?? 50,
    latexToSpeech: appConfig.core_tts?.latex_to_speech ?? true,
    languageNormalization:
      appConfig.core_tts?.language_normalization ?? true,
  }
}

export function loadCoreTtsProfiles(configDir: string): CoreTtsProfiles {
  const filePath = path.join(configDir, "core_tts_profiles.yaml")
  if (!fs.existsSync(filePath)) return {}
  const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"))
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
}

/** Resolve exact locale, then base locale, then the editable default profile. */
export function resolveCoreTtsProfile(
  language: string,
  profiles: CoreTtsProfiles,
): ResolvedCoreTtsProfile {
  const normalized = normalizeLocale(language).toLowerCase()
  const normalizedProfiles = new Map(
    Object.entries(profiles).map(([key, guidance]) => [
      key === "default" ? key : normalizeLocale(key).toLowerCase(),
      { key, guidance },
    ]),
  )
  const exact = normalizedProfiles.get(normalized)
  if (exact) {
    return exact
  }
  const base = getBaseLanguage(normalized)
  const baseProfile = normalizedProfiles.get(base)
  if (baseProfile) {
    return baseProfile
  }
  return { key: "default", guidance: profiles.default ?? "" }
}

/**
 * Every exact output locale needs its own provider-text catalog because voice
 * routing and normalization profiles can differ between regional variants.
 * Same-base variants reuse source display text instead of requiring a
 * translation catalog.
 */
export function getCoreTtsPreparationLocales(
  outputLanguages: string[],
  sourceLanguage: string,
): CoreTtsPreparationLocale[] {
  const source = normalizeLocale(sourceLanguage)
  const sourceBase = getBaseLanguage(source)
  return Array.from(
    new Set(outputLanguages.map((language) => normalizeLocale(language))),
  )
    .filter((language) => language !== source)
    .map((language) => ({
      language,
      usesSourceDisplayText: getBaseLanguage(language) === sourceBase,
    }))
}

const preparedBatchSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      speech_text: z.string().nullable(),
      transformation_kinds: z.array(
        z.enum(["latex-to-speech", "language-normalization"]),
      ),
      failure_reason: z.string().nullable(),
    }),
  ),
})

function hash(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")
}

function uniqueTransformations(
  transformations: CoreTtsTransformationKind[],
): CoreTtsTransformationKind[] {
  return [...new Set(transformations)]
}

function unchangedEntry(options: {
  entry: TextCatalogEntry
  language: string
  now: string
  profile: ResolvedCoreTtsProfile
  enabledTransformations: CoreTtsTransformationKind[]
}): CoreTtsCatalogEntry {
  const context = {
    language: options.language,
    displayText: options.entry.text,
    profile: options.profile,
    enabledTransformations: options.enabledTransformations,
  }
  return {
    id: options.entry.id,
    displayText: options.entry.text,
    speechText: options.entry.text,
    changed: false,
    transformations: [],
    status: "ready",
    generation: {
      mode: "unchanged",
      generatedAt: options.now,
      profileKey: options.profile.key,
      profileGuidance: options.profile.guidance,
      enabledTransformations: options.enabledTransformations,
      sourceTextHash: hash(options.entry.text),
      contextHash: hash(context),
    },
  }
}

interface PreparationInput {
  id: string
  display_text: string
  enabled_transformations: CoreTtsTransformationKind[]
  source_display_text: string | null
  source_speech_text: string | null
  previous_display_text: string | null
  next_display_text: string | null
}

export function coreTtsInputBasis(options: {
  entries: TextCatalogEntry[]
  index: number
  language: string
  config: CoreTtsPreparationConfig
  profile: ResolvedCoreTtsProfile
  sourceContext?: Map<string, CoreTtsSourceContextEntry>
}) {
  const entry = options.entries[options.index]
  const enabled: CoreTtsTransformationKind[] = []
  if (options.config.latexToSpeech && containsLatexSpeechCandidate(entry.text)) enabled.push("latex-to-speech")
  if (options.config.languageNormalization && options.profile.guidance.trim()) enabled.push("language-normalization")
  const source = enabled.length ? options.sourceContext?.get(entry.id) : undefined
  const input: PreparationInput = {
    id: entry.id, display_text: entry.text, enabled_transformations: enabled,
    source_display_text: source?.displayText ?? null,
    source_speech_text: source?.speechText ?? null,
    previous_display_text: enabled.length ? options.entries[options.index - 1]?.text ?? null : null,
    next_display_text: enabled.length ? options.entries[options.index + 1]?.text ?? null : null,
  }
  const signature = inputSignature({
    language: normalizeLocale(options.language), input,
    ...(enabled.length ? {
      profile: options.profile, model: options.config.modelId,
      prompt: options.config.promptSignature ?? options.config.promptName,
      latexToSpeech: options.config.latexToSpeech,
      languageNormalization: options.config.languageNormalization,
    } : {}),
  })
  return { input, signature }
}

function fallbackEntry(options: {
  entry: TextCatalogEntry
  signature: string
  language: string
  profile: ResolvedCoreTtsProfile
  enabled: CoreTtsTransformationKind[]
  reason?: "failed" | "missing" | "outdated"
  failureReason?: string
  now: string
}): CoreTtsCatalogEntry {
  const result = unchangedEntry({ entry: options.entry, language: options.language, profile: options.profile, enabledTransformations: options.enabled, now: options.now })
  return {
    ...result, source: "ai", input: outputEvidence(options.signature, options.entry.text),
    ...(options.reason ? {
      fallbackReason: options.reason,
      status: "failed" as const,
      failureReason: options.failureReason ?? `Text preparation ${options.reason}. Audio uses the original text.`,
    } : {}),
  }
}

/** Deterministic speech-only resolution. It never calls a provider or substitutes
 * another language. Callers supply only display entries for the requested locale. */
export function resolveCoreTtsSpeechCatalog(options: {
  entries: TextCatalogEntry[]
  language: string
  config: CoreTtsPreparationConfig
  profile: ResolvedCoreTtsProfile
  previous?: CoreTtsCatalogOutput | null
  sourceContext?: Map<string, CoreTtsSourceContextEntry>
  now?: string
}): CoreTtsCatalogOutput {
  const now = options.now ?? new Date().toISOString()
  const prior = new Map((options.previous?.entries ?? []).map((entry) => [entry.id, entry]))
  return {
    language: normalizeLocale(options.language), generatedAt: now,
    entries: options.entries.flatMap((entry, index) => {
      const { input, signature } = coreTtsInputBasis({ ...options, index })
      const previous = prior.get(entry.id)
      if (previous?.speechText?.trim() && (previous.generation.mode === "manual" || previous.source !== "ai")) return previous
      if (!entry.text.trim()) return []
      if (previous?.input?.signature === signature && previous.input.contentHash === inputSignature(previous.speechText) && previous.speechText?.trim()) return previous
      const reason = input.enabled_transformations.length === 0 ? undefined
        : !previous ? "missing" : previous.status === "failed" && previous.displayText === entry.text ? "failed" : "outdated"
      return fallbackEntry({ entry, signature, language: options.language, profile: options.profile, enabled: input.enabled_transformations, reason, failureReason: reason === "failed" ? previous?.failureReason : undefined, now })
    }),
  }
}

export async function prepareCoreTtsCatalog(options: {
  entries: TextCatalogEntry[]
  language: string
  config: CoreTtsPreparationConfig
  profile: ResolvedCoreTtsProfile
  llmModel: LLMModel
  previous?: CoreTtsCatalogOutput | null
  sourceContext?: Map<string, CoreTtsSourceContextEntry>
  now?: string
  scope?: OutputRunScope
  selectedIds?: readonly string[]
  retryIds?: readonly string[]
  references?: OutputReference[]
  signal?: AbortSignal
}): Promise<CoreTtsCatalogOutput> {
  const language = normalizeLocale(options.language)
  const now = options.now ?? new Date().toISOString()
  const previousById = new Map((options.previous?.entries ?? []).map((entry) => [entry.id, entry]))
  const resultById = new Map<string, CoreTtsCatalogEntry>()
  const inputs: PreparationInput[] = []
  const signatures = new Map<string, string>()
  const protectedIds = new Set<string>()

  for (let index = 0; index < options.entries.length; index++) {
    const entry = options.entries[index]
    if (!entry.text.trim()) continue
    const previous = previousById.get(entry.id)
    const { input, signature } = coreTtsInputBasis({ ...options, index })
    signatures.set(entry.id, signature)
    const metadata = previous ? { ...previous, source: previous.generation.mode === "manual" ? "manual" as const : previous.source } : undefined
    const status = withOutputLocations(deriveOutputStatus({ identity: { kind: "preparation", id: entry.id, language }, signature,
      content: previous?.speechText, metadata, usable: !!previous?.speechText?.trim() }), entry)
    const explicitRetry = options.retryIds?.includes(entry.id)
    if (previous && status.protected) protectedIds.add(entry.id)
    if (!selectedForGeneration(status, metadata, options.scope) && !(explicitRetry && !status.protected)) {
      if (previous) resultById.set(entry.id, previous)
      continue
    }
    if (options.selectedIds && !options.selectedIds.includes(entry.id)) {
      if (previous) resultById.set(entry.id, previous)
      continue
    }
    if (!options.scope?.replace?.some((item) => item.identity.kind === "preparation" && item.identity.id === entry.id && item.identity.language === language) && !options.scope?.retry?.some((item) => item.kind === "preparation" && item.id === entry.id && item.language === language) && !options.retryIds?.includes(entry.id) && previous?.input?.signature === signature &&
      previous.input.contentHash === inputSignature(previous.speechText) && previous.speechText?.trim()) {
      resultById.set(entry.id, previous)
      continue
    }
    if (input.enabled_transformations.length === 0) {
      resultById.set(entry.id, fallbackEntry({ entry, signature, language, profile: options.profile, enabled: [], now }))
      continue
    }
    inputs.push(input)
  }

  for (let offset = 0; offset < inputs.length; offset += options.config.batchSize) {
    options.signal?.throwIfAborted()
    const batch = inputs.slice(offset, offset + options.config.batchSize).filter((entry) => !outputSkipped(options.scope, { kind: "preparation", id: entry.id, language }))
    if (!batch.length) continue
    const context = {
      language, profile_key: options.profile.key, profile_guidance: options.profile.guidance,
      enabled_transformations: uniqueTransformations(batch.flatMap((entry) => entry.enabled_transformations)), entries: batch,
    }
    let generated: { object: z.infer<typeof preparedBatchSchema>; cached?: boolean }
    try {
      generated = await options.llmModel.generateObject<z.infer<typeof preparedBatchSchema>>({
        schema: preparedBatchSchema, prompt: options.config.promptName, context,
        validate: (raw: unknown): ValidationResult => {
          const parsed = preparedBatchSchema.safeParse(raw)
          if (!parsed.success) return { valid: false, errors: [parsed.error.message] }
          if (parsed.data.entries.length !== batch.length || batch.some((input, i) => input.id !== parsed.data.entries[i]?.id)) {
            return { valid: false, errors: ["Return exactly one result per input entry, in order and with unchanged ids."] }
          }
          return { valid: true, errors: [] }
        },
        maxRetries: options.config.maxRetries, maxTokens: 16384, signal: options.signal,
        log: { taskType: "core-tts-catalog", promptName: options.config.promptName },
      })
      options.signal?.throwIfAborted()
    } catch (error) {
      options.signal?.throwIfAborted()
      // One exhausted batch must not silently omit its phrases or stop other
      // runnable batches. Do not add a second retry loop around the LLM client.
      for (const input of batch) {
        if (protectedIds.has(input.id)) { resultById.set(input.id, previousById.get(input.id)!); continue }
        resultById.set(input.id, fallbackEntry({
        entry: { id: input.id, text: input.display_text }, signature: signatures.get(input.id)!,
        language, profile: options.profile, enabled: input.enabled_transformations,
        reason: "failed", failureReason: error instanceof Error ? error.message : "Text preparation failed.", now,
        }))
      }
      continue
    }
    for (let index = 0; index < batch.length; index++) {
      const input = batch[index]
      const output = generated.object.entries[index]
      const text = output?.speech_text?.trim() || null
      const latex = input.enabled_transformations.includes("latex-to-speech")
      const failure = output?.failure_reason?.trim() || (!text ? "Preparation returned no speech text." : undefined) ||
        (latex && containsLatexSpeechCandidate(text) ? "Raw LaTeX remained in the prepared text." : undefined)
      if (failure) {
        if (protectedIds.has(input.id)) { resultById.set(input.id, previousById.get(input.id)!); continue }
        resultById.set(input.id, fallbackEntry({ entry: { id: input.id, text: input.display_text }, signature: signatures.get(input.id)!, language, profile: options.profile, enabled: input.enabled_transformations, reason: "failed", failureReason: failure, now }))
        continue
      }
      resultById.set(input.id, {
        id: input.id, displayText: input.display_text, speechText: text,
        changed: text !== input.display_text, status: "ready", source: "ai",
        input: outputEvidence(signatures.get(input.id)!, text),
        transformations: uniqueTransformations([...(output?.transformation_kinds ?? []), ...(latex ? ["latex-to-speech" as const] : [])]).filter((kind) => input.enabled_transformations.includes(kind)),
        generation: {
          mode: "generated", generatedAt: now, model: options.config.modelId, prompt: options.config.promptName,
          profileKey: options.profile.key, profileGuidance: options.profile.guidance,
          enabledTransformations: input.enabled_transformations, sourceTextHash: hash(input.display_text),
          contextHash: signatures.get(input.id)!, cached: generated.cached ?? false,
        },
      })
    }
  }
  options.signal?.throwIfAborted()
  return CoreTtsCatalogOutputSchema.parse({ language, entries: options.entries.flatMap((entry) => {
    const result = outputSkipped(options.scope, { kind: "preparation", id: entry.id, language }) ? previousById.get(entry.id) : resultById.get(entry.id)
    return result ? [result !== previousById.get(entry.id) && result.input && options.references ? { ...result, input: { ...result.input, references: options.references } } : result] : []
  }), generatedAt: now })
}

export function getCoreTtsCatalog(
  storage: Storage,
  language: string,
): CoreTtsCatalogOutput | null {
  const normalized = normalizeLocale(language)
  const legacy = normalized.replace("-", "_")
  const row =
    storage.getLatestNodeData("core-tts-catalog", normalized) ??
    storage.getLatestNodeData("core-tts-catalog", legacy)
  if (!row) return null
  const parsed = CoreTtsCatalogOutputSchema.safeParse(row.data)
  return parsed.success ? parsed.data : null
}

/** Return usable prepared text, including explicitly declared display fallback. */
export function getReadyCoreTtsEntries(
  storage: Storage,
  language: string,
): TextCatalogEntry[] {
  const catalog = getCoreTtsCatalog(storage, language)
  if (!catalog) return []
  return catalog.entries.flatMap((entry) =>
    (entry.status === "ready" || entry.fallbackReason !== undefined) && entry.speechText !== null
      ? [{ id: entry.id, text: entry.speechText }]
      : [],
  )
}

export function buildCoreTtsSourceContext(
  displayEntries: TextCatalogEntry[],
  catalog: CoreTtsCatalogOutput,
): Map<string, CoreTtsSourceContextEntry> {
  const speechById = new Map(catalog.entries.map((entry) => [entry.id, entry.speechText]))
  return new Map(
    displayEntries.map((entry) => [
      entry.id,
      { displayText: entry.text, speechText: speechById.get(entry.id) ?? null },
    ]),
  )
}

/**
 * Compatibility entry point for old Save callers. Freshness is derived from
 * display inputs; saving preserves existing text and makes no provider calls.
 */
export function invalidateCoreTtsForDisplayEntries(options: {
  storage: Storage
  language: string
  entries: TextCatalogEntry[]
  reason?: string
  now?: string
}): CoreTtsCatalogOutput | null {
  // Save never replaces provider text, including manually edited speech.
  // Reconciliation before planning derives freshness from current display text.
  return getCoreTtsCatalog(options.storage, options.language)
}

/**
 * Compatibility entry point: upstream changes never delete existing speech.
 * Speech admission reconciles requested-language display inputs before use.
 */
export function invalidateCoreTtsEntriesById(options: {
  storage: Storage
  textIds: ReadonlySet<string>
  reason?: string
  now?: string
}): number {
  if (options.textIds.size === 0) return 0

  // Retain existing output and history. Current inputs are checked before use.
  return 0
}
