/**
 * Kids Mode character registry.
 *
 * This data layer is intentionally UI-free so onboarding, settings, and
 * runtime chrome can all render the same buddy choices later.
 */
import type {
  BuddyArt,
  BuddyPalette,
} from "@/features/kids/assets/buddies/buddy-art"
import { ALIEN_BUDDY } from "@/features/kids/assets/buddies/alien"
import { BUNNY_BUDDY } from "@/features/kids/assets/buddies/bunny"
import { CAT_BUDDY } from "@/features/kids/assets/buddies/cat"
import { DINO_BUDDY } from "@/features/kids/assets/buddies/dino"
import { ROBOT_BUDDY } from "@/features/kids/assets/buddies/robot"

export const KIDS_CHARACTER_IDS = [
  "dino",
  "robot",
  "bunny",
  "cat",
  "alien",
] as const

export type KidsCharacterId = (typeof KIDS_CHARACTER_IDS)[number]

export interface KidsCharacter {
  id: KidsCharacterId
  labelKey: string
  labelFallback: string
  defaultNameKey: string
  defaultNameFallback: string
  art: BuddyArt
}

export const KIDS_CHARACTERS: readonly KidsCharacter[] = [
  {
    id: "dino",
    labelKey: "kids-character-dino",
    labelFallback: "Dinosaur",
    defaultNameKey: "kids-character-dino-default-name",
    defaultNameFallback: "Rex",
    art: DINO_BUDDY,
  },
  {
    id: "robot",
    labelKey: "kids-character-robot",
    labelFallback: "Robot",
    defaultNameKey: "kids-character-robot-default-name",
    defaultNameFallback: "Bolt",
    art: ROBOT_BUDDY,
  },
  {
    id: "bunny",
    labelKey: "kids-character-bunny",
    labelFallback: "Bunny",
    defaultNameKey: "kids-character-bunny-default-name",
    defaultNameFallback: "Pip",
    art: BUNNY_BUDDY,
  },
  {
    id: "cat",
    labelKey: "kids-character-cat",
    labelFallback: "Cat",
    defaultNameKey: "kids-character-cat-default-name",
    defaultNameFallback: "Luna",
    art: CAT_BUDDY,
  },
  {
    id: "alien",
    labelKey: "kids-character-alien",
    labelFallback: "Alien",
    defaultNameKey: "kids-character-alien-default-name",
    defaultNameFallback: "Zibby",
    art: ALIEN_BUDDY,
  },
]

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
