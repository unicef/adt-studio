import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { KIDS_NARRATOR_ID, getKidsNarratorLines, getKidsSpeakableLines } from "@adt/types"
import {
  computeKidsVoicePackFingerprint,
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

  it("shares one global cache across books — the second book costs nothing", async () => {
    const globalCache = path.join(tmpDir, ".kids-voice-cache")
    const bookA = path.join(tmpDir, "book-a")
    const bookB = path.join(tmpDir, "book-b")
    const shared = {
      cacheDir: globalCache,
      languages: ["en"],
      characters: ["bunny"] as string[],
      translationsByLanguage: { en: {} },
      model: "gpt-4o-mini-tts",
    }
    await generateKidsVoicePack({
      ...shared,
      bookDir: bookA,
      ttsSynthesizer: makeSynth(),
    })

    const secondSynth = makeSynth()
    const bookBRun = await generateKidsVoicePack({
      ...shared,
      bookDir: bookB,
      ttsSynthesizer: secondSynth,
    })
    expect(bookBRun.cachedHits).toBe(bookBRun.total)
    expect(secondSynth.synthesize).not.toHaveBeenCalled()
    expect(
      fs.existsSync(
        path.join(bookB, "kids-voice", "en", "bunny", "kids-buddy-greet.mp3"),
      ),
    ).toBe(true)
  })

  it("promotes legacy per-book cache hits into the primary cache", async () => {
    const legacyCache = path.join(tmpDir, ".cache")
    const globalCache = path.join(tmpDir, ".kids-voice-cache")
    const options = {
      bookDir: tmpDir,
      languages: ["en"],
      characters: ["cat"] as string[],
      translationsByLanguage: { en: {} },
      model: "gpt-4o-mini-tts",
    }
    // Seed the legacy location the way the pre-global-cache route did.
    await generateKidsVoicePack({
      ...options,
      cacheDir: legacyCache,
      ttsSynthesizer: makeSynth(),
    })

    const synth = makeSynth()
    const migrated = await generateKidsVoicePack({
      ...options,
      cacheDir: globalCache,
      fallbackCacheDirs: [legacyCache],
      ttsSynthesizer: synth,
    })
    expect(migrated.cachedHits).toBe(migrated.total)
    expect(synth.synthesize).not.toHaveBeenCalled()
    // Promoted: the global cache now holds the clips itself.
    expect(fs.readdirSync(path.join(globalCache, "tts")).length).toBe(
      migrated.total,
    )
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

  it("a voice override changes the cache identity — re-synthesizes even though the default was already cached", async () => {
    const cacheDir = path.join(tmpDir, ".cache")
    const baseOptions = {
      bookDir: tmpDir,
      cacheDir,
      languages: ["en"],
      characters: ["dino"] as string[],
      translationsByLanguage: { en: {} },
      model: "gpt-4o-mini-tts",
    }

    // Prime the cache with the default voice.
    await generateKidsVoicePack({
      ...baseOptions,
      ttsSynthesizer: makeSynth(),
    })

    // Re-run unchanged: fully cached, no synthesis.
    const unchangedSynth = makeSynth()
    const unchangedRun = await generateKidsVoicePack({
      ...baseOptions,
      ttsSynthesizer: unchangedSynth,
    })
    expect(unchangedRun.cachedHits).toBe(unchangedRun.total)
    expect(unchangedSynth.synthesize).not.toHaveBeenCalled()

    // Re-run with an override: cache key changes, so it must resynthesize.
    const overriddenSynth = makeSynth()
    const overriddenRun = await generateKidsVoicePack({
      ...baseOptions,
      ttsSynthesizer: overriddenSynth,
      voiceOverrides: {
        dino: { voice: "nova", instructions: "A completely different tone." },
      },
    })
    expect(overriddenRun.cachedHits).toBe(0)
    expect(overriddenRun.generated).toBe(overriddenRun.total)
    expect(overriddenSynth.synthesize).toHaveBeenCalledTimes(
      overriddenRun.total,
    )
    for (const call of overriddenSynth.synthesize.mock.calls) {
      expect(call[0].voice).toBe("nova")
      expect(call[0].instructions).toBe("A completely different tone.")
    }
  })
})

describe("generateKidsVoicePack — narrator track", () => {
  it("generates a narrator track under the narrator id with the given book voice", async () => {
    const synth = makeSynth()
    const result = await generateKidsVoicePack({
      bookDir: tmpDir,
      cacheDir: path.join(tmpDir, ".cache"),
      languages: ["en"],
      characters: ["dino"],
      translationsByLanguage: { en: {} },
      narratorVoiceByLanguage: {
        en: { voice: "alloy", instructions: "Neutral narrator voice." },
      },
      ttsSynthesizer: synth,
      model: "gpt-4o-mini-tts",
    })

    const buddyLines = getKidsSpeakableLines("dino").length
    const narratorLines = getKidsNarratorLines().length
    expect(result.total).toBe(buddyLines + narratorLines)

    const manifestPath = path.join(tmpDir, "kids-voice", "en", "manifest.json")
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    expect(Object.keys(manifest.characters).sort()).toEqual(
      ["dino", KIDS_NARRATOR_ID].sort(),
    )
    expect(manifest.characters[KIDS_NARRATOR_ID]["kids-onboarding-welcome-title"]).toBe(
      `${KIDS_NARRATOR_ID}/kids-onboarding-welcome-title.mp3`,
    )
    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          "kids-voice",
          "en",
          KIDS_NARRATOR_ID,
          "kids-onboarding-welcome-title.mp3",
        ),
      ),
    ).toBe(true)

    const narratorCalls = synth.synthesize.mock.calls.filter(
      (call) => call[0].voice === "alloy" && call[0].instructions === "Neutral narrator voice.",
    )
    expect(narratorCalls).toHaveLength(narratorLines)
  })

  it("respects a different voice per language", async () => {
    const synth = makeSynth()
    await generateKidsVoicePack({
      bookDir: tmpDir,
      cacheDir: path.join(tmpDir, ".cache"),
      languages: ["en", "es"],
      characters: ["dino"],
      translationsByLanguage: { en: {}, es: {} },
      narratorVoiceByLanguage: {
        en: { voice: "alloy", instructions: "English narrator." },
        es: { voice: "nova", instructions: "Spanish narrator." },
      },
      ttsSynthesizer: synth,
      model: "gpt-4o-mini-tts",
    })

    const enManifest = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, "kids-voice", "en", "manifest.json"),
        "utf8",
      ),
    )
    const esManifest = JSON.parse(
      fs.readFileSync(
        path.join(tmpDir, "kids-voice", "es", "manifest.json"),
        "utf8",
      ),
    )
    expect(Object.keys(enManifest.characters)).toContain(KIDS_NARRATOR_ID)
    expect(Object.keys(esManifest.characters)).toContain(KIDS_NARRATOR_ID)

    const enCalls = synth.synthesize.mock.calls.filter(
      (call) => call[0].instructions === "English narrator.",
    )
    const esCalls = synth.synthesize.mock.calls.filter(
      (call) => call[0].instructions === "Spanish narrator.",
    )
    expect(enCalls.every((call) => call[0].voice === "alloy")).toBe(true)
    expect(esCalls.every((call) => call[0].voice === "nova")).toBe(true)
    expect(enCalls.length).toBe(getKidsNarratorLines().length)
    expect(esCalls.length).toBe(getKidsNarratorLines().length)
  })

  it("omitting narratorVoiceByLanguage produces no narrator track", async () => {
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

    expect(result.total).toBe(getKidsSpeakableLines("dino").length)
    const manifestPath = path.join(tmpDir, "kids-voice", "en", "manifest.json")
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    expect(Object.keys(manifest.characters)).not.toContain(KIDS_NARRATOR_ID)
  })
})

