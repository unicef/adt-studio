import { describe, expect, it } from "vitest"
import type { TextCatalogResponse } from "@/api/client"
import {
  buildRows,
  countByCategory,
  countUntranslated,
  filterRows,
  isBaseLanguage,
  patchEntries,
  resolveLanguages,
} from "./translateState"

function catalog(partial: Partial<TextCatalogResponse>): TextCatalogResponse {
  return {
    entries: [],
    generatedAt: "",
    version: 1,
    translations: {},
    speechTexts: {},
    ...partial,
  }
}

describe("resolveLanguages", () => {
  it("puts the book language first even when nothing is translated yet", () => {
    const { languages, baseLanguage } = resolveLanguages({
      configuredOutputs: ["en"],
      editingLanguage: undefined,
      bookLanguage: "en",
      translationCodes: [],
    })
    expect(baseLanguage).toBe("en")
    expect(languages).toEqual(["en"])
  })

  it("lists configured outputs that have no translation yet", () => {
    const { languages } = resolveLanguages({
      configuredOutputs: ["en", "pt-BR", "es"],
      editingLanguage: "en",
      bookLanguage: "en",
      translationCodes: ["pt-BR"],
    })
    expect(languages).toEqual(["en", "pt-BR", "es"])
  })

  it("keeps a stored translation whose language left the config", () => {
    const { languages } = resolveLanguages({
      configuredOutputs: ["en"],
      editingLanguage: "en",
      bookLanguage: "en",
      translationCodes: ["fr"],
    })
    expect(languages).toEqual(["en", "fr"])
  })

  it("normalizes locale casing and de-duplicates", () => {
    const { languages } = resolveLanguages({
      configuredOutputs: ["pt-br", "PT-BR"],
      editingLanguage: "EN",
      bookLanguage: null,
      translationCodes: ["pt_BR"],
    })
    expect(languages).toEqual(["en", "pt-BR"])
  })

  it("prefers the configured editing language over the book metadata", () => {
    const { baseLanguage } = resolveLanguages({
      configuredOutputs: [],
      editingLanguage: "es",
      bookLanguage: "en",
      translationCodes: [],
    })
    expect(baseLanguage).toBe("es")
  })
})

describe("isBaseLanguage", () => {
  it("matches on the base subtag so a regional source still reads as base", () => {
    expect(isBaseLanguage("pt-BR", "pt")).toBe(true)
    expect(isBaseLanguage("en", "en-GB")).toBe(true)
    expect(isBaseLanguage("es", "en")).toBe(false)
  })
})

describe("buildRows", () => {
  const source = catalog({
    entries: [
      { id: "pg001_p000", text: "Hello" },
      { id: "pg001_im001", text: "A cat" },
      { id: "pg002_ans_1", text: "Blue" },
      { id: "gl001", text: "Volcano" },
      { id: "pg001_p000_easy_read", text: "Hi" },
    ],
    translations: {
      "pt-BR": { entries: [{ id: "pg001_p000", text: "Olá" }], version: 2 },
    },
  })

  it("keeps untranslated source entries as empty rows", () => {
    const rows = buildRows(source, "pt-BR", false)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toMatchObject({ id: "pg001_p000", source: "Hello", target: "Olá" })
    expect(rows[1]).toMatchObject({ id: "pg001_im001", source: "A cat", target: "" })
    expect(countUntranslated(rows)).toBe(4)
  })

  it("mirrors source into target in base-language mode", () => {
    const rows = buildRows(source, "en", true)
    expect(rows.every((row) => row.source === row.target)).toBe(true)
    expect(countUntranslated(rows)).toBe(0)
  })

  it("classifies entries by id and flags images and answers", () => {
    const rows = buildRows(source, "en", true)
    expect(rows.map((row) => row.category)).toEqual([
      "text",
      "captions",
      "answers",
      "glossary",
      "easy-read",
    ])
    expect(rows[1].isImage).toBe(true)
    expect(rows[2].isAnswer).toBe(true)
  })

  it("returns nothing when the catalog is empty", () => {
    expect(buildRows(catalog({}), "pt-BR", false)).toEqual([])
    expect(buildRows(null, "pt-BR", false)).toEqual([])
  })

  it("counts every category present", () => {
    const counts = countByCategory(buildRows(source, "en", true))
    expect(counts.get("text")).toBe(1)
    expect(counts.get("captions")).toBe(1)
    expect(counts.get("answers")).toBe(1)
    expect(counts.get("glossary")).toBe(1)
    expect(counts.get("easy-read")).toBe(1)
  })
})

describe("filterRows", () => {
  const rows = buildRows(
    catalog({
      entries: [
        { id: "pg001_p000", text: "Hello world" },
        { id: "pg001_im001", text: "A cat sleeping" },
      ],
      translations: {
        "pt-BR": { entries: [{ id: "pg001_p000", text: "Olá mundo" }], version: 1 },
      },
    }),
    "pt-BR",
    false,
  )

  it("returns the same array when nothing is filtered", () => {
    expect(filterRows(rows, "all", "")).toBe(rows)
  })

  it("filters by category", () => {
    expect(filterRows(rows, "captions", "").map((row) => row.id)).toEqual(["pg001_im001"])
  })

  it("searches id, source and translation", () => {
    expect(filterRows(rows, "all", "im001").map((row) => row.id)).toEqual(["pg001_im001"])
    expect(filterRows(rows, "all", "sleeping").map((row) => row.id)).toEqual(["pg001_im001"])
    expect(filterRows(rows, "all", "mundo").map((row) => row.id)).toEqual(["pg001_p000"])
  })

  it("combines category and search", () => {
    expect(filterRows(rows, "captions", "mundo")).toEqual([])
  })
})

describe("patchEntries", () => {
  const entries = [
    { id: "a", text: "one" },
    { id: "b", text: "two" },
  ]

  it("updates an existing entry without touching the others", () => {
    expect(patchEntries(entries, "b", "dois")).toEqual([
      { id: "a", text: "one" },
      { id: "b", text: "dois" },
    ])
  })

  it("appends an entry the translation never held", () => {
    expect(patchEntries(entries, "c", "três")).toEqual([
      { id: "a", text: "one" },
      { id: "b", text: "two" },
      { id: "c", text: "três" },
    ])
  })

  it("does not mutate the input", () => {
    patchEntries(entries, "a", "changed")
    expect(entries[0].text).toBe("one")
  })
})
