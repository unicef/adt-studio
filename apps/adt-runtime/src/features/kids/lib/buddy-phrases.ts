/**
 * Buddy pick-phrase pools — canonical data lives in `@adt/types/kids` so the
 * Studio voice generator enumerates the exact same lines the runtime shows.
 * Import via the zod-free `/kids` subpath only (keeps the shipped book
 * bundle free of the rest of the types package).
 */
import {
  getKidsPickPhrases,
  type KidsBuddyLine,
} from "@adt/types/kids"

export type BuddyPhrase = KidsBuddyLine

export const getPickPhrases = getKidsPickPhrases

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
