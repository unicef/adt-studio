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
  ephemeralAtom,
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
export const kidsOnboardingDoneAtom = persistedBoolAtom(
  "kidsOnboardingDone",
  false,
)

export const kidsModeActiveAtom = atom((get) => {
  const enabled = get(appConfigAtom).features.kidsMode !== false
  return enabled && get(kidsModeAtom)
})

export interface KidsBuddyConfig {
  character: KidsCharacterId
  palette: string
  backgroundColor: string
}

export const kidsBuddyAtom = persistedJsonAtom<KidsBuddyConfig>("kidsBuddy", {
  character: KIDS_CHARACTERS[0].id,
  palette: KIDS_CHARACTERS[0].art.palettes[0].id,
  backgroundColor: BUDDY_BACKGROUNDS[0].value,
})

export const kidsPlayerNameAtom = persistedStringAtom("kidsPlayerName", "")

export const buddySpeechAtom = ephemeralAtom<string | null>(null)
export const kidsBuddyPanelOpenAtom = ephemeralAtom(false)

export const kidsLanguageDialogOpenAtom = ephemeralAtom(false)
export const kidsStoryMapDialogOpenAtom = ephemeralAtom(false)
export const kidsResumeChipDismissedAtom = ephemeralAtom(false)

export interface KidsLastSpot {
  sectionId: string
  href: string
  page: number | null
}

export const kidsLastSpotAtom = persistedJsonAtom<KidsLastSpot | null>(
  "kidsLastSpot",
  null,
)
