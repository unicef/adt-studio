/**
 * Kids Mode character registry.
 *
 * This data layer is intentionally UI-free so onboarding, settings, and
 * runtime chrome can all render the same buddy choices later.
 */
import {
  ALIEN_ART,
  DINO_ART,
  DRAGON_ART,
  PARROT_ART,
  PRINCESS_ART,
  PRINCESS_TONE_1_ART,
  PRINCESS_TONE_2_ART,
  PRINCESS_TONE_3_ART,
  PRINCESS_TONE_4_ART,
  PRINCESS_TONE_5_ART,
  ROBOT_ART,
  UNICORN_ART,
  characterAvatar,
} from "@/features/kids/assets/character-art"

export const KIDS_CHARACTER_IDS = [
  "dino",
  "robot",
  "parrot",
  "unicorn",
  "dragon",
  "alien",
  "princess",
] as const

export type KidsCharacterId = (typeof KIDS_CHARACTER_IDS)[number]

export interface KidsCharacterLook {
  id: string
  labelKey: string
  labelFallback: string
  filter?: string
  art?: string
}

export interface KidsCharacter {
  id: KidsCharacterId
  labelKey: string
  labelFallback: string
  defaultNameKey: string
  defaultNameFallback: string
  art: string
  looks: KidsCharacterLook[]
}

const classicLook: KidsCharacterLook = {
  id: "classic",
  labelKey: "kids-look-classic",
  labelFallback: "Classic",
}

