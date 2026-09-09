import { z } from "zod"

export const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/
export const MODEL_PART_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/

export const LEGACY_UNPREFIXED_PROVIDER_ID = "openai"

export const ProviderId = z
  .string()
  .trim()
  .regex(PROVIDER_ID_PATTERN, "invalid provider id")
export type ProviderId = z.infer<typeof ProviderId>

export const AI_MODALITIES = [
  "structured-text",
  "agent",
  "image",
  "tts",
  "stt",
] as const
export const AiModality = z.enum(AI_MODALITIES)
export type AiModality = z.infer<typeof AiModality>

export const STRUCTURED_OUTPUT_STRATEGIES = [
  "native-schema",
  "json-mode",
  "tool-call",
  "parse-repair",
] as const
export const StructuredOutputStrategy = z.enum(STRUCTURED_OUTPUT_STRATEGIES)
export type StructuredOutputStrategy = z.infer<typeof StructuredOutputStrategy>

export interface ParsedModelId {
  providerId: string
  modelId: string
  qualified: string
  usedLegacyDefault: boolean
}

export type ParseModelIdResult =
  | { ok: true; value: ParsedModelId }
  | { ok: false; error: string }

/**
 * Splits at the FIRST colon and normalizes only the provider — model ids stay
 * case-sensitive because Azure and self-hosted runtimes expose case-sensitive
 * deployment names, and may themselves contain `:` (e.g. `llama3.1:8b`).
 */
export function safeParseModelId(
  raw: string,
  options: { defaultProviderId?: string } = {},
): ParseModelIdResult {
  if (typeof raw !== "string") return { ok: false, error: "model id must be a string" }
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: "model id must not be empty" }

  const colonIdx = trimmed.indexOf(":")
  const usedLegacyDefault = colonIdx < 0
  const rawProvider = usedLegacyDefault
    ? (options.defaultProviderId ?? LEGACY_UNPREFIXED_PROVIDER_ID)
    : trimmed.slice(0, colonIdx)
  const modelPart = usedLegacyDefault ? trimmed : trimmed.slice(colonIdx + 1)

  const providerId = rawProvider.trim().toLowerCase()
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    return { ok: false, error: `invalid provider id: "${rawProvider}"` }
  }
  if (!MODEL_PART_PATTERN.test(modelPart)) {
    return { ok: false, error: `invalid model id: "${modelPart}"` }
  }

  return {
    ok: true,
    value: {
      providerId,
      modelId: modelPart,
      qualified: `${providerId}:${modelPart}`,
      usedLegacyDefault,
    },
  }
}

export function parseModelId(
  raw: string,
  options: { defaultProviderId?: string } = {},
): ParsedModelId {
  const parsed = safeParseModelId(raw, options)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.value
}

export function isValidModelId(raw: string): boolean {
  return safeParseModelId(raw).ok
}

export function normalizeModelId(
  raw: string,
  options: { defaultProviderId?: string } = {},
): string {
  return parseModelId(raw, options).qualified
}

export const QualifiedModelId = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const parsed = safeParseModelId(value)
    if (!parsed.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error })
      return z.NEVER
    }
    return parsed.value.qualified
  })
export type QualifiedModelId = z.infer<typeof QualifiedModelId>

/**
 * Model ids are opaque and may contain `/`, `.` and `:` — never interpolate one
 * into a filesystem path directly.
 */
export function sanitizeModelIdForPath(modelId: string): string {
  return modelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}
