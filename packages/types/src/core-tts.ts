import { z } from "zod"

export const CoreTtsTransformationKind = z.enum([
  "latex-to-speech",
  "language-normalization",
])
export type CoreTtsTransformationKind = z.infer<typeof CoreTtsTransformationKind>

export const CoreTtsEntryStatus = z.enum(["ready", "failed"])
export type CoreTtsEntryStatus = z.infer<typeof CoreTtsEntryStatus>

export const CoreTtsGenerationMode = z.enum(["generated", "manual", "unchanged"])
export type CoreTtsGenerationMode = z.infer<typeof CoreTtsGenerationMode>

/** Inspectable provenance for the text handed to a TTS provider. */
export const CoreTtsGenerationMetadata = z.object({
  mode: CoreTtsGenerationMode,
  generatedAt: z.string(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  profileKey: z.string().optional(),
  profileGuidance: z.string().optional(),
  enabledTransformations: z.array(CoreTtsTransformationKind),
  sourceTextHash: z.string(),
  contextHash: z.string(),
  cached: z.boolean().optional(),
})
export type CoreTtsGenerationMetadata = z.infer<typeof CoreTtsGenerationMetadata>

/**
 * Display text paired with independently editable provider text. Failed LaTeX
 * conversions intentionally carry no speech text, so raw notation cannot be
 * sent silently to a provider.
 */
export const CoreTtsCatalogEntry = z.object({
  id: z.string(),
  displayText: z.string(),
  speechText: z.string().nullable(),
  changed: z.boolean(),
  transformations: z.array(CoreTtsTransformationKind),
  status: CoreTtsEntryStatus,
  failureReason: z.string().optional(),
  generation: CoreTtsGenerationMetadata,
})
export type CoreTtsCatalogEntry = z.infer<typeof CoreTtsCatalogEntry>

export const CoreTtsCatalogOutput = z.object({
  language: z.string(),
  entries: z.array(CoreTtsCatalogEntry),
  generatedAt: z.string(),
})
export type CoreTtsCatalogOutput = z.infer<typeof CoreTtsCatalogOutput>

export const CoreTtsConfig = z.object({
  model: z.string().optional(),
  prompt: z.string().optional(),
  max_retries: z.number().int().min(0).optional(),
  batch_size: z.number().int().min(1).max(200).optional(),
  latex_to_speech: z.boolean().optional(),
  language_normalization: z.boolean().optional(),
})
export type CoreTtsConfig = z.infer<typeof CoreTtsConfig>

const LATEX_COMMAND = /\\[a-zA-Z]+|[_^]\{/
const UNESCAPED_DOLLAR = /(?<!\\)\$/g
const MATH_OPERATOR =
  /[=+*/<>]|[\p{L}\p{N})\]]\s*[-−]\s*[\p{L}\p{N}(\[]/u
const PATH_LIKE = /(?:[A-Za-z]:\\)|(?:\\\\[A-Za-z])/
const MARKER_ONLY = /(?<!\\)\$\s*[\^_]\s*\{?[\d\s,*†‡§¶a-z]{0,8}\}?\s*\$/gi
const LATEX_REFERENCE =
  /(?:\b(?:latex|command)\b[^\n]*\\[a-zA-Z]+)|(?:\\[a-zA-Z]+[^\n]*\b(?:latex|command)\b)/i

function containsDollarDelimitedMath(text: string): boolean {
  const dollarIndices = Array.from(
    text.matchAll(UNESCAPED_DOLLAR),
    (match) => match.index ?? 0,
  )

  for (let index = 0; index < dollarIndices.length - 1; index++) {
    const content = text
      .slice(dollarIndices[index] + 1, dollarIndices[index + 1])
      .trim()
    if (!content) continue

    // Compact expressions such as `$x$` and `$1/2$`, plus expressions with
    // spaced operators, are math. Currency pairs enclose ordinary prose and
    // therefore do not satisfy either condition.
    if (!/\s/u.test(content) || MATH_OPERATOR.test(content)) return true
  }

  return false
}

/**
 * Conservative deterministic gate for LaTeX preparation. It retains the
 * false-positive protections found in PR #638: paths, currency pairs,
 * affiliation markers, and prose that teaches LaTeX syntax.
 */
export function containsLatexSpeechCandidate(
  text: string | null | undefined,
): boolean {
  if (!text) return false
  if (PATH_LIKE.test(text) || LATEX_REFERENCE.test(text)) return false
  const stripped = text.replace(MARKER_ONLY, " ")
  return LATEX_COMMAND.test(stripped) || containsDollarDelimitedMath(stripped)
}
