import { describe, expect, it, vi } from "vitest"
import type { ImageBounds, PageSize } from "@/components/app/screens/pipeline/steps/shared/page-inspector/types"

vi.mock("@lingui/core/macro", () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    message: strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), ""),
  }),
}))

const { humanReason } = await import("../page-detail/humanReason")
const { buildRepeatIndex, CATEGORY_LABEL, keywordHits, looksEnglish, splitTiers, tierOf, whyText } = await import("./tier")
const fixture = (await import("./tier.fixture.json")).default as {
  pages: Array<{
    pageId: string
    pageNumber: number
    pageSize: PageSize | null
    kept: ImageBounds[]
    leftOut: Array<{ imageId: string; reason: string; width?: number; height?: number; bounds?: ImageBounds; expected: string }>
  }>
}

const items = fixture.pages.flatMap((page) =>
  page.leftOut.map((entry) => ({
    key: `${page.pageId}/${entry.imageId}`,
    pageId: page.pageId,
    imageId: entry.imageId,
    reason: humanReason(entry.reason),
    width: entry.width ?? undefined,
    height: entry.height ?? undefined,
    bounds: entry.bounds ?? undefined,
    expected: entry.expected,
  })),
)
const pageOf = new Map(fixture.pages.map((page) => [page.pageId, page]))
const repeats = buildRepeatIndex(items)
const ranked = items.map((item) => {
  const page = pageOf.get(item.pageId)
  return { item, rank: tierOf(item, { pageSize: page?.pageSize ?? null, kept: page?.kept ?? [], repeats }) }
})
const rankOf = (imageId: string) => {
  const hit = ranked.find((entry) => entry.item.imageId === imageId)
  if (!hit) throw new Error(`missing ${imageId}`)
  return hit.rank
}
const translate = (descriptor: { message?: string }) => descriptor.message ?? ""
const tierName = { needed: "needed", look: "look", right: "right" } as const

const HAND_CHECK: Array<[string, "needed" | "look" | "right"]> = [
  ["pg023_im002", "needed"],
  ["pg036_im001", "needed"],
  ["pg028_im001", "look"],
  ["pg013_im001", "look"],
  ["pg006_im006", "look"],
  ["pg024_im002", "look"],
  ["pg019_im003", "look"],
  ["pg039_im001", "look"],
  ["pg034_im001", "look"],
  ["pg022_im003", "look"],
  ["pg011_im002", "look"],
  ["pg035_im002", "look"],
  ["pg003_im002", "look"],
  ["pg004_im002", "look"],
  ["pg022_im001", "look"],
  ["pg020_im001", "right"],
  ["pg030_im001", "right"],
  ["pg021_im001", "right"],
  ["pg046_im004", "right"],
  ["pg046_im002", "right"],
  ["pg001_im003", "right"],
  ["pg012_im002", "right"],
  ["pg006_im004", "right"],
  ["pg006_im013", "right"],
  ["pg038_im003", "right"],
  ["pg044_im002", "right"],
  ["pg039_im002", "look"],
  ["pg006_im014", "look"],
  ["pg004_im003", "look"],
  ["pg047_im001", "right"],
]

describe("tierOf on the hand-checked images of Práticas Vol. II", () => {
  it.each(HAND_CHECK)("%s is %s", (imageId, tier) => {
    expect(rankOf(imageId).tier).toBe(tier)
  })

  it("names the two drawings the AI itself describes, in a translatable category", () => {
    expect(rankOf("pg023_im002").category).toBe("people")
    expect(rankOf("pg023_im002").signals.words).toEqual(expect.arrayContaining(["illustration", "children"]))
    expect(rankOf("pg036_im001").category).toBe("people")
    expect(whyText(translate, rankOf("pg023_im002"))).toBe("The AI itself describes it as people")
  })

  it("explains the near-limit, piece, tick-box and inside-kept cases", () => {
    expect(translate(rankOf("pg006_im006").why ?? {})).toBe("Only just under the size limit (44 of 50 px)")
    expect(translate(rankOf("pg024_im002").why ?? {})).toContain("piece of a bigger picture")
    expect(rankOf("pg039_im001").category).toBe("ticks")
    expect(rankOf("pg019_im003").category).toBe("text")
    expect(rankOf("pg004_im003").category).toBe("icon")
    expect(rankOf("pg020_im001").signals.insideKept).toBe(true)
    expect(translate(rankOf("pg020_im001").why ?? {})).toBe("It sits inside a picture that is kept")
  })
})

