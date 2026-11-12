/**
 * The order pages must be shown in, everywhere in this screen — and, since spread support, the
 * shape of what a "page" even is.
 *
 * Two kinds of book arrive here.
 *
 * **Single-page books.** Each render is one page, and a printed book's cover is a single leaf, so
 * page 2 and page 3 face each other, page 4 and 5, and so on — every spread after the cover is an
 * even-then-odd pair. Lay the pages out in raw order and every spread in the book is split down
 * the middle, showing the right half of one spread beside the left half of the next. Inserting one
 * blank after the cover shifts everything by one and the pairs land together. It costs one slot
 * and it is invisible when it is right, which is exactly why it gets left out.
 *
 * **Spread books** (`spread_mode`, or `spread_pairs`). Extraction has already merged each facing
 * pair into ONE wide render — the cover standalone, then 2+3, 4+5 (`packages/pdf/src/extract.ts`).
 * There is nothing to pair and no blank to insert: the renders *are* the openings. What changes is
 * the unit. A **unit** is a whole render — the thing that travels a belt or rides a copier, wide
 * for a spread book. A **leaf** is a single page — for a spread book, one *half* of a merged
 * render, cropped back out by the drawing code via `half`.
 */

/** One face to draw: a whole render, or one half of a merged spread render. */
export interface PageFaceRef {
  src: string
  /** Set when `src` is a merged spread render and this face is only one of its halves. */
  half?: "left" | "right"
}

/** A face, or a blank leaf. Callers render a blank as paper — the same fallback they already use
 *  for a page whose image is missing. */
export type PageSlot = PageFaceRef | null

function face(src: string, half?: "left" | "right"): PageFaceRef {
  return half ? { src, half } : { src }
}

/**
 * Cover first, then page units, whole. For a spread book the units after the cover are the merged
 * facing pairs — wide, and drawn wide by anything that consumes this. For a single-page book this
 * is identical to `pageSequence`, blank leaf included, so the two kinds degrade the same way.
 */
export function unitSequence(pages: readonly string[], spread = false): readonly PageSlot[] {
  if (pages.length === 0) return []
  const [cover, ...rest] = pages
  if (spread) return [face(cover), ...rest.map((src) => face(src))]
  return [face(cover), null, ...rest.map((src) => face(src))]
}

/**
 * Cover first, then single leaves. For a single-page book that means the inserted blank and then
 * the pages; for a spread book each merged render contributes its left and then its right half,
 * and no blank is inserted — the scan already includes whatever really faces page one.
 */
export function pageSequence(pages: readonly string[], spread = false): readonly PageSlot[] {
  if (pages.length === 0) return []
  const [cover, ...rest] = pages
  if (spread) {
    return [face(cover), ...rest.flatMap((src) => [face(src, "left"), face(src, "right")])]
  }
  return [face(cover), null, ...rest.map((src) => face(src))]
}

/**
 * The leaf sequence laid into a stack of `count` slots, bottom-first, so that **the cover finishes
 * on top**.
 *
 * A stack is built by setting leaves down one after another, so the last one placed is the one you
 * see — which means the array has to run backwards relative to the sequence. Getting this wrong is
 * not subtle once you notice it: the book ends up face-down with its last page showing, which is
 * not how anybody has ever put a book on a desk.
 *
 * Leaves, not units, deliberately: a stack is the closed book, and a closed spread book is a pile
 * of single pages — spreads only exist while it is open.
 */
export function stackedSequence(
  pages: readonly string[],
  count: number,
  spread = false,
): readonly PageSlot[] {
  const sequence = pageSequence(pages, spread)
  return Array.from({ length: count }, (_slot, index) => {
    /* Index 0 is the bottom of the stack, `count - 1` the top; the sequence runs the other way. */
    const fromTop = count - 1 - index
    return sequence.length === 0 ? null : (sequence[fromTop % sequence.length] ?? null)
  })
}

/** A facing pair, as the reader sees it with the book open. */
export interface Spread {
  verso: PageSlot
  recto: PageSlot
}

/**
 * The book's spreads — the pairs that actually face each other when it is open.
 *
 * For a single-page book this is the payoff of the blank leaf, and the reason the rule exists at
 * all: the cover stands alone, so the first spread is the blank facing page one, then page two
 * faces page three, and on. Take pages two at a time from the raw list instead and every pair is
 * wrong by one — the right half of one spread beside the left half of the next.
 *
 * For a spread book there is nothing to derive: each merged render IS an opening, its left half
 * the verso and its right half the recto. Both halves reference the same cached image.
 *
 * The cover is deliberately not a spread. Nothing faces it.
 */
export function spreads(pages: readonly string[], spread = false): readonly Spread[] {
  if (spread) {
    const [, ...rest] = pages
    return rest.map((src) => ({ verso: face(src, "left"), recto: face(src, "right") }))
  }

  const sequence = pageSequence(pages)
  if (sequence.length < 2) return []

  const pairs: Spread[] = []
  /* Start at 1, skipping the cover: index 1 is the blank, and from there every (odd, even) pair is
   * a facing pair. */
  for (let index = 1; index < sequence.length; index += 2) {
    const verso = sequence[index] ?? null
    const recto = sequence[index + 1] ?? null
    /* A pair with nothing on either side is not a spread. It happens for a book that is only a
     * cover, where the inserted blank has nothing to face, and an all-blank spread on screen reads
     * as a rendering failure rather than as a short book. */
    if (verso === null && recto === null) continue
    pairs.push({ verso, recto })
  }
  return pairs
}
