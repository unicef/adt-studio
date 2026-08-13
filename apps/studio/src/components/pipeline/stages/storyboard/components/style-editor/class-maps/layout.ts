import type { ClassMap } from "./types"

// Tailwind v3.4 / v4 default spacing scale; gap reuses it (`gap-4` = 16px).
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

const DISPLAY_VALUES = [
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "hidden",
  "flow-root",
  "contents",
  "table",
  "table-row",
  "table-cell",
]

export const displayClassMap: ClassMap<string> = {
  matches: (cls) => DISPLAY_VALUES.includes(cls),
  fromClasses(classes) {
    let last: string | null = null
    for (const cls of classes) {
      if (DISPLAY_VALUES.includes(cls)) last = cls
    }
    return last
  },
  toClasses(value) {
    return value ? [value] : []
  },
}

const FLEX_DIRECTION_VALUES = ["row", "row-reverse", "col", "col-reverse"]

export const flexDirectionClassMap: ClassMap<string> = {
  matches: (cls) => /^flex-(row|row-reverse|col|col-reverse)$/.test(cls),
  fromClasses(classes) {
    let last: string | null = null
    for (const cls of classes) {
      const m = cls.match(/^flex-(.+)$/)
      if (m && FLEX_DIRECTION_VALUES.includes(m[1])) last = m[1]
    }
    return last
  },
  toClasses(value) {
    if (!FLEX_DIRECTION_VALUES.includes(value)) return []
    return [`flex-${value}`]
  },
}

const JUSTIFY_VALUES = ["start", "center", "end", "between", "around", "evenly"]

export const justifyContentClassMap: ClassMap<string> = {
  matches: (cls) => /^justify-(start|center|end|between|around|evenly)$/.test(cls),
  fromClasses(classes) {
    let last: string | null = null
    for (const cls of classes) {
      const m = cls.match(/^justify-(.+)$/)
      if (m && JUSTIFY_VALUES.includes(m[1])) last = m[1]
    }
    return last
  },
  toClasses(value) {
    if (!JUSTIFY_VALUES.includes(value)) return []
    return [`justify-${value}`]
  },
}

const ALIGN_VALUES = ["start", "center", "end", "baseline", "stretch"]

export const alignItemsClassMap: ClassMap<string> = {
  matches: (cls) => /^items-(start|center|end|baseline|stretch)$/.test(cls),
  fromClasses(classes) {
    let last: string | null = null
    for (const cls of classes) {
      const m = cls.match(/^items-(.+)$/)
      if (m && ALIGN_VALUES.includes(m[1])) last = m[1]
    }
    return last
  },
  toClasses(value) {
    if (!ALIGN_VALUES.includes(value)) return []
    return [`items-${value}`]
  },
}

// `gap-`, `gap-x-`, `gap-y-`. We strip all three on write (so changing the
// shared gap clears any per-axis overrides) but only emit the shared form.
export const gapClassMap: ClassMap<number> = {
  matches: (cls) => /^gap(-x|-y)?-/.test(cls),
  fromClasses(classes) {
    let last: number | null = null
    for (const cls of classes) {
      const m = cls.match(/^gap(?:-x|-y)?-(.+)$/)
      if (!m) continue
      const px = parseGapSuffix(m[1])
      if (px !== null) last = px
    }
    return last
  },
  toClasses(value) {
    const px = Number(value)
    if (!Number.isFinite(px)) return []
    const token = PX_TO_TOKEN.get(px)
    if (token !== undefined) return [`gap-${token}`]
    return [`gap-[${px}px]`]
  },
}

function parseGapSuffix(suffix: string): number | null {
  const fromTable = TOKEN_TO_PX.get(suffix)
  if (fromTable !== undefined) return fromTable
  const arbitrary = suffix.match(/^\[([\d.]+)(px|rem)\]$/)
  if (!arbitrary) return null
  const n = Number(arbitrary[1])
  if (!Number.isFinite(n)) return null
  return arbitrary[2] === "rem" ? n * 16 : n
}
