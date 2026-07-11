/**
 * Central registry of every line the buddy can speak.
 *
 * Each line is a translation key + inline English fallback (the `tk()`
 * contract). This registry is the single enumerable source for the Studio
 * voice generator: clips are produced per character per language by walking
 * `getSpeakableLines(characterId)`.
 *
 * Interpolation rules for voice baking:
 * - `${name}` in pick phrases = the character's fixed default name, so the
 *   generator resolves it at generation time (bakeable per character).
 * - `${language}` = the display name of the manifest's own language
 *   (bakeable per language).
 * - Lines interpolating the player's name can never be baked; they set
 *   `voiceKey` to a generic sibling clip that plays instead.
 */
import {
  getPickPhrases,
  type BuddyPhrase,
} from "@/features/kids/lib/buddy-phrases"
import type { KidsCharacterId } from "@/features/kids/lib/characters"

export interface BuddyLine extends BuddyPhrase {
  /** Clip to play instead of `key` (for lines whose text can't be baked). */
  voiceKey?: string
}

export const BUDDY_LINES = {
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
} as const satisfies Record<string, BuddyLine>

/**
 * Every line needing its own clip for one character — the voice generator's
 * work list. Lines with a `voiceKey` reuse another clip and are excluded.
 */
export function getSpeakableLines(
  characterId: KidsCharacterId,
): readonly BuddyLine[] {
  const shared: BuddyLine[] = Object.values(BUDDY_LINES).filter(
    (line) => !("voiceKey" in line),
  )
  return [...shared, ...getPickPhrases(characterId)]
}
