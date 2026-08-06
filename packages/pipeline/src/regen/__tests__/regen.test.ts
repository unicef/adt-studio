import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { computeSpeechCacheKey as realCacheKey, stripEmojis as realStripEmojis } from "../../speech.js"
import { getTextCatalogCategory as realGetCategory, isTtsExcluded as realIsExcluded } from "@adt/types"
import { emitRegenAssets, normalizeRegenSpeechText as emitterNormalizeText } from "../regen-emit.js"
import { OFFLINE_INLINE_BEGIN, OFFLINE_INLINE_END } from "../../packaging/web.js"
import { REGEN_SCRIPT_SOURCE } from "../regen-source.generated.js"
// The .mjs guards its own main(), so importing it only pulls in the helpers.
import {
  computeSpeechCacheKey as scriptCacheKey,
  stripEmojis as scriptStripEmojis,
  normalizeRegenSpeechText as scriptNormalizeText,
  getTextCatalogCategory as scriptGetCategory,
  isTtsExcluded as scriptIsExcluded,
  main as runScript,
} from "../regenerate-tts.mjs"

const mjsPath = fileURLToPath(new URL("../regenerate-tts.mjs", import.meta.url))

function openAiEntry(textId: string, text: string, format = "mp3") {
  return {
    textId,
    fileName: `${textId}.${format}`,
    text,
    provider: "openai",
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    instructions: "",
    format,
  }
}

describe("regenerate-tts cache-key parity with speech.ts", () => {
  it("stripEmojis matches the pipeline implementation", () => {
    for (const s of ["hello", "hi 😀 there", "🚀 launch", "áéí ñ", ""]) {
      expect(scriptStripEmojis(s)).toBe(realStripEmojis(s))
    }
  })

  it("computeSpeechCacheKey matches for openai and gemini inputs", () => {
    const cases = [
      { text: "Hello world", voice: "alloy", model: "gpt-4o-mini-tts", instructions: "", provider: "openai" },
      { text: "Con acento", voice: "alloy", model: "gpt-4o-mini-tts", instructions: "Speak Spanish", provider: "openai" },
      // Gemini sampling params fold in ONLY for gemini and ONLY when set.
      { text: "Oi", voice: "Kore", model: "gemini-2.5-flash-preview-tts", instructions: "", provider: "gemini" },
      { text: "Oi", voice: "Kore", model: "gemini-2.5-flash-preview-tts", instructions: "", provider: "gemini", geminiTemperature: 0.2, geminiSeed: 7 },
      // A set param on a non-gemini provider must NOT change the key.
      { text: "Oi", voice: "alloy", model: "gpt-4o-mini-tts", instructions: "", provider: "openai", geminiTemperature: 0.9 },
    ]
    for (const c of cases) {
      expect(scriptCacheKey(c)).toBe(realCacheKey(c))
    }
  })

  it("normalizes packaged MathML identically", () => {
    const text = 'The area is <math><mrow><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow></math> &amp; more'
    expect(scriptNormalizeText(text)).toBe("The area is π r 2 & more")
    expect(scriptNormalizeText(text)).toBe(emitterNormalizeText(text))
    expect(scriptNormalizeText("2 < 3 and 4 > 1")).toBe("2 < 3 and 4 > 1")
    expect(scriptNormalizeText("Keep &#99999999; intact")).toBe("Keep &#99999999; intact")
  })
})

describe("regenerate-tts category + exclusion parity with @adt/types", () => {
  const ids = [
    "pg001_n0001", // text
    "pg001_im003", // captions
    "pg001_sec001_ans_key", // answers
    "gl001", // glossary
    "gl_manual_foo", // glossary
    "pg001_n0002_easy_read", // easy-read
  ]

  it("getTextCatalogCategory matches", () => {
    for (const id of ids) expect(scriptGetCategory(id)).toBe(realGetCategory(id))
  })

  it("isTtsExcluded matches (categories + textIds, incl. easy-read inheritance)", () => {
    const script = { categories: ["answers"], textIds: ["pg001_n0009"] }
    const real = { excluded_categories: ["answers"], excluded_text_ids: ["pg001_n0009"] }
    for (const id of [...ids, "pg001_n0009", "pg001_n0009_easy_read", "pg001_sec001_ans_key_easy_read"]) {
      expect(scriptIsExcluded(id, script)).toBe(realIsExcluded(id, real))
    }
  })
})

