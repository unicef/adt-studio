/**
 * The `upload` step's timing and arithmetic: how fast the progress channel moves, how long silence
 * has to last before it counts as a stall, and a deterministic seed so a choice made per book is the
 * same choice the next time the author looks.
 *
 * Nothing in this file expresses an opinion about what the step should look like. That is the point.
 */

/** Arrivals decelerate. Used for every progress transition. */
export const ARRIVE = "cubic-bezier(0.33,0,0.15,1)"

/**
 * The progress channel's one and only timing.
 *
 * Roughly three hundred and forty file arrivals over four minutes, each nudging an aggregate a
 * fraction of a per cent. A transition long enough to swallow the individual events turns that
 * stream into one continuous movement instead of three hundred and forty twitches.
 */
export const CHANNEL = `900ms ${ARRIVE}`

/** How long the progress channel may go quiet before the screen should say so. */
export const STALL_MS = 15_000

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}

function hash32(input: string): number {
  let h = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    h ^= input.charCodeAt(index)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * A seed for one book.
 *
 * Derived from the first page URL, which carries the book label — the contract hands us image URLs
 * and nothing else. The consequence that matters: any per-book choice is stable, so an author who
 * leaves the screen and comes back does not find a different picture.
 */
export function seedFromPages(pages: readonly string[]): number {
  return hash32(pages[0] ?? "empty")
}
