import { useEffect, useState } from "react"

export type SettingsNavVariant = "A" | "B" | "C"

const STORAGE_KEY = "adt:settings-nav"
const CHANGE_EVENT = "adt:settings-nav-change"
const VARIANTS: SettingsNavVariant[] = ["A", "B", "C"]

function readVariant(): SettingsNavVariant {
  if (typeof window === "undefined") return "A"
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return VARIANTS.includes(raw as SettingsNavVariant) ? (raw as SettingsNavVariant) : "A"
  } catch {
    return "A"
  }
}

export function setSettingsNavVariant(variant: SettingsNavVariant) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, variant)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function useSettingsNavVariant(): SettingsNavVariant {
  const [variant, setVariant] = useState<SettingsNavVariant>(readVariant)

  useEffect(() => {
    const sync = () => setVariant(readVariant())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  return variant
}
