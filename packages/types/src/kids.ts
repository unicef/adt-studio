/**
 * Kids Mode shared constants — buddy roster metadata, speakable lines, and
 * the voice-pack manifest contract.
 *
 * This module is intentionally zod-free and side-effect-free: the book
 * runtime imports it via the `@adt/types/kids` subpath and must not pull the
 * rest of the types package (or zod) into the shipped book bundle. The API
 * and pipeline import it to enumerate the voice generator's work list.
 *
 * Interpolation rules for baking voice clips:
 * - `${name}` = the buddy's fixed default name (translated), resolvable per
 *   character per language at generation time.
 * - `${language}` = the display name of the clip's own language.
 * - Lines interpolating the player's name can never be baked; they set
 *   `voiceKey` to a generic sibling clip that plays instead.
 */

export const KIDS_BUDDY_IDS = [
  "dino",
  "robot",
  "bunny",
  "cat",
  "alien",
] as const

export type KidsBuddyId = (typeof KIDS_BUDDY_IDS)[number]

export interface KidsBuddyVoice {
  /** OpenAI TTS voice id. */
  voice: string
  /** Style instructions sent alongside every clip for this buddy. */
  instructions: string
}

export interface KidsBuddyMeta {
  id: KidsBuddyId
  labelKey: string
  labelFallback: string
  defaultNameKey: string
  defaultNameFallback: string
  voice: KidsBuddyVoice
}

const VOICE_STYLE_BASE =
  "You voice a friendly reading-buddy character in a children's book app. " +
  "Speak slowly, warmly and clearly for a young child. Keep the energy " +
  "gentle and encouraging, never sarcastic."

export const KIDS_BUDDIES: readonly KidsBuddyMeta[] = [
  {
    id: "dino",
    labelKey: "kids-character-dino",
    labelFallback: "Dinosaur",
    defaultNameKey: "kids-character-dino-default-name",
    defaultNameFallback: "Rex",
    voice: {
      voice: "ash",
      instructions: `${VOICE_STYLE_BASE} You are Rex, a big gentle dinosaur: a deep, warm, slightly goofy voice.`,
    },
  },
  {
    id: "robot",
    labelKey: "kids-character-robot",
    labelFallback: "Robot",
    defaultNameKey: "kids-character-robot-default-name",
    defaultNameFallback: "Bolt",
    voice: {
      voice: "echo",
      instructions: `${VOICE_STYLE_BASE} You are Bolt, a cheerful little robot: crisp, upbeat, lightly mechanical cadence.`,
    },
  },
  {
    id: "bunny",
    labelKey: "kids-character-bunny",
    labelFallback: "Bunny",
    defaultNameKey: "kids-character-bunny-default-name",
    defaultNameFallback: "Pip",
    voice: {
      voice: "nova",
      instructions: `${VOICE_STYLE_BASE} You are Pip, a small bouncy bunny: bright, light and quick, always a smile in the voice.`,
    },
  },
  {
    id: "cat",
    labelKey: "kids-character-cat",
    labelFallback: "Cat",
    defaultNameKey: "kids-character-cat-default-name",
    defaultNameFallback: "Luna",
    voice: {
      voice: "coral",
      instructions: `${VOICE_STYLE_BASE} You are Luna, a cozy calm cat: soft, soothing, unhurried.`,
    },
  },
  {
    id: "alien",
    labelKey: "kids-character-alien",
    labelFallback: "Alien",
    defaultNameKey: "kids-character-alien-default-name",
    defaultNameFallback: "Zibby",
    voice: {
      voice: "verse",
      instructions: `${VOICE_STYLE_BASE} You are Zibby, a curious friendly alien: playful, wondering, a little melodic.`,
    },
  },
]

export function getKidsBuddyMeta(id: string): KidsBuddyMeta {
  return KIDS_BUDDIES.find((buddy) => buddy.id === id) ?? KIDS_BUDDIES[0]
}

// ---------------------------------------------------------------------------
// Speakable lines
// ---------------------------------------------------------------------------

export interface KidsBuddyLine {
  key: string
  fallback: string
  /** Clip to play instead of `key` (for lines whose text can't be baked). */
  voiceKey?: string
}

