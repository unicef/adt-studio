import { describe, expect, it } from "vitest"
import { pageSequence, spreads, stackedSequence, unitSequence } from "./page-sequence"

/** Shorthand: the face a slot draws, or null for a blank leaf. */
const f = (src: string, half?: "left" | "right") => (half ? { src, half } : { src })

describe("pageSequence — single-page books", () => {
  /** The cover is a single leaf, so without a blank after it every spread in the book is shown
   *  split down the middle. */
  it("puts one blank after the cover so spreads pair up", () => {
    expect(pageSequence(["cover", "p1", "p2", "p3"])).toEqual([
      f("cover"),
      null,
      f("p1"),
      f("p2"),
      f("p3"),
    ])
  })

  it("keeps every real page, in order", () => {
    const pages = ["a", "b", "c", "d", "e"]
    const sequence = pageSequence(pages)
    expect(sequence.filter((slot) => slot !== null).map((slot) => slot?.src)).toEqual(pages)
  })

  it("has nothing to sequence when there is no book", () => {
    expect(pageSequence([])).toEqual([])
  })

  it("is just the cover for a one-page book", () => {
    expect(pageSequence(["cover"])).toEqual([f("cover"), null])
  })
})

describe("pageSequence — spread books", () => {
  /** Extraction already merged the facing pairs, so each render contributes two leaves and the
   *  synthetic blank is never inserted — the scan includes whatever really faces page one. */
  it("splits each merged render into its left and right leaves, no blank", () => {
    expect(pageSequence(["cover", "s1", "s2"], true)).toEqual([
      f("cover"),
      f("s1", "left"),
      f("s1", "right"),
      f("s2", "left"),
      f("s2", "right"),
    ])
  })

  it("is just the cover for a book that is only a cover", () => {
    expect(pageSequence(["cover"], true)).toEqual([f("cover")])
  })
})

describe("unitSequence", () => {
  it("keeps a spread book's merged renders whole", () => {
    expect(unitSequence(["cover", "s1", "s2"], true)).toEqual([f("cover"), f("s1"), f("s2")])
  })

  it("is the leaf sequence for a single-page book, blank included", () => {
    expect(unitSequence(["cover", "p1"])).toEqual(pageSequence(["cover", "p1"]))
  })
})

describe("stackedSequence", () => {
  /** The last leaf set down is the one you see. */
  it("finishes with the cover on top", () => {
    const stack = stackedSequence(["cover", "p1", "p2"], 4)
    expect(stack[stack.length - 1]).toEqual(f("cover"))
  })

  it("puts the blank directly under the cover", () => {
    const stack = stackedSequence(["cover", "p1", "p2"], 4)
    expect(stack[stack.length - 2]).toBeNull()
  })

  it("reads downward as cover, blank, then the book in order", () => {
    expect([...stackedSequence(["cover", "p1", "p2"], 4)].reverse()).toEqual([
      f("cover"),
      null,
      f("p1"),
      f("p2"),
    ])
  })

  /** A closed spread book is a pile of single pages — the stack is made of halves, cover on top,
   *  and no blank anywhere. */
  it("stacks a spread book's halves with the cover on top", () => {
    expect([...stackedSequence(["cover", "s1"], 3, true)].reverse()).toEqual([
      f("cover"),
      f("s1", "left"),
      f("s1", "right"),
    ])
  })

  it("fills every slot when the stack is deeper than the book", () => {
    expect(stackedSequence(["cover", "p1"], 5)).toHaveLength(5)
  })

  it("degrades to blanks with no book, rather than to nothing", () => {
    expect(stackedSequence([], 3)).toEqual([null, null, null])
  })
})

describe("spreads — single-page books", () => {
  /** The whole reason the blank exists: pairs must be the ones that really face each other. */
  it("faces the blank against page one, then pairs the rest", () => {
    expect(spreads(["cover", "p1", "p2", "p3", "p4"])).toEqual([
      { verso: null, recto: f("p1") },
      { verso: f("p2"), recto: f("p3") },
      { verso: f("p4"), recto: null },
    ])
  })

  /** Taking the raw list two at a time gives (p1,p2) and (p3,p4) — every pair off by one. */
  it("does not pair the raw list two at a time", () => {
    const pairs = spreads(["cover", "p1", "p2", "p3"])
    expect(pairs[0]).toEqual({ verso: null, recto: f("p1") })
    expect(pairs.some((pair) => pair.verso?.src === "p1" && pair.recto?.src === "p2")).toBe(false)
  })

  it("never puts the cover in a spread, because nothing faces it", () => {
    const pairs = spreads(["cover", "p1", "p2"])
    expect(pairs.flatMap((pair) => [pair.verso?.src, pair.recto?.src])).not.toContain("cover")
  })

  /** The blank would have nothing to face, and a spread that is blank on both sides reads as a
   *  rendering failure rather than as a very short book. */
  it("has no spreads for a book that is only a cover", () => {
    expect(spreads(["cover"])).toEqual([])
  })

  it("has no spreads with no book", () => {
    expect(spreads([])).toEqual([])
  })

  it("keeps every page exactly once, in order", () => {
    const pages = ["cover", "a", "b", "c", "d", "e"]
    const flat = spreads(pages).flatMap((pair) => [pair.verso, pair.recto])
    expect(flat.filter((slot) => slot !== null).map((slot) => slot?.src)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ])
  })
})

describe("spreads — spread books", () => {
  /** Each merged render IS an opening: left half verso, right half recto, one cached image. */
  it("makes each merged render one opening of its own two halves", () => {
    expect(spreads(["cover", "s1", "s2"], true)).toEqual([
      { verso: f("s1", "left"), recto: f("s1", "right") },
      { verso: f("s2", "left"), recto: f("s2", "right") },
    ])
  })

  it("never puts the cover in a spread", () => {
    expect(spreads(["cover", "s1"], true).flatMap((p) => [p.verso?.src, p.recto?.src])).not.toContain(
      "cover",
    )
  })

  it("has no spreads for a book that is only a cover", () => {
    expect(spreads(["cover"], true)).toEqual([])
  })
})
