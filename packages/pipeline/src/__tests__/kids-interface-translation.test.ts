import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { LLMModel } from "@adt/llm"
import {
  readKidsInterfaceOverrides,
  readKidsInterfaceSource,
  translateKidsInterface,
} from "../kids-interface-translation.js"

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kids-i18n-"))
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function writeEnCatalog(webAssetsDir: string, entries: Record<string, string>) {
  const dir = path.join(webAssetsDir, "interface_translations", "en")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, "interface_translations.json"),
    JSON.stringify(entries, null, 2),
  )
}

// Mock LLM that echoes each input text with a language tag, preserving order
// and count (translateCatalogBatch validates count === entries).
function mockModel(): LLMModel {
  return {
    generateObject: async ({
      context,
    }: {
      context: { texts: { index: number; text: string }[] }
    }) => ({
      object: {
        translations: context.texts.map((t) => `[xx] ${t.text}`),
      },
    }),
  } as unknown as LLMModel
}

describe("readKidsInterfaceSource", () => {
  it("returns only the kids-* subset of the English catalog", () => {
    const webAssetsDir = path.join(tmp, "assets")
    writeEnCatalog(webAssetsDir, {
      "sidebar-settings": "Settings",
      "kids-buddy-greet": "Hi! Tap me if you need help.",
      "kids-comfort-title": "Make it comfy",
    })
    const source = readKidsInterfaceSource(webAssetsDir)
    expect(Object.keys(source).sort()).toEqual([
      "kids-buddy-greet",
      "kids-comfort-title",
    ])
  })
})

describe("translateKidsInterface", () => {
  it("translates kids strings per target language, skipping the source", async () => {
    const webAssetsDir = path.join(tmp, "assets")
    const bookDir = path.join(tmp, "book")
    fs.mkdirSync(bookDir, { recursive: true })
    writeEnCatalog(webAssetsDir, {
      "kids-buddy-greet": "Hi! Tap me if you need help.",
      "kids-comfort-title": "Make it comfy",
    })

    const result = await translateKidsInterface({
      bookDir,
      webAssetsDir,
      sourceLanguage: "en",
      targetLanguages: ["en", "pt-BR"], // en is the source → skipped
      appConfig: {} as never,
      llmModel: mockModel(),
    })

    expect(result.keyCount).toBe(2)
    expect(result.languages).toEqual(["pt-BR"])

    const overrides = readKidsInterfaceOverrides(bookDir, "pt-BR")
    expect(overrides["kids-comfort-title"]).toBe("[xx] Make it comfy")
    expect(overrides["kids-buddy-greet"]).toBe(
      "[xx] Hi! Tap me if you need help.",
    )
    // The source language is never written.
    expect(readKidsInterfaceOverrides(bookDir, "en")).toEqual({})
  })

  it("skips a language whose override is already complete (force off)", async () => {
    const webAssetsDir = path.join(tmp, "assets")
    const bookDir = path.join(tmp, "book")
    fs.mkdirSync(path.join(bookDir, "kids-i18n"), { recursive: true })
    writeEnCatalog(webAssetsDir, {
      "kids-buddy-greet": "Hi!",
      "kids-comfort-title": "Make it comfy",
    })
    // pt-BR already fully translated.
    fs.writeFileSync(
      path.join(bookDir, "kids-i18n", "pt-BR.json"),
      JSON.stringify({
        "kids-buddy-greet": "Oi!",
        "kids-comfort-title": "Deixe confortável",
      }),
    )
    const generateObject = vi.fn()
    const model = { generateObject } as unknown as LLMModel

    const result = await translateKidsInterface({
      bookDir,
      webAssetsDir,
      sourceLanguage: "en",
      targetLanguages: ["pt-BR"],
      appConfig: {} as never,
      llmModel: model,
    })

    expect(result.languages).toEqual([])
    expect(generateObject).not.toHaveBeenCalled()
  })

  it("re-translates a complete language when forced", async () => {
    const webAssetsDir = path.join(tmp, "assets")
    const bookDir = path.join(tmp, "book")
    fs.mkdirSync(path.join(bookDir, "kids-i18n"), { recursive: true })
    writeEnCatalog(webAssetsDir, { "kids-buddy-greet": "Hi!" })
    fs.writeFileSync(
      path.join(bookDir, "kids-i18n", "pt-BR.json"),
      JSON.stringify({ "kids-buddy-greet": "old" }),
    )

    const result = await translateKidsInterface({
      bookDir,
      webAssetsDir,
      sourceLanguage: "en",
      targetLanguages: ["pt-BR"],
      appConfig: {} as never,
      llmModel: mockModel(),
      force: true,
    })

    expect(result.languages).toEqual(["pt-BR"])
    expect(readKidsInterfaceOverrides(bookDir, "pt-BR")["kids-buddy-greet"]).toBe(
      "[xx] Hi!",
    )
  })

  it("no-ops when there are no kids keys to translate", async () => {
    const webAssetsDir = path.join(tmp, "assets")
    const bookDir = path.join(tmp, "book")
    fs.mkdirSync(bookDir, { recursive: true })
    writeEnCatalog(webAssetsDir, { "sidebar-settings": "Settings" })

    const result = await translateKidsInterface({
      bookDir,
      webAssetsDir,
      sourceLanguage: "en",
      targetLanguages: ["pt-BR"],
      appConfig: {} as never,
      llmModel: mockModel(),
    })
    expect(result).toEqual({ languages: [], keyCount: 0 })
  })
})