describe("regen-source.generated.ts drift", () => {
  it("embedded script matches the source .mjs (run gen-regen-source.mjs after editing)", () => {
    expect(REGEN_SCRIPT_SOURCE).toBe(fs.readFileSync(mjsPath, "utf-8"))
  })
})

// ---------------------------------------------------------------------------
// End-to-end: emit assets into a fake bundle, then run the script against it.
// ---------------------------------------------------------------------------

function makeBundle(opts: { wordHighlighting?: boolean } = {}): {
  root: string
  audioDir: string
  textsFile: string
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-regen-"))
  const localeDir = path.join(root, "content", "i18n", "en")
  const audioDir = path.join(localeDir, "audio")
  fs.mkdirSync(audioDir, { recursive: true })
  fs.mkdirSync(path.join(localeDir, "timecode"), { recursive: true })

  const textsFile = path.join(localeDir, "texts.json")
  fs.writeFileSync(textsFile, JSON.stringify({ t1: "Hello world", t2: "Second line" }))
  fs.writeFileSync(path.join(localeDir, "audios.json"), JSON.stringify({ t1: "t1.mp3", t2: "t2.mp3" }))
  fs.writeFileSync(path.join(localeDir, "timecode", "timecode_output.json"), JSON.stringify({}))
  fs.writeFileSync(path.join(audioDir, "t1.mp3"), Buffer.from("ORIGINAL-AUDIO-1"))
  fs.writeFileSync(path.join(audioDir, "t2.mp3"), Buffer.from("ORIGINAL-AUDIO-2"))

  emitRegenAssets({
    adtDir: root,
    languages: [
      {
        lang: "en",
        provider: "openai",
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        instructions: "",
        format: "mp3",
        wordHighlighting: opts.wordHighlighting ?? false,
        entries: [openAiEntry("t1", "Hello world"), openAiEntry("t2", "Second line")],
        manualTextIds: [],
        manualTexts: {},
        manualFiles: {},
      },
    ],
  })
  return { root, audioDir, textsFile }
}

function editConfig(root: string, mutate: (cfg: Record<string, unknown>) => void): void {
  const p = path.join(root, "tools", "tts.config.json")
  const cfg = JSON.parse(fs.readFileSync(p, "utf-8"))
  mutate(cfg)
  fs.writeFileSync(p, JSON.stringify(cfg))
}

function readJsonFile(p: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(p, "utf-8"))
}

/**
 * Stand in for `assets/offline-preloader.js`. Built from the same fences the
 * packager writes, so this breaks if the two sides ever drift apart.
 */
function writeOfflinePreloader(root: string, inline: Record<string, unknown>): string {
  const file = path.join(root, "assets", "offline-preloader.js")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    `(function () {\n  var INLINE = ${OFFLINE_INLINE_BEGIN}${JSON.stringify(inline)}${OFFLINE_INLINE_END};\n})();\n`,
  )
  return file
}

function readInlinedSnapshot(file: string): Record<string, unknown> {
  const source = fs.readFileSync(file, "utf-8")
  const begin = source.indexOf(OFFLINE_INLINE_BEGIN) + OFFLINE_INLINE_BEGIN.length
  return JSON.parse(source.slice(begin, source.indexOf(OFFLINE_INLINE_END, begin)))
}

