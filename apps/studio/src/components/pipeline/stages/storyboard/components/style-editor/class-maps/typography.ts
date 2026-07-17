/* eslint-disable lingui/no-unlocalized-strings -- Tailwind class identifiers, not user copy */

import type { ClassMap } from "./types"
import { makeColorClassMap } from "./_color"

const FONT_FAMILY_VALUES = ["sans", "serif", "mono"]

export const fontFamilyClassMap: ClassMap<string> = {
  matches: (cls) => /^font-(sans|serif|mono)$/.test(cls),
  fromClasses(classes) {
    let last: string | null = null
    for (const cls of classes) {
      const m = cls.match(/^font-(.+)$/)
      if (m && FONT_FAMILY_VALUES.includes(m[1])) last = m[1]
    }
    return last
  },
  toClasses(value) {
    if (!FONT_FAMILY_VALUES.includes(value)) return []
    return [`font-${value}`]
  },
}

const FONT_WEIGHT_VALUES = [
  "thin",
  "extralight",
  "light",
  "normal",
  "medium",
  "semibold",
  "bold",
  "extrabold",
  "black",
]

export const fontWeightClassMap: ClassMap<string> = {
  matches: (cls) =>
    /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(
      cls
    ),
  fromClasses(classes) {
    let last: string | null = null
    for (const cls of classes) {
      const m = cls.match(/^font-(.+)$/)
      if (m && FONT_WEIGHT_VALUES.includes(m[1])) last = m[1]
    }
    return last
  },
  toClasses(value) {
    if (!FONT_WEIGHT_VALUES.includes(value)) return []
    return [`font-${value}`]
  },
}

// Tailwind's default text-size scale, in px (1rem = 16px).
const FONT_SIZE_TOKENS: ReadonlyArray<readonly [string, number]> = [
  ["xs", 12],
  ["sm", 14],
  ["base", 16],
  ["lg", 18],
  ["xl", 20],
  ["2xl", 24],
  ["3xl", 30],
  ["4xl", 36],
  ["5xl", 48],
  ["6xl", 60],
  ["7xl", 72],
  ["8xl", 96],
  ["9xl", 128],
]
const FONT_SIZE_TOKEN_TO_PX = new Map<string, number>(FONT_SIZE_TOKENS)
const FONT_SIZE_PX_TO_TOKEN = new Map<number, string>(
  FONT_SIZE_TOKENS.map(([t, px]) => [px, t])
)

export const FONT_SIZE_TOKEN_LIST: ReadonlyArray<{
  label: string
  value: number
}> = FONT_SIZE_TOKENS.map(([label, value]) => ({ label, value }))

const LINE_HEIGHT_CLASS_RE =
  /^leading-(none|tight|snug|normal|relaxed|loose|\[[\d.]+\])$/

// Size also matches leading-* classes: `leading-*` sets `--tw-leading`, which
// always outranks a text-* token's own line-height, so applying a size must
// strip stale leading classes for the token's natural leading to take effect.
export const fontSizeClassMap: ClassMap<number> = {
  matches: (cls) =>
    /^text-(xs|sm|base|lg|xl|[2-9]xl|\[[\d.]+(?:px|rem|em)\])$/.test(cls) ||
    LINE_HEIGHT_CLASS_RE.test(cls),
  fromClasses(classes) {
    let last: number | null = null
    for (const cls of classes) {
      const m = cls.match(/^text-(.+)$/)
      if (!m) continue
      const token = m[1]
      const namedPx = FONT_SIZE_TOKEN_TO_PX.get(token)
      if (namedPx !== undefined) {
        last = namedPx
        continue
      }
      const arb = token.match(/^\[([\d.]+)(px|rem|em)\]$/)
      if (arb) {
        const n = Number(arb[1])
        if (Number.isFinite(n)) {
          last = arb[2] === "px" ? n : n * 16
        }
      }
    }
    return last
  },
  toClasses(value) {
    if (!Number.isFinite(value) || value <= 0) return []
    const namedToken = FONT_SIZE_PX_TO_TOKEN.get(value)
    if (namedToken) return [`text-${namedToken}`]
    return [`text-[${value}px]`]
  },
}

