import type { ClassMap } from "@/components/pipeline/stages/storyboard/components/style-editor/class-maps"
import { deviceToPrefix, getCascadePrefixes, type DeviceView } from "@/components/pipeline/stages/storyboard/components/style-editor/device-breakpoint"

export interface ClassEdit {
  matches: (cls: string) => boolean
  classes: string[]
}

export function edit<T>(map: ClassMap<T>, value: T): ClassEdit {
  return { matches: map.matches, classes: map.toClasses(value) }
}

export function withoutZeroSides(change: ClassEdit): ClassEdit {
  return { ...change, classes: change.classes.filter((cls) => !/^[pm][trblxy]?-0$/.test(cls)) }
}

function hasVariantPrefix(cls: string): boolean {
  const colon = cls.indexOf(":")
  if (colon === -1) return false
  const bracket = cls.indexOf("[")
  return bracket === -1 || colon < bracket
}

function atPrefix(cls: string, prefix: string): string | null {
  if (prefix === "") return hasVariantPrefix(cls) ? null : cls
  return cls.startsWith(prefix) ? cls.slice(prefix.length) : null
}

export function applyEdits(classes: string[], device: DeviceView, edits: ClassEdit[]): string[] {
  const prefix = deviceToPrefix(device)
  let next = classes
  for (const change of edits) {
    next = next.filter((cls) => {
      const bare = atPrefix(cls, prefix)
      return bare === null || !change.matches(bare)
    })
    next = [...next, ...change.classes.map((cls) => `${prefix}${cls}`)]
  }
  return next
}

export function readValue<T>(classes: string[], device: DeviceView, map: ClassMap<T>): T | null {
  for (const prefix of getCascadePrefixes(device)) {
    const bare = classes.map((cls) => atPrefix(cls, prefix)).filter((cls): cls is string => cls !== null && map.matches(cls))
    if (bare.length === 0) continue
    const value = map.fromClasses(bare)
    if (value !== null) return value
  }
  return null
}

export type SelfAlign = "left" | "center" | "right"

const SELF_ALIGN_CLASS: Record<SelfAlign, string> = { left: "mr-auto", center: "mx-auto", right: "ml-auto" }

export const selfAlignClassMap: ClassMap<SelfAlign> = {
  matches: (cls) => /^m[lrx]-auto$/.test(cls),
  fromClasses(classes) {
    let last: SelfAlign | null = null
    for (const cls of classes) {
      if (cls === "mx-auto") last = "center"
      else if (cls === "ml-auto") last = "right"
      else if (cls === "mr-auto") last = "left"
    }
    return last
  },
  toClasses: (value) => [SELF_ALIGN_CLASS[value]],
}

export type FloatSide = "left" | "right" | "none"

export const floatClassMap: ClassMap<FloatSide> = {
  matches: (cls) => /^float-(left|right|none)$/.test(cls),
  fromClasses(classes) {
    let last: FloatSide | null = null
    for (const cls of classes) {
      const match = cls.match(/^float-(left|right|none)$/)
      if (match) last = match[1] as FloatSide
    }
    return last
  },
  toClasses: (value) => (value === "none" ? [] : [`float-${value}`]),
}
