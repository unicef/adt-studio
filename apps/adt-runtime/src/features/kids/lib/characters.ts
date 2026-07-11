/**
 * Kids Mode character registry.
 *
 * This data layer is intentionally UI-free so onboarding, settings, and
 * runtime chrome can all render the same buddy choices later.
 */
import {
  KIDS_BUDDIES,
  KIDS_BUDDY_IDS,
  type KidsBuddyId,
} from "@adt/types/kids"
import type {
  BuddyArt,
  BuddyPalette,
} from "@/features/kids/assets/buddies/buddy-art"
import { ALIEN_BUDDY } from "@/features/kids/assets/buddies/alien"
import { BUNNY_BUDDY } from "@/features/kids/assets/buddies/bunny"
import { CAT_BUDDY } from "@/features/kids/assets/buddies/cat"
import { DINO_BUDDY } from "@/features/kids/assets/buddies/dino"
import { ROBOT_BUDDY } from "@/features/kids/assets/buddies/robot"

export const KIDS_CHARACTER_IDS = KIDS_BUDDY_IDS

export type KidsCharacterId = KidsBuddyId

export interface KidsCharacter {
  id: KidsCharacterId
  labelKey: string
  labelFallback: string
  defaultNameKey: string
  defaultNameFallback: string
  art: BuddyArt
}

const BUDDY_ART: Record<KidsCharacterId, BuddyArt> = {
  dino: DINO_BUDDY,
  robot: ROBOT_BUDDY,
  bunny: BUNNY_BUDDY,
  cat: CAT_BUDDY,
  alien: ALIEN_BUDDY,
}

// Roster metadata (ids, labels, default names) is shared with the Studio
// voice generator via @adt/types/kids; only the SVG art wiring is local.
export const KIDS_CHARACTERS: readonly KidsCharacter[] = KIDS_BUDDIES.map(
  (buddy) => ({
    id: buddy.id,
    labelKey: buddy.labelKey,
    labelFallback: buddy.labelFallback,
    defaultNameKey: buddy.defaultNameKey,
    defaultNameFallback: buddy.defaultNameFallback,
    art: BUDDY_ART[buddy.id],
  }),
)

export const BUDDY_BACKGROUNDS: readonly { id: string; value: string }[] = [
  { id: "sunbeam", value: "#FEF3C7" },
  { id: "sky", value: "#DBEAFE" },
  { id: "mint", value: "#D1FAE5" },
  { id: "lavender", value: "#EDE9FE" },
  { id: "peach", value: "#FED7AA" },
  { id: "rose", value: "#FFE4E6" },
]

export function getCharacter(id: string): KidsCharacter {
  return KIDS_CHARACTERS.find((character) => character.id === id) ?? KIDS_CHARACTERS[0]
}

export function getPalette(
  art: BuddyArt,
  paletteId?: string | null,
): BuddyPalette {
  return (
    art.palettes.find((palette) => palette.id === paletteId) ??
    art.palettes.find((palette) => palette.id === "classic") ??
    art.palettes[0]
  )
}
