import { describe, expect, it } from "vitest"
import type { PageSummarySection, TocSection } from "@/api/client"
import { firstWords, parseSectionId, sectionFacts } from "./sectionLabels"

const section = (sectionId: string, title: string): TocSection => ({ sectionId, title, href: `${sectionId}.html`, pageNumber: 6 })
const summary = (textPreview: string, sectionIndex = 0): PageSummarySection => ({
  sectionId: "pg006007_sec001",
  sectionIndex,
  sectionType: "text_only",
  isActivity: false,
  isPruned: false,
  textPreview,
})

describe("toc section labels", () => {
  it("keeps a real heading", () => {
    expect(sectionFacts(section("pg001_sec001", "TRISTE FIM"))).toEqual({ heading: "TRISTE FIM", firstWords: null, type: null, index: 1 })
  })

  it("falls back to the first words when the title is only the id", () => {
    const facts = sectionFacts(section("pg006007_sec001", "pg006007_sec001"), summary("\nÀs quatro e quinze da tarde,\nRetornava à moradia."))
    expect(facts).toEqual({ heading: null, firstWords: "Às quatro e quinze da tarde", type: "text_only", index: 1 })
  })

  it("cuts long first lines on a word", () => {
    expect(firstWords("Era no Arsenal de Guerra que o Major trabalhava todos os dias da semana inteira", 30)).toBe("Era no Arsenal de Guerra que…")
    expect(firstWords("   ")).toBeNull()
  })

  it("reads the page and section number from the id", () => {
    expect(parseSectionId("pg006007_sec002")).toEqual({ pageNumber: 6, index: 2 })
    expect(parseSectionId("custom")).toBeNull()
  })
})
