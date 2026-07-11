/**
 * Buddy speech phrases — data-driven so new lines are one entry each.
 *
 * Every phrase is a translation key plus an inline English fallback (the
 * `tk()` contract; see kids-translate.ts). `${name}` interpolates the buddy's
 * default name. Character-specific pools add personality on top of the
 * shared generic pool; a character with no entry just uses the generic pool,
 * so future user-created characters work without touching this file.
 */
import type { KidsCharacterId } from "@/features/kids/lib/characters"

export interface BuddyPhrase {
  key: string
  fallback: string
}

const GENERIC_PICK_PHRASES: readonly BuddyPhrase[] = [
  { key: "kids-pick-phrase-hi", fallback: "Hi! I'm ${name}!" },
  { key: "kids-pick-phrase-read", fallback: "Let's read together!" },
  { key: "kids-pick-phrase-pick-me", fallback: "Pick me! Pick me!" },
  { key: "kids-pick-phrase-adventure", fallback: "Ready for an adventure?" },
  { key: "kids-pick-phrase-friends", fallback: "We'll be great friends!" },
]

const CHARACTER_PICK_PHRASES: Partial<
  Record<KidsCharacterId, readonly BuddyPhrase[]>
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

export function getPickPhrases(id: KidsCharacterId): readonly BuddyPhrase[] {
  return [...(CHARACTER_PICK_PHRASES[id] ?? []), ...GENERIC_PICK_PHRASES]
}

/** Random phrase from the pool, never repeating `current` when avoidable. */
export function pickRandomPhrase(
  phrases: readonly BuddyPhrase[],
  current?: BuddyPhrase | null,
): BuddyPhrase {
  const pool =
    phrases.length > 1 && current
      ? phrases.filter((phrase) => phrase.key !== current.key)
      : phrases
  return pool[Math.floor(Math.random() * pool.length)]
}
