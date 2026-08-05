/* eslint-disable lingui/no-unlocalized-strings -- Tailwind class identifiers, not user copy */

import type { BoxValue } from "../controls/BoxInput"
import type { ClassMap } from "./types"

// Tailwind v3.4 / v4 default spacing scale, px ↔ token. Shared by the inset
// (top/right/bottom/left) and translate maps. Off-scale values fall back to
// arbitrary classes (`top-[13px]`). The sign is always carried by a `-`
// prefix on the utility (`-top-4`), so these helpers only deal in magnitudes.
const SPACING_TOKENS: ReadonlyArray<readonly [number, string]> = [
  [0, "0"], [2, "0.5"], [4, "1"], [6, "1.5"], [8, "2"], [10, "2.5"],
  [12, "3"], [14, "3.5"], [16, "4"], [20, "5"], [24, "6"], [28, "7"],
  [32, "8"], [36, "9"], [40, "10"], [44, "11"], [48, "12"], [56, "14"],
  [64, "16"], [80, "20"], [96, "24"], [112, "28"], [128, "32"], [144, "36"],
  [160, "40"], [176, "44"], [192, "48"], [208, "52"], [224, "56"], [240, "60"],
  [256, "64"], [288, "72"], [320, "80"], [384, "96"],
]
const PX_TO_TOKEN = new Map<number, string>(SPACING_TOKENS)
const TOKEN_TO_PX = new Map<string, number>(
  SPACING_TOKENS.map(([px, token]) => [token, px])
)

/** Positive magnitude px → Tailwind spacing token (or arbitrary `[Npx]`). */
function pxToToken(px: number): string {
  const exact = PX_TO_TOKEN.get(px)
  if (exact !== undefined) return exact
  return `[${px}px]`
}

/** Tailwind spacing token → px. Handles the scale plus arbitrary `[Npx]`/
 *  `[Nrem]` (which may carry their own sign). Returns null for anything else
 *  (fractions like `1/2`, `full`, `auto`), which the numeric controls skip. */
function tokenToPx(token: string): number | null {
  const fromTable = TOKEN_TO_PX.get(token)
  if (fromTable !== undefined) return fromTable
  const arbitrary = token.match(/^\[(-?[\d.]+)(px|rem)\]$/)
  if (!arbitrary) return null
  const n = Number(arbitrary[1])
  if (!Number.isFinite(n)) return null
  return arbitrary[2] === "rem" ? n * 16 : n
}

// ---------------------------------------------------------------------------
// position — the CSS `position` property (static/relative/absolute/fixed/sticky)
// ---------------------------------------------------------------------------

const POSITION_VALUES = ["static", "relative", "absolute", "fixed", "sticky"]

export const positionClassMap: ClassMap<string> = {
  matches: (cls) => POSITION_VALUES.includes(cls),
  fromClasses(classes) {
    let last: string | null = null
    for (const cls of classes) {
      if (POSITION_VALUES.includes(cls)) last = cls
    }
    return last
  },
  // `static` is the CSS default, so emit nothing for it (removes any class).
  toClasses(value) {
    return value && value !== "static" ? [value] : []
  },
}

// ---------------------------------------------------------------------------
// inset — top/right/bottom/left offsets, in px, negatives allowed. Reads the
// full cascade (`inset-*`, `inset-x-*`, `inset-y-*`, and per-side) and writes
// the most compact form.
// ---------------------------------------------------------------------------

const INSET_RE = /^(-?)(inset-x|inset-y|inset|top|right|bottom|left)-(.+)$/

// Only match inset utilities this px control can actually represent (spacing
// tokens and arbitrary px/rem). Utilities we can't model — Tailwind v4's
// `inset-ring-*`/`inset-shadow-*`, and fraction/keyword insets like `top-1/2`
// or `left-auto` used by the centered-absolute idiom — are left untouched so
// editing a px offset never silently strips them.
function insetToken(cls: string): string | null {
  const m = cls.match(INSET_RE)
  if (!m || tokenToPx(m[3]) === null) return null
  return m[3]
}

function insetClass(name: string, px: number): string {
  const sign = px < 0 ? "-" : ""
  return `${sign}${name}-${pxToToken(Math.abs(px))}`
}

