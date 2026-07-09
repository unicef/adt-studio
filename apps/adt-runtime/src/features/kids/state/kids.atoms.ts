/**
 * Kids mode state.
 *
 * The persisted atom stores the reader's preference. The active atom also
 * respects per-book feature flags so a packaged book can hide kids mode
 * without clearing the reader's saved preference.
 */
import { atom } from "jotai"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { persistedBoolAtom } from "@/shared/state/persist"

export const kidsModeAtom = persistedBoolAtom("kidsMode", false)

export const kidsModeActiveAtom = atom((get) => {
  const enabled = get(appConfigAtom).features.kidsMode !== false
  return enabled && get(kidsModeAtom)
})