const TEXT_ALIGN_VALUES = ["left", "center", "right", "justify", "start", "end"]

export const textAlignClassMap: ClassMap<string> = {
  matches: (cls) =>
    /^text-(left|center|right|justify|start|end)$/.test(cls),
  fromClasses(classes) {
    let last: string | null = null
    for (const cls of classes) {
      const m = cls.match(/^text-(.+)$/)
      if (m && TEXT_ALIGN_VALUES.includes(m[1])) last = m[1]
    }
    return last
  },
  toClasses(value) {
    if (!TEXT_ALIGN_VALUES.includes(value)) return []
    return [`text-${value}`]
  },
}

const LEADING_TOKENS: ReadonlyArray<readonly [string, number]> = [
  ["none", 1],
  ["tight", 1.25],
  ["snug", 1.375],
  ["normal", 1.5],
  ["relaxed", 1.625],
  ["loose", 2],
]
const LEADING_TOKEN_TO_VALUE = new Map<string, number>(LEADING_TOKENS)
const LEADING_VALUE_TO_TOKEN = new Map<number, string>(
  LEADING_TOKENS.map(([t, v]) => [v, t])
)

export const lineHeightClassMap: ClassMap<number> = {
  matches: (cls) => LINE_HEIGHT_CLASS_RE.test(cls),
  fromClasses(classes) {
    let last: number | null = null
    for (const cls of classes) {
      const m = cls.match(/^leading-(.+)$/)
      if (!m) continue
      const token = m[1]
      const named = LEADING_TOKEN_TO_VALUE.get(token)
      if (named !== undefined) {
        last = named
        continue
      }
      const arb = token.match(/^\[([\d.]+)\]$/)
      if (arb) {
        const n = Number(arb[1])
        if (Number.isFinite(n)) last = n
      }
    }
    return last
  },
  toClasses(value) {
    if (!Number.isFinite(value) || value <= 0) return []
    const namedToken = LEADING_VALUE_TO_TOKEN.get(value)
    if (namedToken) return [`leading-${namedToken}`]
    return [`leading-[${value}]`]
  },
}

const DECOR_TOKENS = new Set([
  "italic",
  "not-italic",
  "underline",
  "line-through",
  "no-underline",
])

const COMBINED_DECOR_CLASS = "[text-decoration-line:underline_line-through]"

// Multi-select: any subset of {"italic","underline","strike"}.
// Note: `underline` and `line-through` both set `text-decoration-line`, so the
// browser only honors one when both classes are present. To render both at
// once we emit a single arbitrary-value class that sets the property to
// `underline line-through`.
export const textDecorationClassMap: ClassMap<string[]> = {
  matches: (cls) => DECOR_TOKENS.has(cls) || cls === COMBINED_DECOR_CLASS,
  fromClasses(classes) {
    const out: string[] = []
    let hasUnderline = false
    let hasStrike = false
    for (const cls of classes) {
      if (cls === "italic") out.push("italic")
      else if (cls === "underline") hasUnderline = true
      else if (cls === "line-through") hasStrike = true
      else if (cls === COMBINED_DECOR_CLASS) {
        hasUnderline = true
        hasStrike = true
      }
    }
    if (hasUnderline) out.push("underline")
    if (hasStrike) out.push("strike")
    return out.length > 0 ? out : null
  },
  toClasses(value) {
    const out: string[] = []
    if (value.includes("italic")) out.push("italic")
    const hasUnderline = value.includes("underline")
    const hasStrike = value.includes("strike")
    if (hasUnderline && hasStrike) out.push(COMBINED_DECOR_CLASS)
    else if (hasUnderline) out.push("underline")
    else if (hasStrike) out.push("line-through")
    return out
  },
}

export const textColorClassMap = makeColorClassMap("text")
