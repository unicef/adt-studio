import { useCallback, useMemo } from "react"
import { useElementContext } from "./element-context"
import {
  deviceToPrefix,
  getCascadePrefixes,
  getWiderPrefixes,
  prefixToBreakpointLabel,
  type DeviceView,
} from "./device-breakpoint"
import type { ClassMap } from "./class-maps/types"
import type { ElementClassChangeOptions } from "../text-color"

export interface OverrideInfo {
  currentPrefix: string
  currentDevice: DeviceView
  currentClasses: string[]
  inheritedPrefix: string
  inheritedDevice: DeviceView
  inheritedClasses: string[]
  reset: () => void
}

interface UseElementStylesResult<TValue> {
  value: TValue
  setValue: (next: TValue) => void
  override: OverrideInfo | null
  /** True when at least one class in the cascade resolved to a value. When
   *  false, `value` came from the caller-supplied default — useful for showing
   *  an "inherited from parent" indicator. */
  isExplicit: boolean
}

// Tailwind variant prefixes (md:, xl:, hover:, …) always sit before any
// arbitrary-value bracket. So a class has a responsive/variant prefix iff its
// first ":" occurs before any "[". Bare arbitrary classes like
// `[text-decoration-line:underline_line-through]` have no variant prefix.
function hasVariantPrefix(cls: string): boolean {
  const colon = cls.indexOf(":")
  if (colon === -1) return false
  const bracket = cls.indexOf("[")
  return bracket === -1 || colon < bracket
}

function classesAtPrefix(classes: string[], prefix: string): string[] {
  if (prefix === "") {
    return classes.filter((c) => !hasVariantPrefix(c))
  }
  const out: string[] = []
  for (const c of classes) {
    if (c.startsWith(prefix)) out.push(c.slice(prefix.length))
  }
  return out
}

function fullClassesAtPrefix(
  classes: string[],
  prefix: string,
  matches: (cls: string) => boolean
): string[] {
  return classes.filter((c) => {
    if (prefix === "") {
      if (hasVariantPrefix(c)) return false
      return matches(c)
    }
    if (!c.startsWith(prefix)) return false
    return matches(c.slice(prefix.length))
  })
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function useElementStyles<TValue>(
  classMap: ClassMap<TValue>,
  defaultValue: TValue,
  changeOptions?: ElementClassChangeOptions,
): UseElementStylesResult<TValue> {
  const { dataId, classes, onClassesChange, deviceView } = useElementContext()

  const cascade = useMemo(() => getCascadePrefixes(deviceView), [deviceView])
  const widerPrefixes = useMemo(() => getWiderPrefixes(deviceView), [deviceView])
  const currentPrefix = deviceToPrefix(deviceView)

  const resolveAt = useCallback(
    (prefixes: readonly string[]): TValue | null => {
      for (const prefix of prefixes) {
        const stripped = classesAtPrefix(classes, prefix).filter((c) =>
          classMap.matches(c)
        )
        if (stripped.length === 0) continue
        const v = classMap.fromClasses(stripped)
        if (v !== null) return v
      }
      return null
    },
    [classes, classMap]
  )

  const resolved = useMemo(() => resolveAt(cascade), [resolveAt, cascade])
  const value = resolved ?? defaultValue
  const isExplicit = resolved !== null

  const setValue = useCallback(
    (next: TValue) => {
      const stripped = classes.filter((c) => {
        if (currentPrefix === "") {
          if (hasVariantPrefix(c)) return true
          return !classMap.matches(c)
        }
        if (!c.startsWith(currentPrefix)) return true
        return !classMap.matches(c.slice(currentPrefix.length))
      })

      const widerResolved = resolveAt(widerPrefixes) ?? defaultValue
      const widerClasses = classMap.toClasses(widerResolved)
      const newClasses = classMap.toClasses(next)
      const isRedundant = arraysEqual(widerClasses, newClasses)

      let merged = stripped
      if (!isRedundant && newClasses.length > 0) {
        const additions = newClasses.map((c) => `${currentPrefix}${c}`)
        merged = [...stripped, ...additions]
      }

      onClassesChange(dataId, merged, changeOptions)
    },
    [
      classes,
      classMap,
      currentPrefix,
      dataId,
      defaultValue,
      onClassesChange,
      changeOptions,
      resolveAt,
      widerPrefixes,
    ]
  )

  const reset = useCallback(() => {
    if (currentPrefix === "") return
    const stripped = classes.filter((c) => {
      if (!c.startsWith(currentPrefix)) return true
      return !classMap.matches(c.slice(currentPrefix.length))
    })
    onClassesChange(dataId, stripped, changeOptions)
  }, [
    classes,
    classMap,
    currentPrefix,
    dataId,
    onClassesChange,
    changeOptions,
  ])

  const override = useMemo<OverrideInfo | null>(() => {
    if (currentPrefix === "") return null
    const currentClasses = fullClassesAtPrefix(
      classes,
      currentPrefix,
      classMap.matches
    )
    if (currentClasses.length === 0) return null

    let inheritedPrefix: string | null = null
    let inheritedClasses: string[] = []
    for (const prefix of widerPrefixes) {
      const matched = fullClassesAtPrefix(classes, prefix, classMap.matches)
      if (matched.length > 0) {
        inheritedPrefix = prefix
        inheritedClasses = matched
        break
      }
    }
    if (inheritedPrefix === null) inheritedPrefix = ""

    return {
      currentPrefix,
      currentDevice: prefixToBreakpointLabel(currentPrefix),
      currentClasses,
      inheritedPrefix,
      inheritedDevice: prefixToBreakpointLabel(inheritedPrefix),
      inheritedClasses,
      reset,
    }
  }, [classes, classMap, currentPrefix, widerPrefixes, reset])

  return { value, setValue, override, isExplicit }
}