describe("tierOf on the whole book", () => {
  it("matches the reference classifier on all 192 left-out images", () => {
    const mismatches = ranked.filter(({ item, rank }) => (rank.tier ? tierName[rank.tier] : null) !== item.expected).map(({ item }) => item.imageId)
    expect(mismatches).toEqual([])
  })

  it("gives 2 probably needed, 31 worth a look and 159 probably right", () => {
    const split = splitTiers(
      ranked.map((entry) => ({ ...entry, reason: entry.item.reason })),
      (entry) => entry.rank.tier,
    )
    expect(ranked).toHaveLength(192)
    expect([split.needed.length, split.look.length, split.right.length, split.unranked.length]).toEqual([2, 31, 159, 0])
  })

  it("counts 105 tiny dots and lines, 40 plain shapes and 14 single colours among the probably right", () => {
    const split = splitTiers(
      ranked.map((entry) => ({ ...entry, reason: entry.item.reason })),
      (entry) => entry.rank.tier,
    )
    expect(split.rightKinds).toEqual([
      { kind: "too-small", count: 105 },
      { kind: "not-meaningful", count: 40 },
      { kind: "blank", count: 14 },
    ])
  })

  it("finds one repeated picture worth a look: 15 times on 10 pages", () => {
    const flagged = [...repeats.values()].filter((candidate) => ranked.some((entry) => entry.rank.repeatKey === candidate.key && entry.rank.tier !== "right"))
    expect(flagged).toHaveLength(1)
    const [group] = flagged
    expect(group.keys).toHaveLength(15)
    expect(group.pageIds).toHaveLength(10)
    const members = ranked.filter((entry) => entry.rank.repeatKey === group.key)
    expect(members.map((entry) => entry.rank.tier)).toEqual(Array(15).fill("look"))
    expect(members[0].rank.signals.repeat).toEqual({ key: group.key, count: 15, pages: 10 })
  })

  it("also tags the heading bar repeated on 20 pages, which stays probably right", () => {
    const quiet = [...repeats.values()].filter((candidate) => ranked.some((entry) => entry.rank.repeatKey === candidate.key && entry.rank.tier === "right"))
    expect(quiet.map((group) => [group.keys.length, group.pageIds.length])).toEqual([[21, 20]])
  })

  it("keeps page 47's 80 fragments all probably right", () => {
    const page = ranked.filter((entry) => entry.item.pageId === "pg047")
    expect(page).toHaveLength(80)
    expect(page.every((entry) => entry.rank.tier === "right")).toBe(true)
  })
})

