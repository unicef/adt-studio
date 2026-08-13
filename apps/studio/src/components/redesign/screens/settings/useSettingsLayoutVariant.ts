import { useEffect, useState } from "react"

export type SettingsLayoutVariant = "cards" | "dense" | "sections"

const STORAGE_KEY = "adt:settings-layout"
const CHANGE_EVENT = "adt:settings-layout-change"
const VARIANTS: SettingsLayoutVariant[] = ["cards", "dense", "sections"]

function readVariant(): SettingsLayoutVariant {
  if (typeof window === "undefined") return "cards"
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return VARIANTS.includes(raw as SettingsLayoutVariant) ? (raw as SettingsLayoutVariant) : "cards"
  } catch {
    return "cards"
  }
}

export function setSettingsLayoutVariant(variant: SettingsLayoutVariant) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, variant)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function useSettingsLayoutVariant(): SettingsLayoutVariant {
  const [variant, setVariant] = useState<SettingsLayoutVariant>(readVariant)

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
