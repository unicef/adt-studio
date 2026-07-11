/**
 * Kids mode state.
 *
 * Whether a book is a kids book is an author-time decision made in Studio
 * and packed into the book's config (`features.kidsMode`) — readers never
 * toggle it. Per-reader state (onboarding done, chosen buddy, last spot)
 * stays persisted locally.
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

export const kidsOnboardingDoneAtom = persistedBoolAtom(
  "kidsOnboardingDone",
  false,
)

export const kidsModeActiveAtom = atom(
  (get) => get(appConfigAtom).features.kidsMode === true,
)

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
