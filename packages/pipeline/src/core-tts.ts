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
} from "@adt/types"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import type { LLMModel, ValidationResult } from "@adt/llm"
import type { Storage } from "@adt/storage"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"

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

export async function prepareCoreTtsCatalog(options: {
  entries: TextCatalogEntry[]
  language: string
  config: CoreTtsPreparationConfig
  profile: ResolvedCoreTtsProfile
  llmModel: LLMModel
  previous?: CoreTtsCatalogOutput | null
  sourceContext?: Map<string, CoreTtsSourceContextEntry>
  now?: string
}): Promise<CoreTtsCatalogOutput> {
  const language = normalizeLocale(options.language)
  const now = options.now ?? new Date().toISOString()
  const previousById = new Map(
    (options.previous?.entries ?? []).map((entry) => [entry.id, entry]),
  )
  const resultById = new Map<string, CoreTtsCatalogEntry>()
  const inputs: PreparationInput[] = []

  for (let index = 0; index < options.entries.length; index++) {
    const entry = options.entries[index]
    const previous = previousById.get(entry.id)
    if (
      previous?.generation.mode === "manual" &&
      previous.displayText === entry.text
    ) {
      resultById.set(entry.id, previous)
      continue
    }

    const enabled: CoreTtsTransformationKind[] = []
    if (
      options.config.latexToSpeech &&
      containsLatexSpeechCandidate(entry.text)
    ) {
      enabled.push("latex-to-speech")
    }
    if (
      options.config.languageNormalization &&
      options.profile.guidance.trim().length > 0
    ) {
      enabled.push("language-normalization")
    }

    if (enabled.length === 0) {
      resultById.set(
        entry.id,
        unchangedEntry({
          entry,
          language,
          now,
          profile: options.profile,
          enabledTransformations: enabled,
        }),
      )
      continue
    }

    const source = options.sourceContext?.get(entry.id)
    inputs.push({
      id: entry.id,
      display_text: entry.text,
      enabled_transformations: enabled,
      source_display_text: source?.displayText ?? null,
      source_speech_text: source?.speechText ?? null,
      previous_display_text: options.entries[index - 1]?.text ?? null,
      next_display_text: options.entries[index + 1]?.text ?? null,
    })
  }

  for (let offset = 0; offset < inputs.length; offset += options.config.batchSize) {
    const batch = inputs.slice(offset, offset + options.config.batchSize)
    const context = {
      language,
      profile_key: options.profile.key,
      profile_guidance: options.profile.guidance,
      enabled_transformations: uniqueTransformations(
        batch.flatMap((entry) => entry.enabled_transformations),
      ),
      entries: batch,
    }
    const generated = await options.llmModel.generateObject<
      z.infer<typeof preparedBatchSchema>
    >({
      schema: preparedBatchSchema,
      prompt: options.config.promptName,
      context,
      validate: (raw: unknown): ValidationResult => {
        const parsed = preparedBatchSchema.safeParse(raw)
        if (!parsed.success) {
          return { valid: false, errors: [parsed.error.message] }
        }
        const expected = batch.map((entry) => entry.id)
        const actual = parsed.data.entries.map((entry) => entry.id)
        if (
          expected.length !== actual.length ||
          expected.some((id, index) => actual[index] !== id)
        ) {
          return {
            valid: false,
            errors: ["Return exactly one result per input entry, in the same order and with unchanged ids."],
          }
        }
        return { valid: true, errors: [] }
      },
      maxRetries: options.config.maxRetries,
      maxTokens: 16384,
      log: {
        taskType: "core-tts-catalog",
        promptName: options.config.promptName,
      },
    })

    for (let index = 0; index < batch.length; index++) {
      const input = batch[index]
      const output = generated.object.entries[index]
      const text = output?.speech_text?.trim() || null
      const latexEnabled = input.enabled_transformations.includes("latex-to-speech")
      const latexRemains = latexEnabled && !!text && containsLatexSpeechCandidate(text)
      const failureReason =
        output?.failure_reason?.trim() ||
        (!text ? "Preparation returned no speech text." : undefined) ||
        (latexRemains ? "Raw LaTeX remained in the prepared text." : undefined)
      const failed = failureReason !== undefined
      const applied = uniqueTransformations([
        ...(output?.transformation_kinds ?? []),
        ...(latexEnabled && !latexRemains && text ? ["latex-to-speech" as const] : []),
        ...(!latexEnabled &&
        text !== null &&
        text !== input.display_text &&
        input.enabled_transformations.includes("language-normalization")
          ? ["language-normalization" as const]
          : []),
      ]).filter((kind) => input.enabled_transformations.includes(kind))

      resultById.set(input.id, {
        id: input.id,
        displayText: input.display_text,
        speechText: failed ? null : text,
        changed: !failed && text !== input.display_text,
        transformations: applied,
        status: failed ? "failed" : "ready",
        ...(failed ? { failureReason } : {}),
        generation: {
          mode: "generated",
          generatedAt: now,
          model: options.config.modelId,
          prompt: options.config.promptName,
          profileKey: options.profile.key,
          profileGuidance: options.profile.guidance,
          enabledTransformations: input.enabled_transformations,
          sourceTextHash: hash(input.display_text),
          contextHash: hash({ ...context, entry: input }),
          cached: generated.cached ?? false,
        },
      })
    }
  }

  return CoreTtsCatalogOutputSchema.parse({
    language,
    entries: options.entries.map((entry) => resultById.get(entry.id)),
    generatedAt: now,
  })
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

/** Sole resolver used before synthesis: failed entries are deliberately absent. */
export function getReadyCoreTtsEntries(
  storage: Storage,
  language: string,
): TextCatalogEntry[] {
  const catalog = getCoreTtsCatalog(storage, language)
  if (!catalog) return []
  return catalog.entries.flatMap((entry) =>
    entry.status === "ready" && entry.speechText !== null
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
 * Create a new, withheld Core TTS version after display text changes outside
 * the preparation stage (manual translation edits or a version rollback).
 * Unchanged/manual entries remain intact; new or changed display entries must
 * be prepared again before any provider can receive them.
 */
export function invalidateCoreTtsForDisplayEntries(options: {
  storage: Storage
  language: string
  entries: TextCatalogEntry[]
  reason?: string
  now?: string
}): CoreTtsCatalogOutput | null {
  const language = normalizeLocale(options.language)
  const current = getCoreTtsCatalog(options.storage, language)
  if (!current) return null

  const now = options.now ?? new Date().toISOString()
  const currentById = new Map(current.entries.map((entry) => [entry.id, entry]))
  const entries = options.entries.map((displayEntry): CoreTtsCatalogEntry => {
    const previous = currentById.get(displayEntry.id)
    if (previous?.displayText === displayEntry.text) return previous

    return {
      id: displayEntry.id,
      displayText: displayEntry.text,
      speechText: null,
      changed: false,
      transformations: previous?.transformations ?? [],
      status: "failed",
      failureReason:
        options.reason ?? "Display text changed; rerun Core TTS preparation.",
      generation: {
        mode: "unchanged",
        generatedAt: now,
        profileKey: previous?.generation.profileKey,
        profileGuidance: previous?.generation.profileGuidance,
        enabledTransformations:
          previous?.generation.enabledTransformations ?? [],
        sourceTextHash: hash(displayEntry.text),
        contextHash: hash({ displayText: displayEntry.text, stale: true }),
        cached: false,
      },
    }
  })
  const output = CoreTtsCatalogOutputSchema.parse({
    language,
    entries,
    generatedAt: now,
  })
  options.storage.putNodeData("core-tts-catalog", language, output)
  return output
}

/**
 * Withhold selected provider-text entries in every language while preserving
 * unaffected entries and version history. Used by partial upstream edits whose
 * translated replacements do not exist until the Translate stage is rerun.
 */
export function invalidateCoreTtsEntriesById(options: {
  storage: Storage
  textIds: ReadonlySet<string>
  reason?: string
  now?: string
}): number {
  if (options.textIds.size === 0) return 0

  const now = options.now ?? new Date().toISOString()
  const reason = options.reason ?? "Display text changed; rerun Core TTS preparation."
  let updatedCatalogs = 0

  for (const { node, itemId } of options.storage.getNodeVersionFingerprint()) {
    if (node !== "core-tts-catalog") continue
    const row = options.storage.getLatestNodeData(node, itemId)
    const parsed = CoreTtsCatalogOutputSchema.safeParse(row?.data)
    if (!parsed.success) continue

    let changed = false
    const entries = parsed.data.entries.map((entry): CoreTtsCatalogEntry => {
      if (!options.textIds.has(entry.id)) return entry
      changed = true
      return {
        ...entry,
        speechText: null,
        changed: false,
        status: "failed",
        failureReason: reason,
        generation: {
          ...entry.generation,
          mode: "unchanged",
          generatedAt: now,
          contextHash: hash({
            previousContextHash: entry.generation.contextHash,
            stale: true,
            reason,
          }),
          cached: false,
        },
      }
    })
    if (!changed) continue

    options.storage.putNodeData(
      "core-tts-catalog",
      itemId,
      CoreTtsCatalogOutputSchema.parse({
        ...parsed.data,
        entries,
        generatedAt: now,
      }),
    )
    updatedCatalogs++
  }

  return updatedCatalogs
}
