import { FONT_SIZE_TOKEN_LIST } from "@/components/pipeline/stages/storyboard/components/style-editor/class-maps"

export const TEXT_SIZES_PX: readonly number[] = FONT_SIZE_TOKEN_LIST.map((token) => token.value)

const SIZE_TOLERANCE = 0.5

export function stepTextSize(current: number, direction: 1 | -1): number | null {
  if (direction > 0) return TEXT_SIZES_PX.find((px) => px > current + SIZE_TOLERANCE) ?? null
  for (let index = TEXT_SIZES_PX.length - 1; index >= 0; index--) {
    if (TEXT_SIZES_PX[index] < current - SIZE_TOLERANCE) return TEXT_SIZES_PX[index]
  }
  return null
}

export type LineSpacing = "tight" | "normal" | "relaxed" | "loose"
export const LINE_SPACING: Record<LineSpacing, number> = { tight: 1.25, normal: 1.5, relaxed: 1.625, loose: 2 }

export type Step = "none" | "small" | "medium" | "large"
export const SPACE_BELOW_PX: Record<Step, number> = { none: 0, small: 8, medium: 16, large: 32 }
export const PADDING_PX: Record<Step, number> = { none: 0, small: 8, medium: 16, large: 32 }

export type ImageSize = "small" | "medium" | "large" | "full"
export const IMAGE_WIDTH: Record<ImageSize, string> = { small: "33", medium: "50", large: "75", full: "100" }

export const CORNER_PX: Record<Step, number> = { none: 0, small: 6, medium: 12, large: 24 }

export function keyFor<K extends string>(
  table: Record<K, number | string>,
  value: number | string | null | undefined,
  tolerance = 0,
): K | null {
  if (value === null || value === undefined) return null
  for (const [key, entry] of Object.entries(table) as Array<[K, number | string]>) {
    if (typeof entry === "number" && typeof value === "number" ? Math.abs(entry - value) <= tolerance : entry === value) {
      return key
    }
  }
  return null
}

const BOLD_WEIGHTS = new Set(["semibold", "bold", "extrabold", "black"])

export function isBold(weight: string | null | undefined): boolean {
  return !!weight && BOLD_WEIGHTS.has(weight)
}

export function toggleToken(tokens: readonly string[], token: string): string[] {
  return tokens.includes(token) ? tokens.filter((value) => value !== token) : [...tokens, token]
}

export interface Box {
  t: number
  r: number
  b: number
  l: number
}

export function uniformBox(px: number): Box {
  return { t: px, r: px, b: px, l: px }
}

export function uniformValue(box: Box | null): number | null {
  if (!box) return null
  return box.t === box.r && box.r === box.b && box.b === box.l ? box.t : null
}

export function primaryFamily(chain: string | null | undefined): string | null {
  if (!chain) return null
  const first = chain.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "")
  return first || null
}

export function dedupeFontChain(chain: string): string {
  const seen = new Set<string>()
  return chain
    .split(",")
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.replace(/^['"]|['"]$/g, "").toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(",")
}

const FONT_FAMILY_IN_HTML = /font-family\s*:\s*((?:&quot;|[^;"<>])+)/gi

export function fontFamiliesInHtml(html: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const chunk of html) {
    for (const match of chunk.matchAll(FONT_FAMILY_IN_HTML)) {
      const family = primaryFamily(match[1].replace(/&quot;/g, '"'))
      if (family && !/^(serif|sans-serif|monospace|cursive|system-ui|inherit)$/i.test(family)) seen.add(family)
    }
  }
  return [...seen]
}
