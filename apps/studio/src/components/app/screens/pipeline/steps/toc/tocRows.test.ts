import { describe, expect, it } from "vitest"
import type { TocEntry } from "@/api/client"
import { clampLevel, entryPageIds, levelsUsed, sameEntry } from "./tocRows"

const entry = (id: string, level: number, sectionId = ""): TocEntry => ({ id, title: id, level, sectionId, href: "", chapterId: "" })

describe("toc rows", () => {
  it("clamps indent and outdent to the allowed levels", () => {
    expect(clampLevel(0)).toBe(1)
    expect(clampLevel(7)).toBe(6)
    expect(clampLevel(3)).toBe(3)
  })

  it("counts the distinct levels in use", () => {
    expect(levelsUsed([entry("a", 1), entry("b", 3), entry("c", 1)])).toEqual([1, 3])
  })

  it("maps an entry to the page of the section it links to", () => {
    const sections = [{ sectionId: "s30", href: "", title: "x", pageNumber: 30 }]
    const pageIdByNumber = new Map([[30, "pg030"]])
    expect(entryPageIds(entry("a", 1, "s30"), sections, pageIdByNumber)).toEqual(["pg030"])
    expect(entryPageIds(entry("b", 1), sections, pageIdByNumber)).toEqual([])
    expect(entryPageIds(entry("c", 1, "missing"), sections, pageIdByNumber)).toEqual([])
  })

  it("ignores the chapter id when comparing", () => {
    expect(sameEntry(entry("a", 1), { ...entry("a", 1), chapterId: "x" })).toBe(true)
    expect(sameEntry(entry("a", 1), entry("a", 2))).toBe(false)
  })
})