export const KIDS_CHARACTERS: readonly KidsCharacter[] = [
  {
    id: "dino",
    labelKey: "kids-character-dino",
    labelFallback: "Dinosaur",
    defaultNameKey: "kids-character-dino-default-name",
    defaultNameFallback: "Rex",
    art: DINO_ART,
    looks: [
      classicLook,
      {
        id: "forest",
        labelKey: "kids-look-forest",
        labelFallback: "Forest",
        filter: "hue-rotate(90deg)",
      },
      {
        id: "ocean",
        labelKey: "kids-look-ocean",
        labelFallback: "Ocean",
        filter: "hue-rotate(180deg)",
      },
      {
        id: "berry",
        labelKey: "kids-look-berry",
        labelFallback: "Berry",
        filter: "hue-rotate(270deg)",
      },
    ],
  },
  {
    id: "robot",
    labelKey: "kids-character-robot",
    labelFallback: "Robot",
    defaultNameKey: "kids-character-robot-default-name",
    defaultNameFallback: "Bolt",
    art: ROBOT_ART,
    looks: [
      classicLook,
      {
        id: "sky",
        labelKey: "kids-look-sky",
        labelFallback: "Sky",
        filter: "hue-rotate(90deg)",
      },
      {
        id: "grape",
        labelKey: "kids-look-grape",
        labelFallback: "Grape",
        filter: "hue-rotate(180deg)",
      },
      {
        id: "sunset",
        labelKey: "kids-look-sunset",
        labelFallback: "Sunset",
        filter: "hue-rotate(270deg)",
      },
    ],
  },
  {
    id: "parrot",
    labelKey: "kids-character-parrot",
    labelFallback: "Parrot",
    defaultNameKey: "kids-character-parrot-default-name",
    defaultNameFallback: "Coco",
    art: PARROT_ART,
    looks: [
      classicLook,
      {
        id: "lagoon",
        labelKey: "kids-look-lagoon",
        labelFallback: "Lagoon",
        filter: "hue-rotate(90deg)",
      },
      {
        id: "mango",
        labelKey: "kids-look-mango",
        labelFallback: "Mango",
        filter: "hue-rotate(180deg)",
      },
      {
        id: "plum",
        labelKey: "kids-look-plum",
        labelFallback: "Plum",
        filter: "hue-rotate(270deg)",
      },
    ],
  },
  {
    id: "unicorn",
    labelKey: "kids-character-unicorn",
    labelFallback: "Unicorn",
    defaultNameKey: "kids-character-unicorn-default-name",
    defaultNameFallback: "Sparkle",
    art: UNICORN_ART,
    looks: [
      classicLook,
      {
        id: "rainbow",
        labelKey: "kids-look-rainbow",
        labelFallback: "Rainbow",
        filter: "hue-rotate(90deg)",
      },
      {
        id: "moonbeam",
        labelKey: "kids-look-moonbeam",
        labelFallback: "Moonbeam",
        filter: "hue-rotate(180deg)",
      },
      {
        id: "starlight",
        labelKey: "kids-look-starlight",
        labelFallback: "Starlight",
        filter: "hue-rotate(270deg)",
      },
    ],
  },
  {
    id: "dragon",
    labelKey: "kids-character-dragon",
    labelFallback: "Dragon",
    defaultNameKey: "kids-character-dragon-default-name",
    defaultNameFallback: "Ember",
    art: DRAGON_ART,
    looks: [
      classicLook,
      {
        id: "jade",
        labelKey: "kids-look-jade",
        labelFallback: "Jade",
        filter: "hue-rotate(90deg)",
      },
      {
        id: "coral",
        labelKey: "kids-look-coral",
        labelFallback: "Coral",
        filter: "hue-rotate(180deg)",
      },
      {
        id: "violet",
        labelKey: "kids-look-violet",
        labelFallback: "Violet",
        filter: "hue-rotate(270deg)",
      },
    ],
  },
  {
    id: "alien",
    labelKey: "kids-character-alien",
    labelFallback: "Alien",
    defaultNameKey: "kids-character-alien-default-name",
    defaultNameFallback: "Zibby",
    art: ALIEN_ART,
    looks: [
      classicLook,
      {
        id: "mint",
        labelKey: "kids-look-mint",
        labelFallback: "Mint",
        filter: "sepia(1) saturate(2.5) hue-rotate(90deg)",
      },
      {
        id: "bubblegum",
        labelKey: "kids-look-bubblegum",
        labelFallback: "Bubblegum",
        filter: "sepia(1) saturate(2.5) hue-rotate(180deg)",
      },
      {
        id: "nebula",
        labelKey: "kids-look-nebula",
        labelFallback: "Nebula",
        filter: "sepia(1) saturate(2.5) hue-rotate(270deg)",
      },
    ],
  },
  {
    id: "princess",
    labelKey: "kids-character-princess",
    labelFallback: "Princess",
    defaultNameKey: "kids-character-princess-default-name",
    defaultNameFallback: "Pearl",
    art: PRINCESS_ART,
    looks: [
      {
        id: "tone-1",
        labelKey: "kids-look-tone-1",
        labelFallback: "Style 1",
        art: PRINCESS_ART,
      },
      {
        id: "tone-2",
        labelKey: "kids-look-tone-2",
        labelFallback: "Style 2",
        art: PRINCESS_TONE_1_ART,
      },
      {
        id: "tone-3",
        labelKey: "kids-look-tone-3",
        labelFallback: "Style 3",
        art: PRINCESS_TONE_2_ART,
      },
      {
        id: "tone-4",
        labelKey: "kids-look-tone-4",
        labelFallback: "Style 4",
        art: PRINCESS_TONE_3_ART,
      },
      {
        id: "tone-5",
        labelKey: "kids-look-tone-5",
        labelFallback: "Style 5",
        art: PRINCESS_TONE_4_ART,
      },
      {
        id: "tone-6",
        labelKey: "kids-look-tone-6",
        labelFallback: "Style 6",
        art: PRINCESS_TONE_5_ART,
      },
    ],
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

export function resolveAvatar(
  characterId: string,
  lookId: string,
): { src: string; filter?: string } {
  const character = getCharacter(characterId)
  const look =
    character.looks.find((candidate) => candidate.id === lookId) ??
    character.looks[0]
  return characterAvatar(look.art ?? character.art, look.filter)
}
