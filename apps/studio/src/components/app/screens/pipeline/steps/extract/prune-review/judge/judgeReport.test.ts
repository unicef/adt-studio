import { describe, expect, it, vi } from "vitest"
import type { TierSignals } from "../tier"
import type { ReportCopy, ReportEntry, SignalCopy } from "./judgeReport"

vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ message: strings.join("") }) }))

const { buildJudgeReport, localDate, reportCounts, signalText, trimText } = await import("./judgeReport")

const LABEL = { needed: "Probably needed", look: "Worth a look", right: "Probably right" } as const

const COPY: ReportCopy = {
  title: (book, date) => `Left-out image review: ${book} · ${date}`,
  ranking: (version, totals) => `Ranking v${version} · probably needed ${totals.needed} · worth a look ${totals.look} · probably right ${totals.right}`,
  summary: ({ judged, total, right, wrong }) => `Judged ${judged} of ${total} · Should be kept ${wrong} · Right to leave out ${right}`,
  tierHeading: (tier, count, judged, wrong) => (tier === "right" ? `${LABEL[tier]} (${count}) · judged ${judged}` : `${LABEL[tier]} (${count}) · judged ${judged} · should be kept ${wrong}`),
  openHeading: (count) => `Not judged (${count})`,
  unranked: "Removed by you",
  image: (page, number) => `Page ${page} · image ${number}`,
  why: "Why flagged",
  signals: "signals",
  ai: "AI",
  comment: "Comment",
  verdict: { right: "Right to leave out", wrong: "Should be kept" },
  gone: "no longer left out",
}

const SIGNALS: SignalCopy = {
  area: (pct) => `area ${pct}%`,
  ratio: (value) => `ratio ${value}`,
  side: (side, min) => `side ${side} of ${min} px`,
  inside: "inside a kept picture",
  words: (list) => `words: ${list}`,
  repeat: (count, pages) => `same picture ${count} times on ${pages} pages`,
  notEnglish: "AI text not in English, words skipped",
}

const entry = (overrides: Partial<ReportEntry> & Pick<ReportEntry, "imageId" | "pageNumber" | "number">): ReportEntry => ({
  reason: "Not a meaningful image",
  aiText: null,
  tier: "look",
  why: "",
  signals: "",
  group: null,
  verdict: null,
  comment: "",
  gone: false,
  ...overrides,
})

const repeat = { key: "too-small:49x57@7", title: "Same picture on 2 pages (3)" }

describe("buildJudgeReport", () => {
  const entries: ReportEntry[] = [
    entry({
      imageId: "pg023_im002",
      pageNumber: 23,
      number: 2,
      width: 57,
      height: 121,
      tier: "needed",
      why: "The AI itself describes it as people or characters",
      signals: "area 0.4%, ratio 2.1, words: illustration, children",
      verdict: "wrong",
      comment: "Margin\nicon",
    }),
    entry({ imageId: "pg013_im001", pageNumber: 13, number: 1, reason: "Too small (49px, needs 50px)", group: repeat, verdict: "right" }),
    entry({ imageId: "pg013_im002", pageNumber: 13, number: 2, reason: "Too small (49px, needs 50px)", group: repeat, verdict: "right" }),
    entry({ imageId: "pg017_im001", pageNumber: 17, number: 1, reason: "Too small (49px, needs 50px)", group: repeat, verdict: "right" }),
    entry({ imageId: "pg039_im001", pageNumber: 39, number: 1, why: "The AI mentions tick boxes. Check it isn't lesson content", aiText: "Four empty checkbox\noutlines." }),
    entry({ imageId: "pg002_im001", pageNumber: 2, number: 1, tier: "right", reason: "Too small (2px, needs 50px)", why: "A tiny dot or thin line", verdict: "right", gone: true, outside: true }),
  ]

  it("groups by tier, folds repeats into one line, lists the open ones last", () => {
    const text = buildJudgeReport({ book: "Práticas Vol. II", date: "2026-11-06", version: 1, totals: { needed: 2, look: 31, right: 159 }, entries, copy: COPY })
    expect(text).toBe(
      [
        "# Left-out image review: Práticas Vol. II · 2026-11-06",
        "Ranking v1 · probably needed 2 · worth a look 31 · probably right 159",
        "Judged 4 of 5 · Should be kept 1 · Right to leave out 3",
        "",
        "## Probably needed (2) · judged 1 · should be kept 1",
        "- **Page 23 · image 2** (`pg023_im002`, 57×121) · Not a meaningful image · Why flagged: The AI itself describes it as people or characters · signals: area 0.4%, ratio 2.1, words: illustration, children · **Should be kept** · Comment: Margin icon",
        "",
        "## Worth a look (31) · judged 3 · should be kept 0",
        "### Same picture on 2 pages (3): pg013_im001, pg013_im002, pg017_im001 · **Right to leave out**",
        "",
        "## Probably right (159) · judged 1",
        "- **Page 2 · image 1** (`pg002_im001`) · Too small (2px, needs 50px) · Why flagged: A tiny dot or thin line · **Right to leave out** _(no longer left out)_",
        "",
        "## Not judged (1)",
        '- **Page 39 · image 1** (`pg039_im001`) · Not a meaningful image · Why flagged: The AI mentions tick boxes. Check it isn\'t lesson content · AI: "Four empty checkbox outlines."',
        "",
      ].join("\n"),
    )
  })

  it("trims the AI's reasoning to about 200 characters on a word boundary", () => {
    const long = "word ".repeat(80)
    const trimmed = trimText(long)
    expect(trimmed.length).toBeLessThanOrEqual(201)
    expect(trimmed.endsWith("word…")).toBe(true)
    expect(trimText("short and sweet")).toBe("short and sweet")
  })

  it("counts verdicts", () => {
    expect(reportCounts(entries)).toEqual({ judged: 5, total: 6, right: 4, wrong: 1, open: 1 })
    expect(reportCounts(entries.filter((entry) => !entry.outside))).toEqual({ judged: 4, total: 5, right: 3, wrong: 1, open: 1 })
  })

  it("formats the local date as YYYY-MM-DD", () => {
    expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})

describe("signalText", () => {
  const base: TierSignals = { areaPct: 0.3987, aspect: 2.0996, side: 57, minSide: 50, insideKept: false, english: true, words: ["illustration", "children"], repeat: null }

  it("lists area, ratio and the matched words", () => {
    expect(signalText(base, false, SIGNALS)).toBe("area 0.4%, ratio 2.1, words: illustration, children")
  })

  it("adds the size limit for too-small images and the repeat count", () => {
    expect(signalText({ ...base, words: [], side: 49, repeat: { key: "k", count: 15, pages: 10 } }, true, SIGNALS)).toBe("area 0.4%, ratio 2.1, side 49 of 50 px, same picture 15 times on 10 pages")
  })
})
