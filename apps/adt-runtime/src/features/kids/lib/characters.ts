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

export const KIDS_CHARACTER_IDS = KIDS_BUDDY_IDS

export type KidsCharacterId = KidsBuddyId

export interface KidsCharacter {
  id: KidsCharacterId
  labelKey: string
  labelFallback: string
  defaultNameKey: string
  defaultNameFallback: string
}

// Roster metadata (ids, labels, default names) is shared with the Studio
// voice generator via @adt/types/kids. Buddy art is rendered from the PNG
// expression sets in assets/buddy-images.ts.
export const KIDS_CHARACTERS: readonly KidsCharacter[] = KIDS_BUDDIES.map(
  (buddy) => ({
    id: buddy.id,
    labelKey: buddy.labelKey,
    labelFallback: buddy.labelFallback,
    defaultNameKey: buddy.defaultNameKey,
    defaultNameFallback: buddy.defaultNameFallback,
  }),
)

export const DEFAULT_BUDDY_BACKGROUND = "#FEF3C7"

export function getCharacter(id: string): KidsCharacter {
  return KIDS_CHARACTERS.find((character) => character.id === id) ?? KIDS_CHARACTERS[0]
}