describe("computeKidsVoicePackFingerprint", () => {
  it("changes when a voice override is supplied and is stable when omitted", () => {
    const base = {
      language: "en",
      characters: ["dino"],
      dict: {},
      model: "gpt-4o-mini-tts",
    }

    const withoutOverride = computeKidsVoicePackFingerprint(base)
    const sameAgain = computeKidsVoicePackFingerprint(base)
    expect(sameAgain).toBe(withoutOverride)

    const withOverride = computeKidsVoicePackFingerprint({
      ...base,
      voiceOverrides: {
        dino: { voice: "nova", instructions: "A completely different tone." },
      },
    })
    expect(withOverride).not.toBe(withoutOverride)
  })

  it("changes when the narrator voice for that language changes", () => {
    const base = {
      language: "en",
      characters: ["dino"],
      dict: {},
      model: "gpt-4o-mini-tts",
    }

    const withoutNarrator = computeKidsVoicePackFingerprint(base)

    const withNarrator = computeKidsVoicePackFingerprint({
      ...base,
      narratorVoiceByLanguage: {
        en: { voice: "alloy", instructions: "Neutral narrator." },
      },
    })
    expect(withNarrator).not.toBe(withoutNarrator)

    const withDifferentNarratorVoice = computeKidsVoicePackFingerprint({
      ...base,
      narratorVoiceByLanguage: {
        en: { voice: "nova", instructions: "Neutral narrator." },
      },
    })
    expect(withDifferentNarratorVoice).not.toBe(withNarrator)

    // A narrator entry for a different language doesn't affect this
    // language's fingerprint.
    const withOtherLanguageNarrator = computeKidsVoicePackFingerprint({
      ...base,
      narratorVoiceByLanguage: {
        es: { voice: "nova", instructions: "Neutral narrator." },
      },
    })
    expect(withOtherLanguageNarrator).toBe(withoutNarrator)
  })
})
