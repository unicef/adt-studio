/**
 * Kids mode state.
 *
 * Whether a book is a kids book is an author-time decision made in Studio
 * and packed into the book's config (`features.kidsMode`) — readers never
 * toggle it. Per-reader state (onboarding done, chosen buddy, last spot)
 * stays persisted locally.
 */
import { atom } from "jotai"
import { DEFAULT_KIDS_AVATAR, type KidsAvatarConfig } from "@adt/types/kids"
import { appConfigAtom } from "@/shared/state/config.atoms"
import {
  ephemeralAtom,
  persistedBoolAtom,
  persistedJsonAtom,
  persistedStringAtom,
} from "@/shared/state/persist"
import {
  DEFAULT_BUDDY_BACKGROUND,
  KIDS_CHARACTERS,
  type KidsCharacterId,
} from "@/features/kids/lib/characters"
import { getKidsModePreviewOverride } from "@/features/kids/lib/kids-preview"

export const kidsOnboardingDoneAtom = persistedBoolAtom(
  "kidsOnboardingDone",
  false,
)

// Studio's preview lets the author toggle KIDS vs REGULAR chrome without
// touching the packed book decision (see kids-preview.ts). The override
// wins when present (and only ever applies in the dev/authoring preview
// context); otherwise the packed `features.kidsMode` config decides.
export const kidsModeActiveAtom = atom((get) => {
  const override = getKidsModePreviewOverride()
  if (override) return override === "on"
  return get(appConfigAtom).features.kidsMode === true
})

export interface KidsBuddyConfig {
  character: KidsCharacterId
  backgroundColor: string
}

export const kidsBuddyAtom = persistedJsonAtom<KidsBuddyConfig>("kidsBuddy", {
  character: KIDS_CHARACTERS[0].id,
  backgroundColor: DEFAULT_BUDDY_BACKGROUND,
})

export const kidsPlayerNameAtom = persistedStringAtom("kidsPlayerName", "")

// The child's own avatar (distinct from the reading buddy), built in
// onboarding and shown in activity reactions + the finish screen.
export const kidsAvatarAtom = persistedJsonAtom<KidsAvatarConfig>(
  "kidsAvatar",
  DEFAULT_KIDS_AVATAR,
)

// Reading comfort (text scale, font) is NOT kids-only — it now lives in shared
// state as `textScaleAtom` / `readingFontAtom`, so the regular reader can adopt
// the same settings rather than growing a parallel pair.

// Whether the buddy chats unprompted while the child reads (idle chatter).
export const kidsBuddyChatterAtom = persistedBoolAtom("kidsBuddyChatter", true)

export const buddySpeechAtom = ephemeralAtom<string | null>(null)
export const kidsBuddyPanelOpenAtom = ephemeralAtom(false)

export const kidsLanguageDialogOpenAtom = ephemeralAtom(false)
export const kidsStoryMapDialogOpenAtom = ephemeralAtom(false)
export const kidsAccessibilityDialogOpenAtom = ephemeralAtom(false)
export const kidsAvatarDialogOpenAtom = ephemeralAtom(false)
export const kidsResumeChipDismissedAtom = ephemeralAtom(false)

/** True while the end-of-book celebration screen is showing. */
export const kidsFinishedAtom = ephemeralAtom(false)

export interface KidsLastSpot {
  sectionId: string
  href: string
  page: number | null
}

export const kidsLastSpotAtom = persistedJsonAtom<KidsLastSpot | null>(
  "kidsLastSpot",
  null,
)
