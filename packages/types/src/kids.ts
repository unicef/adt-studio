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

/**
 * Voice direction contract: base rules keep every buddy child-appropriate;
 * each preset then acts a distinct character — affect, pacing, pitch, and
 * speech quirks. Changing a preset changes the TTS cache key, so edits here
 * intentionally trigger regeneration of that buddy's clips.
 */
const VOICE_STYLE_BASE =
  "You voice a friendly reading-buddy character in a children's book app, " +
  "speaking to a young child (ages 4-8). Always warm, clear and encouraging, " +
  "never sarcastic or scary. Articulate every word cleanly. When the text is " +
  "in a language other than English, stay fully in that language with a " +
  "natural native accent while keeping the same character."

export const KIDS_BUDDIES: readonly KidsBuddyMeta[] = [
  {
    id: "dino",
    labelKey: "kids-character-dino",
    labelFallback: "Dinosaur",
    defaultNameKey: "kids-character-dino-default-name",
    defaultNameFallback: "Rex",
    voice: {
      voice: "onyx",
      instructions:
        `${VOICE_STYLE_BASE} Character: Rex, a huge but gentle dinosaur. ` +
        "Voice affect: very deep, rumbly and resonant, like a giant speaking " +
        "softly so he doesn't scare anyone; a little goofy and lovable. " +
        "Pacing: slow and unhurried, with big friendly pauses. Pitch: as low " +
        "as possible while staying warm. Quirks: a hint of a happy growl on " +
        "exclamations, as if a purring volcano learned to talk.",
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
      instructions:
        `${VOICE_STYLE_BASE} Character: Bolt, a cheerful little helper robot. ` +
        "Voice affect: bright, precise and chipper with a subtly synthetic, " +
        "digital quality. Pacing: evenly spaced words with a light staccato " +
        "rhythm, tiny mechanical micro-pauses between phrases. Pitch: medium, " +
        "very consistent, minimal natural drift — pleasantly machine-like, " +
        "never cold. Quirks: pronounce onomatopoeia like 'beep boop' crisply " +
        "and happily, as genuine robot sounds; end sentences with upbeat, " +
        "clipped precision.",
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
      instructions:
        `${VOICE_STYLE_BASE} Character: Pip, a small, bouncy, excitable bunny. ` +
        "Voice affect: light, bright and youthful, always smiling. Pacing: " +
        "quick and springy, like happy hops, but never rushed past clarity. " +
        "Pitch: high and sweet. Quirks: little bursts of delight on " +
        "exclamations, an eager bounce on words like 'hop' and 'let's go'.",
    },
  },
  {
    id: "cat",
    labelKey: "kids-character-cat",
    labelFallback: "Cat",
    defaultNameKey: "kids-character-cat-default-name",
    defaultNameFallback: "Luna",
    voice: {
      voice: "sage",
      instructions:
        `${VOICE_STYLE_BASE} Character: Luna, a cozy, serene cat. ` +
        "Voice affect: soft, smooth and soothing, like a bedtime story by a " +
        "fireplace. Pacing: slow, silky and unhurried, with relaxed, drawn-out " +
        "vowels. Pitch: gentle medium-low, almost a purr. Quirks: a faint " +
        "contented purr-like warmth under 'mmm' and 'meow' sounds; sentences " +
        "land softly like paws.",
    },
  },
  {
    id: "alien",
    labelKey: "kids-character-alien",
    labelFallback: "Alien",
    defaultNameKey: "kids-character-alien-default-name",
    defaultNameFallback: "Zibby",
    voice: {
      voice: "fable",
      instructions:
        `${VOICE_STYLE_BASE} Character: Zibby, a curious, wonder-struck little ` +
        "alien discovering Earth through books. Voice affect: playful and " +
        "melodic with an otherworldly sing-song lilt, as if every sentence is " +
        "a small discovery. Pacing: floaty and musical — speeds up with " +
        "excitement, slows down in awe. Pitch: medium-high, gliding up and " +
        "down more than a human would. Quirks: pronounce made-up words like " +
        "'zoop' with joyful precision; frequent tones of amazement.",
    },
  },
]

export function getKidsBuddyMeta(id: string): KidsBuddyMeta {
  return KIDS_BUDDIES.find((buddy) => buddy.id === id) ?? KIDS_BUDDIES[0]
}

// ---------------------------------------------------------------------------
// Per-book voice overrides
// ---------------------------------------------------------------------------

/** OpenAI TTS voice ids offered for buddy voice customization. */
export const KIDS_OPENAI_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
] as const

export type KidsOpenAiVoice = (typeof KIDS_OPENAI_VOICES)[number]

/** A buddy's resolved (or overridden) voice + instructions pair. */
export interface KidsBuddyVoiceConfig {
  voice: string
  instructions: string
}