describe("keyword guard", () => {
  const ctx = { pageSize: { w: 1000, h: 1400 }, kept: [] }
  const nm = (detail: string) => ({ pageId: "pg001", reason: humanReason(`not meaningful: ${detail}`), width: 300, height: 200, bounds: { x: 10, y: 10, width: 150, height: 100 } })

  it("ignores a keyword that a negation in the same clause cancels", () => {
    expect(keywordHits("It contains no text, diagram, illustration or label.", /\b(diagram|illustration)\b/gi)).toEqual([])
    expect(tierOf(nm("This is a solid blue bar. It contains no text, diagram, illustration or other content."), ctx).tier).toBe("right")
  })

  it("lets a keyword count again in the next sentence", () => {
    expect(keywordHits("It has no text. It is an illustration of a dog.", /\billustration\b/gi)).toEqual(["illustration"])
    expect(tierOf(nm("It has no text. This is a small illustration of a child reading."), ctx).tier).toBe("needed")
  })

  it("matches whole words only", () => {
    expect(tierOf(nm("This is a short paragraph about a graphic layout element used on the page."), ctx).tier).toBe("right")
  })

  it("only reads English: other languages fall back to geometry", () => {
    expect(looksEnglish("This is a small illustration of children placed beside the exercise text.")).toBe(true)
    expect(looksEnglish("Esta é uma pequena ilustração de crianças ao lado do texto do exercício.")).toBe(false)
    const portuguese = tierOf(nm("Esta é uma pequena ilustração de crianças, uma figura com um mapa e um personagem."), ctx)
    expect(portuguese.signals.english).toBe(false)
    expect(portuguese.signals.words).toEqual([])
    expect(portuguese.tier).toBe("right")
    const big = tierOf({ ...nm("Uma figura grande com um mapa e um personagem desenhado."), bounds: { x: 0, y: 0, width: 400, height: 400 } }, ctx)
    expect(big.tier).toBe("look")
    expect(translate(big.why ?? {})).toBe("Big: covers 46% of the page")
  })
})

describe("rules without examples in this book", () => {
  const ctx = { pageSize: { w: 1000, h: 1400 }, kept: [] }
  const base = { pageId: "pg002", width: 400, height: 300, bounds: { x: 10, y: 10, width: 200, height: 150 } }

  it("ranks page elements by what the AI says they show", () => {
    expect(tierOf({ ...base, reason: humanReason("auto figure filter: a table of numbers with a photo of a farm") }, ctx).tier).toBe("needed")
    expect(tierOf({ ...base, reason: humanReason("auto figure filter: a callout box with the lesson title") }, ctx).tier).toBe("look")
  })

  it("never ranks your own removals and always looks at very big images", () => {
    expect(tierOf({ ...base, reason: humanReason("manual") }, ctx).tier).toBeNull()
    expect(tierOf({ ...base, reason: humanReason("longest side 6000px > max_side 5000px") }, ctx).tier).toBe("look")
    expect(tierOf({ ...base, reason: humanReason("duplicate artwork: kept composite pg002_im009") }, ctx).tier).toBe("right")
  })
})

describe("why lines", () => {
  const ctx = { pageSize: { w: 1000, h: 1400 }, kept: [] }
  const base = { pageId: "pg003", width: 300, height: 200, bounds: { x: 10, y: 10, width: 150, height: 100 } }
  const words: Record<string, string> = {
    people: "children",
    animal: "a dog animal",
    photo: "photo",
    diagram: "diagram",
    drawing: "drawing",
    ticks: "checkbox",
    text: "number '4'",
    icon: "logo",
  }
  const render = (rank: ReturnType<typeof tierOf>) => {
    const text = translate(rank.why ?? {})
    return rank.category ? text.replace(rank.category, translate(CATEGORY_LABEL[rank.category])) : text
  }

  it("stay under 70 characters with every category, for needed, look and page elements", () => {
    const lines: string[] = []
    for (const word of Object.values(words)) {
      lines.push(render(tierOf({ ...base, reason: humanReason(`not meaningful: This shows a ${word} in the corner of the page.`) }, ctx)))
      lines.push(render(tierOf({ ...base, reason: humanReason(`not meaningful: A plain ${word} on a solid background.`) }, ctx)))
      lines.push(render(tierOf({ ...base, reason: humanReason(`auto figure filter: a box with a ${word} and the lesson text`) }, ctx)))
    }
    lines.push(render(tierOf({ ...base, reason: humanReason("auto figure filter: a callout with the lesson title") }, ctx)))
    lines.push(render(tierOf({ ...base, reason: humanReason("longest side 6000px > max_side 5000px") }, ctx)))
    lines.push(render(tierOf({ ...base, reason: humanReason("not meaningful: This is only a partial fragment of the art.") }, ctx)))
    const long = lines.filter((line) => line.length >= 70)
    expect(long).toEqual([])
    expect(lines.every((line) => line.length > 0)).toBe(true)
  })
})