export const insetClassMap: ClassMap<BoxValue> = {
  matches: (cls) => insetToken(cls) !== null,

  fromClasses(classes) {
    let result: BoxValue | null = null
    for (const cls of classes) {
      const m = cls.match(INSET_RE)
      if (!m) continue
      const [, sign, side, token] = m
      const magnitude = tokenToPx(token)
      if (magnitude === null) continue
      const px = sign === "-" ? -magnitude : magnitude
      if (!result) result = { t: 0, r: 0, b: 0, l: 0 }
      switch (side) {
        case "inset":
          result.t = px
          result.r = px
          result.b = px
          result.l = px
          break
        case "inset-x":
          result.l = px
          result.r = px
          break
        case "inset-y":
          result.t = px
          result.b = px
          break
        case "top":
          result.t = px
          break
        case "right":
          result.r = px
          break
        case "bottom":
          result.b = px
          break
        case "left":
          result.l = px
          break
      }
    }
    return result
  },

  toClasses(value) {
    const { t, r, b, l } = value
    if (t === 0 && r === 0 && b === 0 && l === 0) return []
    if (t === r && r === b && b === l) return [insetClass("inset", t)]
    if (t === b && l === r) {
      const parts: string[] = []
      if (l !== 0 || r !== 0) parts.push(insetClass("inset-x", l))
      if (t !== 0 || b !== 0) parts.push(insetClass("inset-y", t))
      return parts
    }
    const parts: string[] = []
    if (t !== 0) parts.push(insetClass("top", t))
    if (r !== 0) parts.push(insetClass("right", r))
    if (b !== 0) parts.push(insetClass("bottom", b))
    if (l !== 0) parts.push(insetClass("left", l))
    return parts
  },
}

// ---------------------------------------------------------------------------
// rotate — degrees, normalized to 0..359. Multiples of 90 use the readable
// Tailwind classes (`rotate-90`, `rotate-180`, `-rotate-90`); anything else
// falls back to an arbitrary `rotate-[Ndeg]`.
// ---------------------------------------------------------------------------

const ROTATE_RE = /^(-?)rotate-(\[[^\]]+\]|\d+(?:\.\d+)?)$/

function normalizeDeg(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360
}

export const rotateClassMap: ClassMap<number> = {
  matches: (cls) => ROTATE_RE.test(cls),
  fromClasses(classes) {
    let last: number | null = null
    for (const cls of classes) {
      const m = cls.match(ROTATE_RE)
      if (!m) continue
      const [, sign, token] = m
      let n: number | null = null
      const arbitrary = token.match(/^\[(-?[\d.]+)deg\]$/)
      if (arbitrary) n = Number(arbitrary[1])
      else if (/^\d+(?:\.\d+)?$/.test(token)) n = Number(token)
      if (n === null || !Number.isFinite(n)) continue
      last = normalizeDeg(sign === "-" ? -n : n)
    }
    return last
  },
  toClasses(value) {
    const d = normalizeDeg(value)
    if (d === 0) return []
    if (d === 90) return ["rotate-90"]
    if (d === 180) return ["rotate-180"]
    if (d === 270) return ["-rotate-90"]
    return [`rotate-[${d}deg]`]
  },
}

// ---------------------------------------------------------------------------
// translate — X/Y transform offsets in px, negatives allowed. Compose with
// rotate/scale because every Tailwind transform utility emits the full
// `transform` chain.
// ---------------------------------------------------------------------------

function makeTranslateClassMap(axis: "x" | "y"): ClassMap<number> {
  const re = new RegExp(`^(-?)translate-${axis}-(.+)$`)
  return {
    // Only match px-representable translates; leave `translate-x-full`,
    // `translate-x-1/2` (centering idiom), etc. untouched on edit.
    matches: (cls) => {
      const m = cls.match(re)
      return m !== null && tokenToPx(m[2]) !== null
    },
    fromClasses(classes) {
      let last: number | null = null
      for (const cls of classes) {
        const m = cls.match(re)
        if (!m) continue
        const magnitude = tokenToPx(m[2])
        if (magnitude === null) continue
        last = m[1] === "-" ? -magnitude : magnitude
      }
      return last
    },
    toClasses(value) {
      if (value === 0) return []
      const sign = value < 0 ? "-" : ""
      return [`${sign}translate-${axis}-${pxToToken(Math.abs(value))}`]
    },
  }
}

export const translateXClassMap = makeTranslateClassMap("x")
export const translateYClassMap = makeTranslateClassMap("y")

// ---------------------------------------------------------------------------
// scale — uniform scale as a percentage (100 = no scaling). Known Tailwind
// steps use their token (`scale-110`); others fall back to `scale-[1.7]`.
// ---------------------------------------------------------------------------

const SCALE_TOKENS = new Set([0, 50, 75, 90, 95, 100, 105, 110, 125, 150])
const SCALE_RE = /^scale-(\[[^\]]+\]|\d+)$/

export const scaleClassMap: ClassMap<number> = {
  matches: (cls) => SCALE_RE.test(cls),
  fromClasses(classes) {
    let last: number | null = null
    for (const cls of classes) {
      const m = cls.match(SCALE_RE)
      if (!m) continue
      const token = m[1]
      const arbitrary = token.match(/^\[([\d.]+)\]$/)
      if (arbitrary) {
        const n = Number(arbitrary[1])
        if (Number.isFinite(n)) last = Math.round(n * 100)
      } else if (/^\d+$/.test(token)) {
        last = Number(token)
      }
    }
    return last
  },
  toClasses(value) {
    if (value === 100) return []
    if (SCALE_TOKENS.has(value)) return [`scale-${value}`]
    return [`scale-[${value / 100}]`]
  },
}
