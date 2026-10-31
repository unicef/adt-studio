/**
 * What every step artwork takes.
 *
 * Deliberately narrow. An artwork that needs more than this is reaching for information the
 * publish stream does not carry, which is the defect that killed the first page grid: only the
 * upload step reports a count, and none of the four ever reports *which* file landed.
 */
export interface StepAnimationProps {
  /**
   * Real page images, already resolved to cacheable URLs, in reading order.
   *
   * Empty when the book's page renders are missing — every artwork must still work. An artwork
   * that is blank without thumbnails has failed, not degraded.
   */
  pages: readonly string[]
  /**
   * 0–1 for the one step that honestly knows (`upload`), null everywhere else.
   *
   * Null is not "assume zero". It means *no quantity exists*, and an artwork given null must not
   * imply one — no filling, no accumulating, nothing that trends toward a finish.
   */
  progress: number | null
  /**
   * Width ÷ height of this book's pages, measured from a real render.
   *
   * Passed in rather than measured per artwork so that everything on screen agrees about the
   * shape of the book. Defaults to 3:4 when there is no render to measure. A landscape book
   * therefore gets landscape cards everywhere without any artwork doing anything.
   *
   * For a spread book this is still the *single page's* shape — the first render is the standalone
   * cover, which is what gets measured — and a merged render's shape is twice it.
   */
  aspect: number
  /**
   * True when this book's renders after the first are merged facing pairs — `spread_mode`, or
   * `spread_pairs` — where extraction pairs 2+3, 4+5 into one wide image each, cover standalone.
   *
   * Art that lays out *leaves* splits those renders back into halves (`pageSequence` /
   * `stackedSequence` / `spreads` all do this given the flag); art that shows *units* shows them
   * whole and wide (`unitSequence`). False means one render = one page.
   */
  spread: boolean
  className?: string
}
