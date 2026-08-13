import { useEffect, useState } from "react"
import type { SettingsTabsVariant } from "./nav"

const STORAGE_KEY = "adt:settings-tabs"
const CHANGE_EVENT = "adt:settings-tabs-change"
const VARIANTS: SettingsTabsVariant[] = ["grouped", "flat", "regrouped"]

function readVariant(): SettingsTabsVariant {
  if (typeof window === "undefined") return "grouped"
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return VARIANTS.includes(raw as SettingsTabsVariant) ? (raw as SettingsTabsVariant) : "grouped"
  } catch {
    return "grouped"
  }
}

export function setSettingsTabsVariant(variant: SettingsTabsVariant) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, variant)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

export function useSettingsTabsVariant(): SettingsTabsVariant {
  const [variant, setVariant] = useState<SettingsTabsVariant>(readVariant)

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
