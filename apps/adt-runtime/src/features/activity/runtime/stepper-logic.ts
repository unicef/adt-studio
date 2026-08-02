/**
 * Pure logic for the step-by-step (stepper) activity renderer — kept free of
 * React/DOM so it can be unit-tested directly.
 *
 * The payload shape is produced by `packages/pipeline/src/render-editable-activity.ts`
 * and embedded in the section shell as `<script type="application/json"
 * data-editable-activity>`. Types come from `@adt/types` (type-only import —
 * nothing from the workspace package lands in the bundle).
 */
import type {
  ActivityText,
  EditableActivity,
  FitbBlank,
  FitbSentence,
  FitbStep,
  McStep,
  UnderlineStep,
} from "@adt/types"

export interface StepperPalette {
  surface: string
  ink: string
  accent: string
  accentSoft: string
  headerText: string
  body: string
  optionFill: string
  submit: string
  submitText: string
  optionText: string
  selectedText: string
}

export interface StepperPayload {
  activity: EditableActivity
  palette: StepperPalette
}

/** Mirrors BLANK_MARKER_RE in @adt/types (value imports would bundle zod). */
const MARKER_RE = /\[\[blank:(item-\d+)(?::([^\]]+))?\]\]/g

export type SentencePart =
  | { type: "text"; text: string }
  | { type: "blank"; itemId: string; hint?: string }

export function parseSentenceParts(text: string): SentencePart[] {
  const parts: SentencePart[] = []
  let last = 0
  for (const m of text.matchAll(MARKER_RE)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push({ type: "text", text: text.slice(last, idx) })
    parts.push({ type: "blank", itemId: m[1], hint: m[2] })
    last = idx + m[0].length
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) })
  return parts
}

export function markerCount(text: string): number {
  return [...text.matchAll(MARKER_RE)].length
}

/** Translated text for a dataId-carrying string, falling back to the stored
 *  source text. */
export function resolveText(
  t: ActivityText | undefined,
  dict: Record<string, string>,
): string {
  if (!t) return ""
  if (t.dataId && dict[t.dataId]) return dict[t.dataId]
  return t.text
}

/** Sentence text for rendering: prefer the translation, but only when it kept
 *  the same blank markers (a translation that lost markers would remove the
 *  inputs). */
export function resolveSentenceText(
  sentence: FitbSentence,
  dict: Record<string, string>,
): string {
  const translated = sentence.dataId ? dict[sentence.dataId] : undefined
  if (translated && markerCount(translated) === markerCount(sentence.text)) {
    return translated
  }
  return sentence.text
}

/** Blanks not referenced by any `[[blank:item-N]]` marker in the step's
 *  sentences — form-style answer fields rendered on their own line (image +
 *  label + input steps). */
export function standaloneBlanks(step: FitbStep): FitbBlank[] {
  const markerIds = new Set(
    step.sentences.flatMap((s) => [...s.text.matchAll(MARKER_RE)].map((m) => m[1])),
  )
  return step.blanks.filter((b) => !markerIds.has(b.itemId))
}

/** Same normalization the classic FITB runtime applies. Empty answer list =
 *  accept any non-empty input. */
export function isBlankCorrect(value: string, answers: string[]): boolean {
  const v = value.trim().toLowerCase()
  if (v === "") return false
  if (answers.length === 0) return true
  return answers.some((a) => a.trim().toLowerCase() === v)
}

/** Input width in `ch`, mirroring the classic hydrator's heuristic. */
export function blankWidthCh(answers: string[], hint?: string): number {
  if (hint) return Math.max(hint.length + 2, 6)
  const longest = answers.reduce((max, a) => Math.max(max, a.length), 0)
  if (longest > 0) return Math.max(longest + 1, 2)
  return 8
}

export function isMcStepCorrect(step: McStep, selectedItemId: string | null): boolean {
  if (!selectedItemId) return false
  return step.options.some((o) => o.itemId === selectedItemId && o.correct)
}

/** Underline step is correct when the selected words match the answer key
 *  exactly: every word that should be underlined is selected, and none that
 *  shouldn't. Plain (non-selectable) tokens are ignored. */
export function isUnderlineStepCorrect(step: UnderlineStep, selected: Iterable<string>): boolean {
  const sel = new Set(selected)
  return step.tokens.every((t) => !t.itemId || sel.has(t.itemId) === Boolean(t.correct))
}

/**
 * Stage (image area) height for an activity. The configured height is an
 * upper bound; when every image in the activity is small, the stage shrinks
 * to the largest image's display height (≤2× natural pixels — upscaling
 * beyond that turns raster art to mush) so it doesn't reserve empty space
 * that pushes the answer field and controls below the fold. Floored so the
 * layout never collapses around icon-sized images.
 */
export const STAGE_MIN_HEIGHT = 120
export const IMAGE_UPSCALE_CAP = 2

export function clampStageHeight(configured: number, naturalHeights: number[]): number {
  const usable = naturalHeights.filter((n) => n > 0)
  if (usable.length === 0) return configured
  const tallest = Math.max(...usable.map((n) => n * IMAGE_UPSCALE_CAP))
  return Math.max(STAGE_MIN_HEIGHT, Math.min(configured, tallest))
}

// ---------------------------------------------------------------------------
// Color — WCAG contrast helpers for the accent color
// ---------------------------------------------------------------------------

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function luminance(rgb: { r: number; g: number; b: number }): number {
  const chan = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b)
}

export function contrastOnWhite(hex: string): number {
  const rgb = parseHex(hex)
  if (!rgb) return 0
  return 1.05 / (luminance(rgb) + 0.05)
}

/**
 * Darken the accent (mix toward black) until it reads at ≥4.5:1 on white —
 * book accents are often mid-tone (pink, orange) and fail AA as text/UI color.
 * Falls back to a dark neutral if the accent can't be parsed.
 */
export function readableOnWhite(hex: string): string {
  const rgb = parseHex(hex)
  if (!rgb) return "#1F2937"
  for (let mix = 0; mix <= 1; mix += 0.05) {
    const mixed = {
      r: Math.round(rgb.r * (1 - mix)),
      g: Math.round(rgb.g * (1 - mix)),
      b: Math.round(rgb.b * (1 - mix)),
    }
    if (1.05 / (luminance(mixed) + 0.05) >= 4.5) {
      const toHex = (v: number) => v.toString(16).padStart(2, "0")
      return `#${toHex(mixed.r)}${toHex(mixed.g)}${toHex(mixed.b)}`
    }
  }
  return "#1F2937"
}

export function parseStepperPayload(raw: string): StepperPayload | null {
  try {
    const parsed = JSON.parse(raw) as StepperPayload
    if (!parsed || typeof parsed !== "object") return null
    if (!parsed.activity || !Array.isArray(parsed.activity.steps)) return null
    if (parsed.activity.steps.length === 0) return null
    if (!parsed.palette || typeof parsed.palette.accent !== "string") return null
    return parsed
  } catch {
    return null
  }
}
