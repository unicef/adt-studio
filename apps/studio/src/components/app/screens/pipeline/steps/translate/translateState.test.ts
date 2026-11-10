import { describe, expect, it } from "vitest"
import type { TextCatalogResponse } from "@/api/client"
import {
  buildRows,
  countByCategory,
  countTranslated,
  countUntranslated,
  entriesFor,
  filterRows,
  hasAnyTranslation,
  isBaseLanguage,
  NO_FILTER,
  patchCatalog,
  patchEntries,
  resolveLanguages,
  sourceEntriesOf,
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
        { id: "pg002_p000", text: "Goodbye" },
      ],
      translations: {
        "pt-BR": { entries: [{ id: "pg001_p000", text: "Olá mundo" }], version: 1 },
      },
    }),
    "pt-BR",
    false,
  )
  const by = (partial: Partial<typeof NO_FILTER>) => ({ ...NO_FILTER, ...partial })

  it("returns the same array when nothing is filtered", () => {
    expect(filterRows(rows, NO_FILTER)).toBe(rows)
  })

  it("filters by category", () => {
    expect(filterRows(rows, by({ category: "captions" })).map((row) => row.id)).toEqual(["pg001_im001"])
  })

  it("searches id, source and translation", () => {
    expect(filterRows(rows, by({ search: "im001" })).map((row) => row.id)).toEqual(["pg001_im001"])
    expect(filterRows(rows, by({ search: "sleeping" })).map((row) => row.id)).toEqual(["pg001_im001"])
    expect(filterRows(rows, by({ search: "mundo" })).map((row) => row.id)).toEqual(["pg001_p000"])
  })

  it("combines category and search", () => {
    expect(filterRows(rows, by({ category: "captions", search: "mundo" }))).toEqual([])
  })

  it("keeps only untranslated rows", () => {
    expect(filterRows(rows, by({ status: "untranslated" })).map((row) => row.id)).toEqual(["pg001_im001", "pg002_p000"])
  })

  it("keeps one page's rows", () => {
    expect(filterRows(rows, by({ pageId: "pg002" })).map((row) => row.id)).toEqual(["pg002_p000"])
  })

  it("leaves one filter out so a control can count what it would show", () => {
    const filter = by({ category: "captions", search: "o" })
    expect(filterRows(rows, filter, "category").map((row) => row.id)).toEqual(["pg001_p000", "pg002_p000"])
    expect(filterRows(rows, filter, "search").map((row) => row.id)).toEqual(["pg001_im001"])
  })
})

describe("Easy Read rows", () => {
  const source = catalog({
    entries: [{ id: "pg001_n0001", text: "Olá" }],
    translations: {
      en: {
        entries: [
          { id: "pg001_n0001", text: "Hello" },
          { id: "pg001_n0001_easy_read", text: "Hi" },
        ],
        version: 1,
      },
    },
  })
  const easyRead = [
    { id: "pg001_n0001_easy_read", text: "Oi" },
    { id: "pg001_n0001", text: "duplicate" },
  ]

  it("adds Easy Read entries the catalog doesn't hold", () => {
    expect(sourceEntriesOf(source, easyRead).map((entry) => entry.id)).toEqual(["pg001_n0001", "pg001_n0001_easy_read"])
  })

  it("carries their translations", () => {
    const rows = buildRows(source, "en", false, easyRead)
    expect(rows[1]).toMatchObject({ id: "pg001_n0001_easy_read", source: "Oi", target: "Hi", category: "easy-read", readOnly: false })
  })

  it("keeps them read-only in the book language", () => {
    const rows = buildRows(source, "pt", true, easyRead)
    expect(rows.map((row) => row.readOnly)).toEqual([false, true])
  })
})

describe("translation counts", () => {
  it("counts only translated source ids", () => {
    const ids = new Set(["a", "b", "c"])
    expect(countTranslated(ids, [{ id: "a", text: "x" }, { id: "b", text: "  " }, { id: "z", text: "y" }])).toBe(1)
    expect(countTranslated(ids, undefined)).toBe(0)
  })

  it("only treats a non-base language with text as translated", () => {
    expect(hasAnyTranslation(catalog({ translations: { "pt-BR": { entries: [{ id: "a", text: "x" }], version: 1 } } }), "pt")).toBe(false)
    expect(hasAnyTranslation(catalog({ translations: { en: { entries: [{ id: "a", text: " " }], version: 1 } } }), "pt")).toBe(false)
    expect(hasAnyTranslation(catalog({ translations: { en: { entries: [{ id: "a", text: "x" }], version: 1 } } }), "pt")).toBe(true)
    expect(hasAnyTranslation(null, "pt")).toBe(false)
  })
})

describe("patchCatalog", () => {
  const source = catalog({
    entries: [{ id: "a", text: "um" }],
    translations: { en: { entries: [{ id: "a", text: "one" }], version: 3 } },
  })

  it("patches the source entries in the book language", () => {
    const next = patchCatalog(source, "pt", true, "a", "uno")
    expect(entriesFor(next, "pt", true)).toEqual([{ id: "a", text: "uno" }])
    expect(next.translations).toBe(source.translations)
  })

  it("patches a translation and keeps its version", () => {
    const next = patchCatalog(source, "en", false, "a", "first")
    expect(next.translations.en).toEqual({ version: 3, entries: [{ id: "a", text: "first" }] })
    expect(next.entries).toBe(source.entries)
  })

  it("creates a translation that didn't exist yet", () => {
    const next = patchCatalog(source, "fr", false, "a", "un")
    expect(entriesFor(next, "fr", false)).toEqual([{ id: "a", text: "un" }])
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
