import { useSyncExternalStore } from "react"

export type EffectsMode = "auto" | "on" | "off"

export const EFFECTS_KEY = "adt.effects"
/** Kept in sync with the boot script in index.html, which runs before this module. */
export const DEFAULT_EFFECTS: EffectsMode = "auto"
export const REDUCED_CLASS = "reduce-effects"

/* eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query, not UI copy */
const MOTION_QUERY = "(prefers-reduced-motion: reduce)"
const CHANGE_EVENT = "adt:effects-change"

export const LOW_END_CORES = 4
export const LOW_END_MEMORY_GB = 4

export interface HardwareProfile {
  cores?: number
  memoryGb?: number
  softwareRendering?: boolean
}

export type LowEndReason = "cores" | "memory" | "software-rendering"

function isEffectsMode(value: string | null): value is EffectsMode {
  return value === "auto" || value === "on" || value === "off"
}

export function readEffectsMode(): EffectsMode {
  try {
    const stored = localStorage.getItem(EFFECTS_KEY)
    return isEffectsMode(stored) ? stored : DEFAULT_EFFECTS
  } catch {
    return DEFAULT_EFFECTS
  }
}

export function readHardware(): HardwareProfile {
  const desktop = typeof window !== "undefined" ? window.api?.hardware : undefined
  if (desktop) return desktop
  if (typeof navigator === "undefined") return {}
  const nav = navigator as Navigator & { deviceMemory?: number }
  return { cores: nav.hardwareConcurrency || undefined, memoryGb: nav.deviceMemory }
}

export function lowEndReasons(hw: HardwareProfile): LowEndReason[] {
  const reasons: LowEndReason[] = []
  if (hw.softwareRendering) reasons.push("software-rendering")
  if (hw.cores !== undefined && hw.cores <= LOW_END_CORES) reasons.push("cores")
  if (hw.memoryGb !== undefined && hw.memoryGb <= LOW_END_MEMORY_GB) reasons.push("memory")
  return reasons
}

export function systemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia(MOTION_QUERY).matches
}

export function resolvesToReduced(mode: EffectsMode, hw: HardwareProfile = readHardware()): boolean {
  if (mode === "on") return true
  if (mode === "off") return false
  return systemPrefersReducedMotion() || lowEndReasons(hw).length > 0
}

export function paintEffects(mode: EffectsMode): void {
  document.documentElement.classList.toggle(REDUCED_CLASS, resolvesToReduced(mode))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function setEffectsMode(mode: EffectsMode): void {
  try {
    localStorage.setItem(EFFECTS_KEY, mode)
  } catch {
    /* preference is best-effort; painting still works */
  }
  paintEffects(mode)
}

export function effectsReduced(): boolean {
  if (typeof document !== "undefined" && document.documentElement.classList.contains(REDUCED_CLASS)) return true
  return systemPrefersReducedMotion()
}

export function initEffects(): () => void {
  paintEffects(readEffectsMode())
  const media = window.matchMedia?.(MOTION_QUERY)
  if (!media) return () => {}
  const onChange = () => paintEffects(readEffectsMode())
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

export const NOTICE_KEY = "adt.effects-notice"

/**
 * The hardware reasons to tell the user about, once: only when Auto turned effects down because of
 * the machine (not the user's own choice, nor the OS motion setting) and this set of reasons hasn't
 * been shown before. `seen` is the last set shown.
 */
export function pendingNotice(mode: EffectsMode, reasons: LowEndReason[], seen: string | null): LowEndReason[] {
  if (mode !== "auto" || reasons.length === 0) return []
  return [...reasons].sort().join(",") === seen ? [] : reasons
}

export function readNoticeSeen(): string | null {
  try {
    return localStorage.getItem(NOTICE_KEY)
  } catch {
    return null
  }
}

export function markNoticeSeen(reasons: LowEndReason[]): void {
  try {
    localStorage.setItem(NOTICE_KEY, [...reasons].sort().join(","))
  } catch {
    /* best-effort; the worst case is seeing the notice again */
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  const media = window.matchMedia?.(MOTION_QUERY)
  media?.addEventListener("change", onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    media?.removeEventListener("change", onChange)
  }
}

export function useReducedEffects(): boolean {
  return useSyncExternalStore(subscribe, effectsReduced, () => false)
}
