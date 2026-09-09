/**
 * Which TTS providers a speech-settings dropdown may offer.
 *
 * Picking a provider this browser holds no key for produces a Speech run that
 * fails on its credential pre-flight, so the choice is blocked at the point of
 * selection rather than surfaced later as a run error.
 */

/** Provider keys held in this browser, as reported by `useApiKey()`. */
export interface ProviderKeyAvailability {
  openai: boolean
  azure: boolean
  gemini: boolean
  elevenlabs: boolean
}

/**
 * Whether `option` should be greyed out and unselectable.
 *
 * The provider already saved for this language stays selectable even with no
 * key: disabling it would misrepresent the book's own configuration, and a user
 * who navigated away from it could never return. A book's speech config travels
 * with the book while keys live per-browser, so an imported book routinely
 * arrives pointing at a provider this machine has no credential for.
 */
export function isProviderOptionDisabled(
  option: string,
  current: string,
  available: ProviderKeyAvailability,
): boolean {
  if (option === current) return false
  return !available[option as keyof ProviderKeyAvailability]
}
