/**
 * Kids mode state.
 *
 * The persisted atom stores the reader's preference. The active atom also
 * respects per-book feature flags so a packaged book can hide kids mode
 * without clearing the reader's saved preference.
 */
import { atom } from "jotai"
import { appConfigAtom } from "@/shared/state/config.atoms"
import {
  persistedBoolAtom,
  persistedJsonAtom,
  persistedStringAtom,
} from "@/shared/state/persist"
import {
  BUDDY_BACKGROUNDS,
  KIDS_CHARACTERS,
  type KidsCharacterId,
} from "@/features/kids/lib/characters"

export const kidsModeAtom = persistedBoolAtom("kidsMode", false)

export const kidsModeActiveAtom = atom((get) => {
  const enabled = get(appConfigAtom).features.kidsMode !== false
  return enabled && get(kidsModeAtom)
})

export interface KidsBuddyConfig {
  character: KidsCharacterId
  look: string
  backgroundColor: string
  name: string
}

export const kidsBuddyAtom = persistedJsonAtom<KidsBuddyConfig>("kidsBuddy", {
  character: KIDS_CHARACTERS[0].id,
  look: KIDS_CHARACTERS[0].looks[0].id,
  backgroundColor: BUDDY_BACKGROUNDS[0].value,
  name: "",
})

export const kidsPlayerNameAtom = persistedStringAtom("kidsPlayerName", "")