export const KIDS_BUDDY_LINES = {
  greet: {
    key: "kids-buddy-greet",
    fallback: "Hi! Tap me if you need help.",
  },
  greetName: {
    key: "kids-buddy-greet-name",
    fallback: "Hi ${name}! Tap me if you need help.",
    voiceKey: "kids-buddy-greet",
  },
  readStart: {
    key: "kids-confirm-read-start",
    fallback: "Okay! I will read with you.",
  },
  readBreak: {
    key: "kids-confirm-read-break",
    fallback: "Okay, taking a break.",
  },
  speedSlow: {
    key: "kids-confirm-speed-slow",
    fallback: "Okay! Now I read slowly, like a turtle.",
  },
  speedNormal: {
    key: "kids-confirm-speed-normal",
    fallback: "Okay! Now I read at normal speed.",
  },
  speedFast: {
    key: "kids-confirm-speed-fast",
    fallback: "Okay! Now I read quickly, like a rabbit.",
  },
  signOn: {
    key: "kids-confirm-sign-on",
    fallback: "Sign language is on!",
  },
  signOff: {
    key: "kids-confirm-sign-off",
    fallback: "Sign language is off.",
  },
  easyReadOn: {
    key: "kids-confirm-easy-read-on",
    fallback: "Big letters are on!",
  },
  easyReadOff: {
    key: "kids-confirm-easy-read-off",
    fallback: "Big letters are off.",
  },
  glossaryOn: {
    key: "kids-confirm-glossary-on",
    fallback: "Word helper is on!",
  },
  glossaryOff: {
    key: "kids-confirm-glossary-off",
    fallback: "Word helper is off.",
  },
  eli5Open: {
    key: "kids-confirm-eli5-open",
    fallback: "I opened a simpler explanation.",
  },
  notesOpen: {
    key: "kids-confirm-notes-open",
    fallback: "Your notes are open.",
  },
  languageOn: {
    key: "kids-confirm-language",
    fallback: "Okay, ${language} is on!",
  },
} as const satisfies Record<string, KidsBuddyLine>

const GENERIC_PICK_PHRASES: readonly KidsBuddyLine[] = [
  { key: "kids-pick-phrase-hi", fallback: "Hi! I'm ${name}!" },
  { key: "kids-pick-phrase-read", fallback: "Let's read together!" },
  { key: "kids-pick-phrase-pick-me", fallback: "Pick me! Pick me!" },
  { key: "kids-pick-phrase-adventure", fallback: "Ready for an adventure?" },
  { key: "kids-pick-phrase-friends", fallback: "We'll be great friends!" },
]

const BUDDY_PICK_PHRASES: Partial<
  Record<KidsBuddyId, readonly KidsBuddyLine[]>
> = {
  dino: [
    { key: "kids-pick-phrase-dino-rawr", fallback: "Rawr! I'm ${name}!" },
    {
      key: "kids-pick-phrase-dino-stomp",
      fallback: "Let's stomp into a story!",
    },
  ],
  robot: [
    { key: "kids-pick-phrase-robot-beep", fallback: "Beep boop! I'm ${name}!" },
    {
      key: "kids-pick-phrase-robot-loading",
      fallback: "Story mode: activated!",
    },
  ],
  bunny: [
    { key: "kids-pick-phrase-bunny-hop", fallback: "Hop hop! I'm ${name}!" },
    {
      key: "kids-pick-phrase-bunny-jump",
      fallback: "Let's jump into a book!",
    },
  ],
  cat: [
    { key: "kids-pick-phrase-cat-meow", fallback: "Meow! I'm ${name}!" },
    {
      key: "kids-pick-phrase-cat-cozy",
      fallback: "Let's curl up with a story!",
    },
  ],
  alien: [
    { key: "kids-pick-phrase-alien-zoop", fallback: "Zoop! I'm ${name}!" },
    {
      key: "kids-pick-phrase-alien-planet",
      fallback: "Books are my favorite planet!",
    },
  ],
}

/**
 * Pick-step phrase pool for one buddy: character-specific personality lines
 * plus the shared generic pool. Buddies without a specific pool (future
 * user-created characters) get the generic pool unchanged.
 */
export function getKidsPickPhrases(id: string): readonly KidsBuddyLine[] {
  return [
    ...(BUDDY_PICK_PHRASES[id as KidsBuddyId] ?? []),
    ...GENERIC_PICK_PHRASES,
  ]
}

/**
 * Every line needing its own clip for one character — the voice generator's
 * work list. Lines with a `voiceKey` reuse another clip and are excluded.
 */
export function getKidsSpeakableLines(id: string): readonly KidsBuddyLine[] {
  const shared: KidsBuddyLine[] = Object.values(KIDS_BUDDY_LINES).filter(
    (line) => !("voiceKey" in line),
  )
  return [...shared, ...getKidsPickPhrases(id)]
}

// ---------------------------------------------------------------------------
// Voice pack contract
// ---------------------------------------------------------------------------

/** Directory name inside the book dir and packaged `content/` output. */
export const KIDS_VOICE_DIR = "kids-voice"

export interface KidsVoiceManifest {
  version: number
  /** characterId → lineKey → file path relative to the manifest's folder. */
  characters: Record<string, Record<string, string>>
}

export const KIDS_VOICE_MANIFEST_VERSION = 1

/** Display names for `${language}` interpolation in baked clips. */
export const KIDS_LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  "pt-br": "Português (Brasil)",
  "pt-BR": "Português (Brasil)",
  sq: "Shqip",
}
