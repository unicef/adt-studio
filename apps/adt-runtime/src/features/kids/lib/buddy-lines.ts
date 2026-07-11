/**
 * Speakable-line registry — canonical data lives in `@adt/types/kids` so the
 * Studio voice generator and the runtime can never drift. Import via the
 * zod-free `/kids` subpath only (keeps the shipped book bundle lean).
 *
 * See the shared module for the voice-baking interpolation rules
 * (`${name}`, `${language}`, and `voiceKey` aliases for player-name lines).
 */
import {
  KIDS_BUDDY_LINES,
  getKidsSpeakableLines,
  type KidsBuddyLine,
} from "@adt/types/kids"

export type BuddyLine = KidsBuddyLine

export const BUDDY_LINES = KIDS_BUDDY_LINES

export const getSpeakableLines = getKidsSpeakableLines