describe("emitRegenAssets", () => {
  it("ships manifest, config, script, README, and records baseline keys (no audio duplicated)", () => {
    const { root } = makeBundle()
    try {
      expect(fs.existsSync(path.join(root, "regen", "manifest.json"))).toBe(true)
      expect(fs.existsSync(path.join(root, "tools", "tts.config.json"))).toBe(true)
      expect(fs.existsSync(path.join(root, "tools", "regenerate-tts.mjs"))).toBe(true)
      expect(fs.existsSync(path.join(root, "tools", "README.md"))).toBe(true)
      // Manifest-only: no cache blobs are shipped (audio is not duplicated).
      expect(fs.existsSync(path.join(root, "regen", "cache"))).toBe(false)

      const key = realCacheKey({
        text: "Hello world",
        voice: "alloy",
        model: "gpt-4o-mini-tts",
        instructions: "",
        provider: "openai",
      })
      const manifest = JSON.parse(fs.readFileSync(path.join(root, "regen", "manifest.json"), "utf-8"))
      expect(manifest.version).toBe(3)
      expect(manifest.languages.en.entries.t1).toBe(key)
      // Settings live in `defaults`; per-entry copies are stored only for
      // entries that differ from it (provider fallbacks), so the manifest does
      // not repeat the instructions string once per unit.
      expect(manifest.languages.en.defaults).toMatchObject({
        provider: "openai",
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        format: "mp3",
      })
      expect(manifest.languages.en.entrySettings).toEqual({})
      expect(manifest.languages.en.entryConfigBaselines).toBeUndefined()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("regenerate-tts.mjs run", () => {
  const origArgv = process.argv
  const origKey = process.env.OPENAI_API_KEY
  const origGeminiKey = process.env.GEMINI_API_KEY
  const origTtsKey = process.env.TTS_API_KEY
  const origExitCode = process.exitCode
  const geminiPcmBase64 = Buffer.from([1, 2, 3, 4]).toString("base64")
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key"
    process.env.GEMINI_API_KEY = "test-gemini-key"
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/audio/speech")) {
        return { ok: true, arrayBuffer: async () => new Uint8Array([9, 9, 9, 9]).buffer } as unknown as Response
      }
      if (String(url).includes("/audio/transcriptions")) {
        return { ok: true, json: async () => ({ words: [{ word: "hello", start: 0, end: 0.4 }] }) } as unknown as Response
      }
      if (String(url).includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: geminiPcmBase64 } }] } }],
            }),
        } as unknown as Response
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    process.argv = origArgv
    if (origKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = origKey
    if (origGeminiKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = origGeminiKey
    if (origTtsKey === undefined) delete process.env.TTS_API_KEY
    else process.env.TTS_API_KEY = origTtsKey
    process.exitCode = origExitCode
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("makes no API call when nothing changed", async () => {
    const { root, audioDir } = makeBundle()
    try {
      process.argv = ["node", mjsPath, root]
      await runScript()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(fs.readFileSync(path.join(audioDir, "t1.mp3")).toString()).toBe("ORIGINAL-AUDIO-1")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("regenerates only the edited line", async () => {
    const { root, audioDir, textsFile } = makeBundle()
    try {
      // Edit t1's text; leave t2 untouched.
      fs.writeFileSync(textsFile, JSON.stringify({ t1: "Hello there", t2: "Second line" }))
      process.argv = ["node", mjsPath, root]
      await runScript()

      // One TTS call (for t1 only), and t1's audio replaced with the synthesized bytes.
      const speechCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/audio/speech"))
      expect(speechCalls).toHaveLength(1)
      expect(Array.from(fs.readFileSync(path.join(audioDir, "t1.mp3")))).toEqual([9, 9, 9, 9])
      // t2 was not touched.
      expect(fs.readFileSync(path.join(audioDir, "t2.mp3")).toString()).toBe("ORIGINAL-AUDIO-2")

      // The updated baseline was persisted, so a re-run with no edits is a no-op.
      fetchMock.mockClear()
      await runScript()
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("never regenerates manual audio but warns on text change", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-regen-manual-"))
    try {
      const localeDir = path.join(root, "content", "i18n", "en")
      const audioDir = path.join(localeDir, "audio")
      fs.mkdirSync(audioDir, { recursive: true })
      fs.writeFileSync(path.join(localeDir, "texts.json"), JSON.stringify({ t1: "Hello world", m1: "Recorded text" }))
      fs.writeFileSync(path.join(localeDir, "audios.json"), JSON.stringify({ t1: "t1.mp3", m1: "m1.mp3" }))
      fs.writeFileSync(path.join(audioDir, "t1.mp3"), Buffer.from("ORIGINAL-AUDIO-1"))
      fs.writeFileSync(path.join(audioDir, "m1.mp3"), Buffer.from("HUMAN-RECORDING"))

      emitRegenAssets({
        adtDir: root,
        languages: [
          {
            lang: "en",
            provider: "openai",
            model: "gpt-4o-mini-tts",
            voice: "alloy",
            instructions: "",
            format: "mp3",
            wordHighlighting: false,
            entries: [openAiEntry("t1", "Hello world")],
            manualTextIds: ["m1"],
            manualTexts: { m1: "Recorded text" },
            manualFiles: { m1: "m1.mp3" },
          },
        ],
      })

      // Edit the manual clip's text — it must NOT be regenerated.
      fs.writeFileSync(path.join(localeDir, "texts.json"), JSON.stringify({ t1: "Hello world", m1: "Changed text" }))
      process.argv = ["node", mjsPath, root]
      await runScript()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(fs.readFileSync(path.join(audioDir, "m1.mp3")).toString()).toBe("HUMAN-RECORDING")

      // Excluding a manual entry mutes it without deleting the recording, and
      // removing the exclusion restores the original audios.json mapping.
      editConfig(root, (cfg) => { (cfg.exclude as { textIds: string[] }).textIds = ["m1"] })
      await runScript()
      let audios = readJsonFile(path.join(localeDir, "audios.json"))
      expect(audios.m1).toBeUndefined()
      expect(fs.readFileSync(path.join(audioDir, "m1.mp3")).toString()).toBe("HUMAN-RECORDING")

      editConfig(root, (cfg) => { (cfg.exclude as { textIds: string[] }).textIds = [] })
      await runScript()
      audios = readJsonFile(path.join(localeDir, "audios.json"))
      expect(audios.m1).toBe("m1.mp3")
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects a missing --id value instead of broadening --force to the whole bundle", async () => {
    const { root } = makeBundle()
    try {
      process.argv = ["node", mjsPath, root, "--force", "--id"]
      await expect(runScript()).rejects.toThrow("--id requires a value")
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects an audios.json filename that escapes the audio directory", async () => {
    const { root, textsFile } = makeBundle()
    try {
      const localeDir = path.join(root, "content", "i18n", "en")
      fs.writeFileSync(textsFile, JSON.stringify({ t1: "Changed text", t2: "Second line" }))
      fs.writeFileSync(
        path.join(localeDir, "audios.json"),
        JSON.stringify({ t1: "../../../../escaped.mp3", t2: "t2.mp3" }),
      )
      process.argv = ["node", mjsPath, root]
      await runScript()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(fs.existsSync(path.join(root, "escaped.mp3"))).toBe(false)
      expect(process.exitCode).toBe(1)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("--force re-records even unchanged lines", async () => {
    const { root, audioDir } = makeBundle()
    try {
      process.argv = ["node", mjsPath, root, "--force"]
      await runScript()
      const speechCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/audio/speech"))
      expect(speechCalls).toHaveLength(2)
      expect(Array.from(fs.readFileSync(path.join(audioDir, "t1.mp3")))).toEqual([9, 9, 9, 9])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("--force --id re-records only the targeted unit", async () => {
    const { root, audioDir } = makeBundle()
    try {
      process.argv = ["node", mjsPath, root, "--force", "--id", "t1"]
      await runScript()
      const speechCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/audio/speech"))
      expect(speechCalls).toHaveLength(1)
      expect(Array.from(fs.readFileSync(path.join(audioDir, "t1.mp3")))).toEqual([9, 9, 9, 9])
      expect(fs.readFileSync(path.join(audioDir, "t2.mp3")).toString()).toBe("ORIGINAL-AUDIO-2")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("excluding a category drops its audio from audios.json (non-destructive)", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-regen-excl-"))
    try {
      const localeDir = path.join(root, "content", "i18n", "en")
      const audioDir = path.join(localeDir, "audio")
      fs.mkdirSync(audioDir, { recursive: true })
      fs.mkdirSync(path.join(localeDir, "timecode"), { recursive: true })
      fs.writeFileSync(path.join(localeDir, "texts.json"), JSON.stringify({ t1: "Hello world", pg001_ans_a: "The answer" }))
      fs.writeFileSync(path.join(localeDir, "audios.json"), JSON.stringify({ t1: "t1.mp3", pg001_ans_a: "pg001_ans_a.mp3" }))
      fs.writeFileSync(path.join(localeDir, "timecode", "timecode_output.json"), JSON.stringify({}))
      fs.writeFileSync(path.join(audioDir, "t1.mp3"), Buffer.from("A1"))
      fs.writeFileSync(path.join(audioDir, "pg001_ans_a.mp3"), Buffer.from("ANSWER-AUDIO"))

      emitRegenAssets({
        adtDir: root,
        languages: [{
          lang: "en", provider: "openai", model: "gpt-4o-mini-tts", voice: "alloy",
          instructions: "", format: "mp3", wordHighlighting: false,
          entries: [openAiEntry("t1", "Hello world"), openAiEntry("pg001_ans_a", "The answer")],
          manualTextIds: [], manualTexts: {}, manualFiles: {},
        }],
      })

      editConfig(root, (cfg) => { (cfg.exclude as { categories: string[] }).categories = ["answers"] })
      process.argv = ["node", mjsPath, root]
      await runScript()

      expect(fetchMock).not.toHaveBeenCalled()
      let audios = readJsonFile(path.join(localeDir, "audios.json"))
      expect(audios.t1).toBe("t1.mp3")
      expect(audios.pg001_ans_a).toBeUndefined()
      expect(fs.existsSync(path.join(audioDir, "pg001_ans_a.mp3"))).toBe(true)

      // Un-muting restores the mapping from the file still on disk — the text
      // never changed, so it must not cost a TTS call.
      editConfig(root, (cfg) => { (cfg.exclude as { categories: string[] }).categories = [] })
      await runScript()

      expect(fetchMock).not.toHaveBeenCalled()
      audios = readJsonFile(path.join(localeDir, "audios.json"))
      expect(audios.pg001_ans_a).toBe("pg001_ans_a.mp3")
      expect(fs.readFileSync(path.join(audioDir, "pg001_ans_a.mp3")).toString()).toBe("ANSWER-AUDIO")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("re-including a category generates the missing audio", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-regen-incl-"))
    try {
      const localeDir = path.join(root, "content", "i18n", "en")
      const audioDir = path.join(localeDir, "audio")
      fs.mkdirSync(audioDir, { recursive: true })
      fs.mkdirSync(path.join(localeDir, "timecode"), { recursive: true })
      fs.writeFileSync(path.join(localeDir, "texts.json"), JSON.stringify({ t1: "Hello world", pg001_ans_a: "The answer" }))
      fs.writeFileSync(path.join(localeDir, "audios.json"), JSON.stringify({ t1: "t1.mp3" }))
      fs.writeFileSync(path.join(localeDir, "timecode", "timecode_output.json"), JSON.stringify({}))
      fs.writeFileSync(path.join(audioDir, "t1.mp3"), Buffer.from("A1"))

      emitRegenAssets({
        adtDir: root,
        languages: [{
          lang: "en", provider: "openai", model: "gpt-4o-mini-tts", voice: "alloy",
          instructions: "", format: "mp3", wordHighlighting: false,
          entries: [openAiEntry("t1", "Hello world")],
          manualTextIds: [], manualTexts: {}, manualFiles: {},
        }],
        exclude: { categories: ["answers"], textIds: [] },
      })

      editConfig(root, (cfg) => { (cfg.exclude as { categories: string[] }).categories = [] })
      process.argv = ["node", mjsPath, root]
      await runScript()

      const speechCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/audio/speech"))
      expect(speechCalls).toHaveLength(1)
      const audios = readJsonFile(path.join(localeDir, "audios.json"))
      expect(audios.pg001_ans_a).toBe("pg001_ans_a.mp3")
      expect(Array.from(fs.readFileSync(path.join(audioDir, "pg001_ans_a.mp3")))).toEqual([9, 9, 9, 9])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("regenerates a Gemini language, wrapping the returned PCM as WAV", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-regen-gemini-"))
    try {
      const localeDir = path.join(root, "content", "i18n", "es")
      const audioDir = path.join(localeDir, "audio")
      fs.mkdirSync(audioDir, { recursive: true })
      fs.mkdirSync(path.join(localeDir, "timecode"), { recursive: true })
      const textsFile = path.join(localeDir, "texts.json")
      fs.writeFileSync(textsFile, JSON.stringify({ g1: "Hola mundo" }))
      fs.writeFileSync(path.join(localeDir, "audios.json"), JSON.stringify({ g1: "g1.wav" }))
      fs.writeFileSync(path.join(localeDir, "timecode", "timecode_output.json"), JSON.stringify({}))
      fs.writeFileSync(path.join(audioDir, "g1.wav"), Buffer.from("OLD-WAV"))

      emitRegenAssets({
        adtDir: root,
        languages: [{
          lang: "es", provider: "gemini", model: "gemini-2.5-flash-preview-tts", voice: "Kore",
          instructions: "", format: "wav", wordHighlighting: false,
          entries: [{
            textId: "g1", fileName: "g1.wav", text: "Hola mundo", provider: "gemini",
            model: "gemini-2.5-flash-preview-tts", voice: "Kore", instructions: "", format: "wav",
          }],
          manualTextIds: [], manualTexts: {}, manualFiles: {},
        }],
      })

      // Edit the text so it re-records.
      fs.writeFileSync(textsFile, JSON.stringify({ g1: "Hola mundo cambiado" }))
      process.argv = ["node", mjsPath, root]
      await runScript()

      const geminiCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("generativelanguage.googleapis.com"))
      const openaiCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("api.openai.com"))
      expect(geminiCalls).toHaveLength(1)
      expect(openaiCalls).toHaveLength(0) // no OpenAI call for a Gemini language
      // The PCM Gemini returned was wrapped as a canonical WAV.
      const out = fs.readFileSync(path.join(audioDir, "g1.wav"))
      expect(out.subarray(0, 4).toString("ascii")).toBe("RIFF")
      expect(out.subarray(8, 12).toString("ascii")).toBe("WAVE")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("uses per-entry fallback settings without changing the language default", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-regen-mixed-provider-"))
    try {
      const localeDir = path.join(root, "content", "i18n", "es")
      const audioDir = path.join(localeDir, "audio")
      fs.mkdirSync(audioDir, { recursive: true })
      fs.mkdirSync(path.join(localeDir, "timecode"), { recursive: true })
      const textsFile = path.join(localeDir, "texts.json")
      fs.writeFileSync(textsFile, JSON.stringify({ fallback: "Fallback line", gemini: "Gemini line" }))
      fs.writeFileSync(path.join(localeDir, "audios.json"), JSON.stringify({ fallback: "fallback.wav", gemini: "gemini.wav" }))
      fs.writeFileSync(path.join(localeDir, "timecode", "timecode_output.json"), JSON.stringify({}))
      fs.writeFileSync(path.join(audioDir, "fallback.wav"), Buffer.from("OPENAI-FALLBACK"))
      fs.writeFileSync(path.join(audioDir, "gemini.wav"), Buffer.from("GEMINI-AUDIO"))

      emitRegenAssets({
        adtDir: root,
        languages: [{
          lang: "es", provider: "gemini", model: "gemini-2.5-flash-preview-tts", voice: "Kore",
          instructions: "", format: "wav", wordHighlighting: false,
          entries: [
            {
              textId: "fallback", fileName: "fallback.wav", text: "Fallback line", provider: "openai",
              model: "gpt-4o-mini-tts", voice: "alloy", instructions: "", format: "wav",
            },
            {
              textId: "gemini", fileName: "gemini.wav", text: "Gemini line", provider: "gemini",
              model: "gemini-2.5-flash-preview-tts", voice: "Kore", instructions: "", format: "wav",
            },
          ],
          manualTextIds: [], manualTexts: {}, manualFiles: {},
        }],
      })

      const cfg = readJsonFile(path.join(root, "tools", "tts.config.json")) as {
        languages: { es: { provider: string } }
      }
      expect(cfg.languages.es.provider).toBe("gemini")

      fs.writeFileSync(textsFile, JSON.stringify({ fallback: "Edited fallback", gemini: "Gemini line" }))
      process.argv = ["node", mjsPath, root]
      await runScript()

      const openaiCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/audio/speech"))
      const geminiCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("generativelanguage.googleapis.com"))
      expect(openaiCalls).toHaveLength(1)
      expect(geminiCalls).toHaveLength(0)

      // An explicit language-level edit still applies to every entry, including
      // fallback clips whose stored provider differs from the default.
      editConfig(root, (config) => {
        (config.languages as { es: { voice: string } }).es.voice = "Aoede"
      })
      fetchMock.mockClear()
      await runScript()
      const overrideCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("generativelanguage.googleapis.com"))
      expect(overrideCalls).toHaveLength(2)

      editConfig(root, (config) => {
        (config.languages as { es: { voice: string } }).es.voice = "Kore"
      })
      fetchMock.mockClear()
      await runScript()
      const revertCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("generativelanguage.googleapis.com"))
      expect(revertCalls).toHaveLength(2)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("sends visible MathML text rather than markup to TTS", async () => {
    const { root, textsFile } = makeBundle()
    try {
      fs.writeFileSync(
        textsFile,
        JSON.stringify({
          t1: "Updated <math><mrow><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow></math>",
          t2: "Second line",
        }),
      )
      process.argv = ["node", mjsPath, root]
      await runScript()

      const speechCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/audio/speech"))
      const body = JSON.parse(String((speechCall?.[1] as RequestInit | undefined)?.body))
      expect(body.input).toBe("Updated π r 2")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("backfills word timings for audio missing them when highlighting is on", async () => {
    const { root } = makeBundle({ wordHighlighting: true })
    try {
      process.argv = ["node", mjsPath, root]
      await runScript()

      const speechCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/audio/speech"))
      const whisperCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/audio/transcriptions"))
      expect(speechCalls).toHaveLength(0) // no text changed
      expect(whisperCalls).toHaveLength(2) // both units backfilled

      const timecodes = readJsonFile(path.join(root, "content", "i18n", "en", "timecode", "timecode_output.json"))
      expect(timecodes.t1).toBeDefined()
      expect(timecodes.t2).toBeDefined()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("removes stale timings so a later run can retry failed realignment", async () => {
    const { root, textsFile } = makeBundle({ wordHighlighting: true })
    try {
      const timecodeFile = path.join(root, "content", "i18n", "en", "timecode", "timecode_output.json")
      fs.writeFileSync(timecodeFile, JSON.stringify({
        t1: { timecodes: [null, { word_timestamps: [{ text: "old", start: 0, end: 1 }] }] },
        t2: { timecodes: [null, { word_timestamps: [{ text: "second", start: 0, end: 1 }] }] },
      }))
      editConfig(root, (cfg) => {
        (cfg.providers as { openai: { apiKeyEnv: string } }).openai.apiKeyEnv = "TTS_API_KEY"
      })
      process.env.TTS_API_KEY = "tts-key"
      delete process.env.OPENAI_API_KEY
      fs.writeFileSync(textsFile, JSON.stringify({ t1: "Edited line", t2: "Second line" }))
      process.argv = ["node", mjsPath, root]
      await runScript()

      let timecodes = readJsonFile(timecodeFile)
      expect(timecodes.t1).toBeUndefined()
      expect(timecodes.t2).toBeDefined()

      process.env.OPENAI_API_KEY = "whisper-key"
      fetchMock.mockClear()
      await runScript()
      const speechCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/audio/speech"))
      const whisperCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/audio/transcriptions"))
      expect(speechCalls).toHaveLength(0)
      expect(whisperCalls).toHaveLength(1)
      timecodes = readJsonFile(timecodeFile)
      expect(timecodes.t1).toBeDefined()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("stops re-transcribing audio Whisper aligns to zero words", async () => {
    const { root } = makeBundle({ wordHighlighting: true })
    const whisperCalls = (): unknown[] =>
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("/audio/transcriptions"))
    try {
      // Whisper returns no words (bare page numbers and the like do this).
      const emptyWords = { ok: true, json: async () => ({ words: [] }) } as unknown as Response
      const speechOk = {
        ok: true,
        arrayBuffer: async () => new Uint8Array([9, 9, 9, 9]).buffer,
      } as unknown as Response
      fetchMock.mockImplementation(async (url: string) =>
        String(url).includes("/audio/transcriptions") ? emptyWords : speechOk,
      )

      process.argv = ["node", mjsPath, root]
      await runScript()
      expect(whisperCalls()).toHaveLength(2)

      // No text changed and both units are known-unalignable, so a re-run is a
      // true no-op rather than paying for the same two calls again.
      fetchMock.mockClear()
      await runScript()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(process.exitCode).not.toBe(1)

      // --force re-records the audio, which re-queues alignment for it.
      process.argv = ["node", mjsPath, root, "--force"]
      fetchMock.mockClear()
      await runScript()
      expect(whisperCalls()).toHaveLength(2)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("refreshes the inlined offline snapshot the reader serves", async () => {
    const { root, textsFile } = makeBundle()
    try {
      const localeDir = path.join(root, "content", "i18n", "en")
      // The packaged snapshot of the pre-edit book. Note timecode_output.json
      // is deliberately absent, to prove keys are refreshed but never added.
      const preloader = writeOfflinePreloader(root, {
        "./content/i18n/en/texts.json": { t1: "Hello world", t2: "Second line" },
        "./content/i18n/en/audios.json": { t1: "t1.mp3", t2: "t2.mp3" },
      })

      fs.writeFileSync(textsFile, JSON.stringify({ t1: "Hello there", t2: "Second line" }))
      process.argv = ["node", mjsPath, root]
      await runScript()

      const inline = readInlinedSnapshot(preloader)
      expect(inline["./content/i18n/en/texts.json"]).toEqual({ t1: "Hello there", t2: "Second line" })
      expect(inline["./content/i18n/en/timecode/timecode_output.json"]).toBeUndefined()

      // Muting a unit has to reach the snapshot too, or the reader keeps
      // playing audio that is no longer in audios.json.
      editConfig(root, (cfg) => { (cfg.exclude as { textIds: string[] }).textIds = ["t2"] })
      await runScript()

      expect(readJsonFile(path.join(localeDir, "audios.json")).t2).toBeUndefined()
      expect(readInlinedSnapshot(preloader)["./content/i18n/en/audios.json"]).toEqual({ t1: "t1.mp3" })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  // The tests above call main() in-process, which cannot catch the script
  // failing to start at all. Spawn the copy that actually ships in the bundle.
  it("runs when spawned as a script through a symlinked path", () => {
    const { root } = makeBundle()
    const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-regen-link-"))
    try {
      // argv[1] keeps the symlinked path while import.meta.url resolves to the
      // real one; comparing them naively makes the script exit silently.
      const link = path.join(linkDir, "bundle")
      fs.symlinkSync(root, link, "dir")
      const stdout = execFileSync(
        process.execPath,
        [path.join(link, "tools", "regenerate-tts.mjs"), link, "--dry-run"],
        { encoding: "utf-8" },
      )
      expect(stdout).toContain("DRY RUN")
      expect(stdout).toContain("[en] 0 would regenerate, 2 unchanged")
    } finally {
      fs.rmSync(linkDir, { recursive: true, force: true })
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it("leaves a bundle without an offline preloader alone", async () => {
    const { root, textsFile } = makeBundle()
    try {
      fs.writeFileSync(textsFile, JSON.stringify({ t1: "Hello there", t2: "Second line" }))
      process.argv = ["node", mjsPath, root]
      await expect(runScript()).resolves.toBeUndefined()
      expect(fs.existsSync(path.join(root, "assets"))).toBe(false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
