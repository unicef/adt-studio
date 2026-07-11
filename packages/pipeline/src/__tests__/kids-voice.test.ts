import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getKidsSpeakableLines } from "@adt/types"
import {
  generateKidsVoicePack,
  resolveKidsLineText,
} from "../kids-voice.js"

let tmpDir: string

function makeSynth() {
  return {
    synthesize: vi.fn(async () => new Uint8Array([1, 2, 3])),
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kids-voice-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("resolveKidsLineText", () => {
  it("prefers the catalog translation and interpolates the buddy name", () => {
    const text = resolveKidsLineText({
      lineKey: "kids-pick-phrase-hi",
      fallback: "Hi! I'm ${name}!",
      language: "es",
      characterId: "dino",
      dict: {
        "kids-pick-phrase-hi": "¡Hola! ¡Soy ${name}!",
        "kids-character-dino-default-name": "Rex",
      },
    })
    expect(text).toBe("¡Hola! ¡Soy Rex!")
  })

  it("falls back to English with the default buddy name", () => {
    const text = resolveKidsLineText({
      lineKey: "kids-pick-phrase-hi",
      fallback: "Hi! I'm ${name}!",
      language: "en",
      characterId: "bunny",
      dict: {},
    })
    expect(text).toBe("Hi! I'm Pip!")
  })

  it("interpolates the language display name", () => {
    const text = resolveKidsLineText({
      lineKey: "kids-confirm-language",
      fallback: "Okay, ${language} is on!",
      language: "es",
      characterId: "cat",
      dict: {},
    })
    expect(text).toBe("Okay, Español is on!")
  })
})

describe("generateKidsVoicePack", () => {
  it("writes clips, manifest, and cache entries for one buddy/language", async () => {
    const synth = makeSynth()
    const result = await generateKidsVoicePack({
      bookDir: tmpDir,
      cacheDir: path.join(tmpDir, ".cache"),
      languages: ["en"],
      characters: ["dino"],
      translationsByLanguage: { en: {} },
      ttsSynthesizer: synth,
      model: "gpt-4o-mini-tts",
    })

    const expectedLines = getKidsSpeakableLines("dino")
    expect(result.total).toBe(expectedLines.length)
    expect(result.generated).toBe(expectedLines.length)
    expect(result.cachedHits).toBe(0)
    expect(synth.synthesize).toHaveBeenCalledTimes(expectedLines.length)

    const manifestPath = path.join(tmpDir, "kids-voice", "en", "manifest.json")
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    expect(manifest.version).toBe(1)
    expect(Object.keys(manifest.characters)).toEqual(["dino"])
    expect(manifest.characters.dino["kids-buddy-greet"]).toBe(
      "dino/kids-buddy-greet.mp3",
    )
    expect(
      fs.existsSync(
        path.join(tmpDir, "kids-voice", "en", "dino", "kids-buddy-greet.mp3"),
      ),
    ).toBe(true)
  })

  it("serves every clip from cache on a re-run without synthesizing", async () => {
    const options = {
      bookDir: tmpDir,
      cacheDir: path.join(tmpDir, ".cache"),
      languages: ["en"],
      characters: ["robot"] as string[],
      translationsByLanguage: { en: {} },
      model: "gpt-4o-mini-tts",
    }
    await generateKidsVoicePack({ ...options, ttsSynthesizer: makeSynth() })

    const secondSynth = makeSynth()
    const rerun = await generateKidsVoicePack({
      ...options,
      ttsSynthesizer: secondSynth,
    })
    expect(rerun.cachedHits).toBe(rerun.total)
    expect(rerun.generated).toBe(0)
    expect(secondSynth.synthesize).not.toHaveBeenCalled()
  })

  it("dry run reports the plan without writing or synthesizing", async () => {
    const synth = makeSynth()
    const result = await generateKidsVoicePack({
      bookDir: tmpDir,
      cacheDir: path.join(tmpDir, ".cache"),
      languages: ["en", "es"],
      characters: ["dino", "cat"],
      translationsByLanguage: { en: {}, es: {} },
      ttsSynthesizer: synth,
      model: "gpt-4o-mini-tts",
      dryRun: true,
    })

    expect(result.dryRun).toBe(true)
    expect(result.total).toBe(
      (getKidsSpeakableLines("dino").length +
        getKidsSpeakableLines("cat").length) *
        2,
    )
    expect(result.generated).toBe(0)
    expect(synth.synthesize).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(tmpDir, "kids-voice"))).toBe(false)
  })

  it("rejects path-traversal language codes", async () => {
    await expect(
      generateKidsVoicePack({
        bookDir: tmpDir,
        cacheDir: path.join(tmpDir, ".cache"),
        languages: ["../evil"],
        characters: ["dino"],
        translationsByLanguage: {},
        ttsSynthesizer: makeSynth(),
        model: "gpt-4o-mini-tts",
      }),
    ).rejects.toThrow(/Invalid language code/)
  })
})
