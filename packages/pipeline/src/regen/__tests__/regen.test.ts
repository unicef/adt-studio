import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { computeSpeechCacheKey as realCacheKey, stripEmojis as realStripEmojis } from "../../speech.js"
import { emitRegenAssets } from "../regen-emit.js"
import { REGEN_SCRIPT_SOURCE } from "../regen-source.generated.js"
// The .mjs guards its own main(), so importing it only pulls in the helpers.
import {
  computeSpeechCacheKey as scriptCacheKey,
  stripEmojis as scriptStripEmojis,
  main as runScript,
} from "../regenerate-tts.mjs"

const mjsPath = fileURLToPath(new URL("../regenerate-tts.mjs", import.meta.url))

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
})

describe("regen-source.generated.ts drift", () => {
  it("embedded script matches the source .mjs (run gen-regen-source.mjs after editing)", () => {
    expect(REGEN_SCRIPT_SOURCE).toBe(fs.readFileSync(mjsPath, "utf-8"))
  })
})

// ---------------------------------------------------------------------------
// End-to-end: emit assets into a fake bundle, then run the script against it.
// ---------------------------------------------------------------------------

function makeBundle(): { root: string; audioDir: string; textsFile: string } {
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
        wordHighlighting: false,
        entries: [
          { textId: "t1", fileName: "t1.mp3", text: "Hello world" },
          { textId: "t2", fileName: "t2.mp3", text: "Second line" },
        ],
        manualTextIds: [],
        manualTexts: {},
      },
    ],
  })
  return { root, audioDir, textsFile }
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
      expect(manifest.languages.en.entries.t1).toBe(key)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe("regenerate-tts.mjs run", () => {
  const origArgv = process.argv
  const origKey = process.env.OPENAI_API_KEY
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key"
    fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/audio/speech")) {
        return { ok: true, arrayBuffer: async () => new Uint8Array([9, 9, 9, 9]).buffer } as unknown as Response
      }
      if (String(url).includes("/audio/transcriptions")) {
        return { ok: true, json: async () => ({ words: [{ word: "hello", start: 0, end: 0.4 }] }) } as unknown as Response
      }
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    process.argv = origArgv
    if (origKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = origKey
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
            entries: [{ textId: "t1", fileName: "t1.mp3", text: "Hello world" }],
            manualTextIds: ["m1"],
            manualTexts: { m1: "Recorded text" },
          },
        ],
      })

      // Edit the manual clip's text — it must NOT be regenerated.
      fs.writeFileSync(path.join(localeDir, "texts.json"), JSON.stringify({ t1: "Hello world", m1: "Changed text" }))
      process.argv = ["node", mjsPath, root]
      await runScript()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(fs.readFileSync(path.join(audioDir, "m1.mp3")).toString()).toBe("HUMAN-RECORDING")
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