/** The shared default voice config for a buddy, falling back to the first buddy for unknown ids. */
export function getKidsBuddyDefaultVoice(id: string): KidsBuddyVoiceConfig {
  return { ...getKidsBuddyMeta(id).voice }
}

/**
 * Resolve a buddy's effective voice config: the shared default merged with a
 * per-book override, field by field. An override field is ignored (falls
 * back to the default) when it's missing, an unknown voice id, or
 * empty/whitespace instructions.
 */
export function resolveKidsBuddyVoice(
  id: string,
  overrides?: Record<string, Partial<KidsBuddyVoiceConfig>>,
): KidsBuddyVoiceConfig {
  const fallback = getKidsBuddyDefaultVoice(id)
  const override = overrides?.[id]
  if (!override) return fallback

  const voice =
    override.voice && (KIDS_OPENAI_VOICES as readonly string[]).includes(override.voice)
      ? override.voice
      : fallback.voice
  const instructions =
    override.instructions && override.instructions.trim().length > 0
      ? override.instructions
      : fallback.instructions

  return { voice, instructions }
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
    fallback: "Now I'll use easier words!",
  },
  easyReadOff: {
    key: "kids-confirm-easy-read-off",
    fallback: "Okay, back to the book's own words.",
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
  comfortOpen: {
    key: "kids-confirm-comfort-open",
    fallback: "Let's make reading nice and comfy!",
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
 * Ambient "idle chatter" the buddy says unprompted while the child reads, to
 * feel alive and encouraging. Kept short, warm, and never task-related.
 */
const GENERIC_IDLE_PHRASES: readonly KidsBuddyLine[] = [
  { key: "kids-idle-doing-great", fallback: "You're doing great!" },
  { key: "kids-idle-love-reading", fallback: "I love reading with you." },
  { key: "kids-idle-good-story", fallback: "What a good story!" },
  { key: "kids-idle-keep-going", fallback: "Keep going — you've got this!" },
  { key: "kids-idle-super-reader", fallback: "You're a super reader!" },
  { key: "kids-idle-favorite", fallback: "Reading with you is my favorite." },
]

const BUDDY_IDLE_PHRASES: Partial<
  Record<KidsBuddyId, readonly KidsBuddyLine[]>
> = {
  dino: [
    { key: "kids-idle-dino-next", fallback: "Rawr! What happens next?" },
    { key: "kids-idle-dino-stomp", fallback: "Stomp stomp — this is fun!" },
  ],
  robot: [
    { key: "kids-idle-robot-fun", fallback: "Beep boop — reading is fun!" },
    { key: "kids-idle-robot-power", fallback: "Story power: full!" },
  ],
  bunny: [
    { key: "kids-idle-bunny-next", fallback: "Hop! I can't wait for the next page!" },
    { key: "kids-idle-bunny-fun", fallback: "This is so much fun!" },
  ],
  cat: [
    { key: "kids-idle-cat-cozy", fallback: "Mmm, this is so cozy." },
    { key: "kids-idle-cat-purr", fallback: "Purr... such a nice story." },
  ],
  alien: [
    { key: "kids-idle-alien-amazing", fallback: "Zoop! Earth books are amazing!" },
    { key: "kids-idle-alien-wonder", fallback: "Wow, what will we discover next?" },
  ],
}

/**
 * Idle-chatter pool for one buddy: character-specific lines plus the shared
 * generic pool. Buddies without a specific pool get the generic pool.
 */
export function getKidsIdlePhrases(id: string): readonly KidsBuddyLine[] {
  return [
    ...(BUDDY_IDLE_PHRASES[id as KidsBuddyId] ?? []),
    ...GENERIC_IDLE_PHRASES,
  ]
}

/**
 * Said by the buddy when the child answers a quiz/activity CORRECTLY — warm,
 * celebratory, and short. Never mentions the specific question.
 */
const GENERIC_CELEBRATE_PHRASES: readonly KidsBuddyLine[] = [
  { key: "kids-celebrate-got-it", fallback: "Yes! You got it!" },
  { key: "kids-celebrate-amazing", fallback: "Amazing work!" },
  { key: "kids-celebrate-proud", fallback: "I'm so proud of you!" },
  { key: "kids-celebrate-star", fallback: "You're a superstar, ${name}!" },
]

const BUDDY_CELEBRATE_PHRASES: Partial<
  Record<KidsBuddyId, readonly KidsBuddyLine[]>
> = {
  dino: [{ key: "kids-celebrate-dino", fallback: "Rawr! That's exactly right!" }],
  robot: [{ key: "kids-celebrate-robot", fallback: "Beep boop — correct!" }],
  bunny: [{ key: "kids-celebrate-bunny", fallback: "Hop hooray! You did it!" }],
  cat: [{ key: "kids-celebrate-cat", fallback: "Purr-fect! Well done!" }],
  alien: [{ key: "kids-celebrate-alien", fallback: "Zoop! Out of this world!" }],
}

export function getKidsCelebratePhrases(id: string): readonly KidsBuddyLine[] {
  return [
    ...(BUDDY_CELEBRATE_PHRASES[id as KidsBuddyId] ?? []),
    ...GENERIC_CELEBRATE_PHRASES,
  ]
}

/**
 * Said by the buddy when the child answers INCORRECTLY — gentle, reassuring,
 * and encouraging. Never scolds; frames mistakes as part of learning.
 */
const GENERIC_ENCOURAGE_PHRASES: readonly KidsBuddyLine[] = [
  { key: "kids-encourage-almost", fallback: "So close! Let's try again." },
  { key: "kids-encourage-good-try", fallback: "Good try! Give it another go." },
  {
    key: "kids-encourage-together",
    fallback: "Let's think about it together.",
  },
  {
    key: "kids-encourage-mistakes",
    fallback: "That's okay — mistakes help us learn!",
  },
]

const BUDDY_ENCOURAGE_PHRASES: Partial<
  Record<KidsBuddyId, readonly KidsBuddyLine[]>
> = {
  dino: [{ key: "kids-encourage-dino", fallback: "Rawr — try once more!" }],
  robot: [{ key: "kids-encourage-robot", fallback: "Recalculating… try again!" }],
  bunny: [{ key: "kids-encourage-bunny", fallback: "Hop back and try again!" }],
  cat: [{ key: "kids-encourage-cat", fallback: "It's okay, let's try again." }],
  alien: [{ key: "kids-encourage-alien", fallback: "Zoop! Give it another try!" }],
}

export function getKidsEncouragePhrases(id: string): readonly KidsBuddyLine[] {
  return [
    ...(BUDDY_ENCOURAGE_PHRASES[id as KidsBuddyId] ?? []),
    ...GENERIC_ENCOURAGE_PHRASES,
  ]
}

/**
 * Said by the buddy on the celebration screen when the child finishes the whole
 * book. The specific book title is shown on screen (not baked into the clip).
 */
const GENERIC_FINISH_PHRASES: readonly KidsBuddyLine[] = [
  {
    key: "kids-finish-did-it",
    fallback: "You did it! You finished the whole book!",
  },
  {
    key: "kids-finish-proud",
    fallback: "I'm so proud of you, ${name}. What a reader you are!",
  },
]

const BUDDY_FINISH_PHRASES: Partial<
  Record<KidsBuddyId, readonly KidsBuddyLine[]>
> = {
  dino: [{ key: "kids-finish-dino", fallback: "Rawr! We read the whole thing!" }],
  robot: [{ key: "kids-finish-robot", fallback: "Book complete! Great job!" }],
  bunny: [{ key: "kids-finish-bunny", fallback: "Hop hooray — we finished it!" }],
  cat: [{ key: "kids-finish-cat", fallback: "Purr… what a lovely story." }],
  alien: [
    { key: "kids-finish-alien", fallback: "Zoop! An amazing Earth story!" },
  ],
}

export function getKidsFinishPhrases(id: string): readonly KidsBuddyLine[] {
  return [
    ...(BUDDY_FINISH_PHRASES[id as KidsBuddyId] ?? []),
    ...GENERIC_FINISH_PHRASES,
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
  return [
    ...shared,
    ...getKidsPickPhrases(id),
    ...getKidsIdlePhrases(id),
    ...getKidsCelebratePhrases(id),
    ...getKidsEncouragePhrases(id),
    ...getKidsFinishPhrases(id),
  ]
}

// ---------------------------------------------------------------------------
// Narrator track (neutral, non-buddy voice = the book's narration voice)
// ---------------------------------------------------------------------------

/**
 * Not a buddy — deliberately excluded from `KIDS_BUDDY_IDS`. Identifies the
 * neutral narration track that reads existing onboarding copy in the book's
 * own narration voice, rather than a character voice.
 */
export const KIDS_NARRATOR_ID = "narrator" as const

/**
 * Onboarding lines read by the neutral narrator track. Reuses the existing
 * onboarding translation keys and their verbatim English fallbacks — plain
 * text only, no `${name}` interpolation (the narrator has no character
 * identity to inject).
 */
export const KIDS_NARRATOR_LINES: readonly KidsBuddyLine[] = [
  {
    key: "kids-onboarding-welcome-title",
    fallback: "Hi! Welcome to your reading adventure.",
  },
  {
    key: "kids-onboarding-welcome-copy",
    fallback:
      "I'm going to be your reading buddy - first, let's get to know you.",
  },
  {
    key: "kids-onboarding-name-title",
    fallback: "What should I call you?",
  },
  {
    key: "kids-onboarding-avatar-title",
    fallback: "Make your character",
  },
  {
    key: "kids-onboarding-read-title",
    fallback: "How do you want to read?",
  },
  {
    key: "kids-onboarding-buddy-title",
    fallback: "Pick a reading buddy",
  },
  {
    key: "kids-onboarding-pages-title",
    fallback: "Turn the pages",
  },
  {
    key: "kids-onboarding-pages-copy",
    fallback: "Press the arrow keys to go forward and back.",
  },
  {
    key: "kids-onboarding-help-title",
    fallback: "Ask me anytime",
  },
  {
    key: "kids-onboarding-help-copy",
    fallback: "Tap your buddy or press the L key when you want help.",
  },
  {
    key: "kids-onboarding-abilities-title",
    fallback: "Here's what I can do",
  },
]

export function getKidsNarratorLines(): readonly KidsBuddyLine[] {
  return KIDS_NARRATOR_LINES
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

// ---------------------------------------------------------------------------
// Kid avatar (distinct from the reading buddy)
// ---------------------------------------------------------------------------

/**
 * The child's own avatar — a personal character they build, shown in greetings
 * and beside the buddy during activity reactions / the finish screen. Rendered
 * offline in the runtime from DiceBear's "adventurer" style; only these IDs are
 * stored (the art ships in @dicebear/adventurer). Empty string = "none" for the
 * optional parts (hair/glasses/earrings/features).
 */
export interface KidsAvatarConfig {
  skinColor: string
  hair: string
  hairColor: string
  eyes: string
  eyebrows: string
  mouth: string
  glasses: string
  earrings: string
  features: string
  backgroundColor: string
}

/** DiceBear "adventurer" part catalog — the IDs the builder + random offer. */
const avatarRange = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`)

export const KIDS_AVATAR_SKIN_COLORS = [
  "ffe0bd", "f2d3b1", "ecad80", "c68642", "9e5622", "763900", "4a2f1b",
] as const
export const KIDS_AVATAR_HAIR_COLORS = [
  "0e0e0e", "562306", "6a4e35", "796a45", "ab2a18", "ac6511", "cb6820",
  "b9a05f", "e5d7a3", "afafaf", "3eac2c", "85c2c6", "dba3be", "592454",
] as const
export const KIDS_AVATAR_BACKGROUND_COLORS = [
  "a5b4fc", "c4f0d0", "fde68a", "fecaca", "e9d5ff", "bae6fd", "f5f5f5",
] as const
export const KIDS_AVATAR_HAIR_STYLES = [
  ...avatarRange("long", 26),
  ...avatarRange("short", 19),
]
export const KIDS_AVATAR_EYES = avatarRange("variant", 26)
export const KIDS_AVATAR_EYEBROWS = avatarRange("variant", 15)
export const KIDS_AVATAR_MOUTHS = avatarRange("variant", 30)
export const KIDS_AVATAR_GLASSES = avatarRange("variant", 5)
export const KIDS_AVATAR_EARRINGS = avatarRange("variant", 6)
export const KIDS_AVATAR_FEATURES = ["freckles", "blush", "birthmark"] as const

export const DEFAULT_KIDS_AVATAR: KidsAvatarConfig = {
  skinColor: "ecad80",
  hair: "long03",
  hairColor: "6a4e35",
  eyes: "variant01",
  eyebrows: "variant01",
  mouth: "variant07",
  glasses: "",
  earrings: "",
  features: "",
  backgroundColor: "a5b4fc",
}

function pickAvatarPart<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** A random-but-pleasant avatar — used by the "surprise me" shuffle. */
export function randomKidsAvatar(): KidsAvatarConfig {
  return {
    skinColor: pickAvatarPart(KIDS_AVATAR_SKIN_COLORS),
    hair: pickAvatarPart(KIDS_AVATAR_HAIR_STYLES),
    hairColor: pickAvatarPart(KIDS_AVATAR_HAIR_COLORS),
    eyes: pickAvatarPart(KIDS_AVATAR_EYES),
    eyebrows: pickAvatarPart(KIDS_AVATAR_EYEBROWS),
    mouth: pickAvatarPart(KIDS_AVATAR_MOUTHS),
    glasses: Math.random() < 0.25 ? pickAvatarPart(KIDS_AVATAR_GLASSES) : "",
    earrings: Math.random() < 0.25 ? pickAvatarPart(KIDS_AVATAR_EARRINGS) : "",
    features: Math.random() < 0.3 ? pickAvatarPart(KIDS_AVATAR_FEATURES) : "",
    backgroundColor: pickAvatarPart(KIDS_AVATAR_BACKGROUND_COLORS),
  }
}
