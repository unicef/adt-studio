import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  stripEmojis,
  isSpeakableText,
  resolveVoice,
  resolveInstructions,
  resolveSpeechModel,
  resolveSpeechFormat,
  resolveGeminiTtsRateLimit,
  getDocumentedGeminiTtsRpm,
  generateSpeechFile,
  loadVoicesConfig,
  loadSpeechInstructions,
  type VoiceMaps,
  type InstructionsMap,
} from "../speech.js"

// ---------------------------------------------------------------------------
// stripEmojis
// ---------------------------------------------------------------------------

describe("stripEmojis", () => {
  it("removes emoji characters from text", () => {
    expect(stripEmojis("Hello 😀 World")).toBe("Hello  World")
  })

  it("returns empty string unchanged", () => {
    expect(stripEmojis("")).toBe("")
  })

  it("returns text without emojis unchanged", () => {
    expect(stripEmojis("plain text")).toBe("plain text")
  })

  it("handles text that is all emojis", () => {
    expect(stripEmojis("🎉🎊")).toBe("")
  })

  it("handles unicode text with emojis", () => {
    expect(stripEmojis("Hola 🌍 mundo")).toBe("Hola  mundo")
  })
})

// ---------------------------------------------------------------------------
// isSpeakableText
// ---------------------------------------------------------------------------

describe("isSpeakableText", () => {
  it("returns true for text with letters", () => {
    expect(isSpeakableText("hello")).toBe(true)
  })

  it("returns true for text with numbers", () => {
    expect(isSpeakableText("123")).toBe(true)
  })

  it("returns true for mixed content", () => {
    expect(isSpeakableText("— hello —")).toBe(true)
  })

  it("returns false for punctuation-only text", () => {
    expect(isSpeakableText("—")).toBe(false)
    expect(isSpeakableText("...")).toBe(false)
    expect(isSpeakableText("---")).toBe(false)
    expect(isSpeakableText("• • •")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(isSpeakableText("")).toBe(false)
  })

  it("returns false for whitespace-only", () => {
    expect(isSpeakableText("   ")).toBe(false)
  })

  it("handles unicode letters", () => {
    expect(isSpeakableText("こんにちは")).toBe(true)
    expect(isSpeakableText("مرحبا")).toBe(true)
    expect(isSpeakableText("สวัสดี")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// resolveVoice
// ---------------------------------------------------------------------------

describe("resolveVoice", () => {
  const voiceMaps: VoiceMaps = {
    openai: {
      default: "alloy",
      en: "alloy",
      es: "coral",
      "es-uy": "nova",
    },
  }

  it("resolves exact locale match", () => {
    expect(resolveVoice("openai", "es-uy", voiceMaps)).toBe("nova")
  })

  it("falls back to base language", () => {
    expect(resolveVoice("openai", "es-mx", voiceMaps)).toBe("coral")
  })

  it("falls back to default voice", () => {
    expect(resolveVoice("openai", "fr", voiceMaps)).toBe("alloy")
  })

  it("returns alloy for unknown provider", () => {
    expect(resolveVoice("azure", "en", voiceMaps)).toBe("alloy")
  })

  it("normalizes language code to lowercase", () => {
    expect(resolveVoice("openai", "ES-UY", voiceMaps)).toBe("nova")
    expect(resolveVoice("openai", "EN", voiceMaps)).toBe("alloy")
  })

  it("treats underscore locales as dash locales", () => {
    expect(resolveVoice("openai", "es_UY", voiceMaps)).toBe("nova")
    expect(resolveVoice("openai", "es_MX", voiceMaps)).toBe("coral")
  })

  it("uses defaultVoice as fallback when no match in voiceMaps", () => {
    const noDefault: VoiceMaps = { openai: { es: "coral" } }
    expect(resolveVoice("openai", "fr", noDefault, "shimmer")).toBe("shimmer")
  })

  it("uses defaultVoice for unknown provider", () => {
    expect(resolveVoice("azure", "en", voiceMaps, "shimmer")).toBe("shimmer")
  })

  it("prefers voice map match over defaultVoice", () => {
    expect(resolveVoice("openai", "es-uy", voiceMaps, "shimmer")).toBe("nova")
    expect(resolveVoice("openai", "es-mx", voiceMaps, "shimmer")).toBe("coral")
  })

  it("falls back to a Gemini-safe default voice when no mapping exists", () => {
    expect(resolveVoice("gemini", "en", {})).toBe("Kore")
  })

  it("does not reuse the OpenAI alloy fallback for Gemini voices", () => {
    expect(resolveVoice("gemini", "en", {}, "alloy")).toBe("Kore")
  })
})

// ---------------------------------------------------------------------------
// resolveSpeechModel / resolveSpeechFormat
// ---------------------------------------------------------------------------

describe("resolveSpeechModel", () => {
  it("uses configured provider models when present", () => {
    expect(
      resolveSpeechModel("gemini", {
        gemini: { model: "gemini-custom-tts" },
      })
    ).toBe("gemini-custom-tts")
  })

  it("falls back to provider defaults when provider model is not configured", () => {
    expect(resolveSpeechModel("gemini", {})).toBe("gemini-2.5-flash-preview-tts")
    expect(resolveSpeechModel("azure", {})).toBe("azure-tts")
    expect(resolveSpeechModel("openai", {})).toBe("gpt-4o-mini-tts")
  })

  it("uses the shared default model for non-provider-specific fallbacks", () => {
    expect(resolveSpeechModel("openai", {}, "gpt-4o-audio")).toBe("gpt-4o-audio")
  })
})

describe("getDocumentedGeminiTtsRpm", () => {
  it("maps flash and pro models to their documented ceilings", () => {
    expect(getDocumentedGeminiTtsRpm("gemini-2.5-flash-preview-tts")).toBe(150)
    expect(getDocumentedGeminiTtsRpm("gemini-2.5-pro-preview-tts")).toBe(125)
  })

  it("falls back to a conservative ceiling for unknown models", () => {
    expect(getDocumentedGeminiTtsRpm("gemini-x-tts")).toBe(100)
  })
})

describe("resolveGeminiTtsRateLimit", () => {
  it("defaults to auto mode starting at the model's documented ceiling", () => {
    const flash = resolveGeminiTtsRateLimit({ model: "gemini-2.5-flash-preview-tts" })
    expect(flash).toEqual({ mode: "auto", startRpm: 150, minRpm: 3, maxRpm: 150 })

    const pro = resolveGeminiTtsRateLimit({ model: "gemini-2.5-pro-preview-tts" })
    expect(pro).toEqual({ mode: "auto", startRpm: 125, minRpm: 3, maxRpm: 125 })
  })

  it("treats requests_per_minute: auto the same as omitting it", () => {
    expect(
      resolveGeminiTtsRateLimit({
        model: "gemini-2.5-flash-preview-tts",
        rateLimit: { requests_per_minute: "auto" },
      })
    ).toEqual({ mode: "auto", startRpm: 150, minRpm: 3, maxRpm: 150 })
  })

  it("pins the starting ceiling to a numeric requests_per_minute", () => {
    expect(
      resolveGeminiTtsRateLimit({
        model: "gemini-2.5-flash-preview-tts",
        rateLimit: { requests_per_minute: 30 },
      })
    ).toEqual({ mode: "fixed", startRpm: 30, minRpm: 3, maxRpm: 30 })
  })

  it("honors explicit min/max overrides in auto mode", () => {
    expect(
      resolveGeminiTtsRateLimit({
        model: "gemini-2.5-flash-preview-tts",
        rateLimit: { min_requests_per_minute: 10, max_requests_per_minute: 60 },
      })
    ).toEqual({ mode: "auto", startRpm: 60, minRpm: 10, maxRpm: 60 })
  })
})

describe("resolveSpeechFormat", () => {
  it("forces Gemini output to wav", () => {
    expect(resolveSpeechFormat("gemini", "mp3")).toBe("wav")
  })

  it("keeps the configured format for other providers", () => {
    expect(resolveSpeechFormat("openai", "opus")).toBe("opus")
  })
})

// ---------------------------------------------------------------------------
// resolveInstructions
// ---------------------------------------------------------------------------

describe("resolveInstructions", () => {
  const instructions: InstructionsMap = {
    default: "Speak cheerfully.",
    en: "Speak in English.",
    "en-tz": "Speak in Tanzanian English.",
    es: "Speak in Spanish.",
    ur: "Speak in Urdu.",
  }

  it("resolves exact locale match", () => {
    expect(resolveInstructions("en-tz", instructions)).toBe(
      "Speak in Tanzanian English."
    )
  })

  it("falls back to base language", () => {
    expect(resolveInstructions("en-us", instructions)).toBe(
      "Speak in English."
    )
  })

  it("resolves Urdu locale variants from the base language", () => {
    expect(resolveInstructions("ur-pk", instructions)).toBe("Speak in Urdu.")
    expect(resolveInstructions("ur_PK", instructions)).toBe("Speak in Urdu.")
  })

  it("falls back to default", () => {
    expect(resolveInstructions("fr", instructions)).toBe("Speak cheerfully.")
  })

  it("returns empty string when no default", () => {
    expect(resolveInstructions("fr", {})).toBe("")
  })

  it("normalizes language code to lowercase", () => {
    expect(resolveInstructions("EN-TZ", instructions)).toBe(
      "Speak in Tanzanian English."
    )
  })

  it("treats underscore locales as dash locales", () => {
    expect(resolveInstructions("en_TZ", instructions)).toBe(
      "Speak in Tanzanian English."
    )
  })
})

// ---------------------------------------------------------------------------
// loadVoicesConfig / loadSpeechInstructions
// ---------------------------------------------------------------------------

describe("loadVoicesConfig", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "speech-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("loads voices.yaml from config directory", () => {
    fs.writeFileSync(
      path.join(tmpDir, "voices.yaml"),
      "openai:\n  default: alloy\n  en: shimmer\n"
    )
    const result = loadVoicesConfig(tmpDir)
    expect(result).toEqual({ openai: { default: "alloy", en: "shimmer" } })
  })

  it("returns empty object when file does not exist", () => {
    expect(loadVoicesConfig(tmpDir)).toEqual({})
  })
})

describe("loadSpeechInstructions", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "speech-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("loads speech_instructions.yaml from config directory", () => {
    fs.writeFileSync(
      path.join(tmpDir, "speech_instructions.yaml"),
      'default: "Be cheerful."\nen: "Speak English."\n'
    )
    const result = loadSpeechInstructions(tmpDir)
    expect(result).toEqual({ default: "Be cheerful.", en: "Speak English." })
  })

  it("returns empty object when file does not exist", () => {
    expect(loadSpeechInstructions(tmpDir)).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// generateSpeechFile
// ---------------------------------------------------------------------------

describe("generateSpeechFile", () => {
  let tmpDir: string
  let bookDir: string
  let cacheDir: string

  const mockSynthesize = vi.fn()

  const mockSynthesizer = {
    synthesize: mockSynthesize,
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "speech-gen-"))
    bookDir = path.join(tmpDir, "book")
    cacheDir = path.join(tmpDir, "cache")
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(cacheDir, { recursive: true })

    // Reset mock and set up response
    mockSynthesize.mockReset()
    mockSynthesize.mockResolvedValue(
      new Uint8Array(Buffer.from("fake-audio-data"))
    )
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("generates a speech file and returns metadata", async () => {
    const result = await generateSpeechFile({
      textId: "p001_t001",
      text: "Hello world",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "Speak cheerfully.",
      format: "mp3",
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
    })

    expect(result).toEqual({
      textId: "p001_t001",
      language: "en",
      fileName: "p001_t001.mp3",
      voice: "alloy",
      model: "gpt-4o-mini-tts",
      cached: false,
    })

    // Verify file was written
    const audioPath = path.join(bookDir, "audio", "en", "p001_t001.mp3")
    expect(fs.existsSync(audioPath)).toBe(true)

    // Verify cache was written
    const cacheFiles = fs.readdirSync(path.join(cacheDir, "tts"))
    expect(cacheFiles.length).toBe(1)
    expect(cacheFiles[0]).toMatch(/^[a-f0-9]+\.mp3$/)

    // Verify OpenAI was called correctly
    expect(mockSynthesize).toHaveBeenCalledWith({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: "Hello world",
      responseFormat: "mp3",
      instructions: "Speak cheerfully.",
    })
  })

  it("writes locale audio using normalized locale casing", async () => {
    const result = await generateSpeechFile({
      textId: "p001_t001",
      text: "Hello world",
      language: "en_us",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "",
      format: "mp3",
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
    })

    expect(result?.language).toBe("en-US")
    expect(fs.existsSync(path.join(bookDir, "audio", "en-US", "p001_t001.mp3"))).toBe(true)
    expect(fs.readdirSync(path.join(bookDir, "audio"))).toContain("en-US")
  })

  it("returns cached result on second call", async () => {
    // First call
    await generateSpeechFile({
      textId: "p001_t001",
      text: "Hello world",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "Speak cheerfully.",
      format: "mp3",
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
    })

    expect(mockSynthesize).toHaveBeenCalledTimes(1)

    // Second call with same inputs
    const result = await generateSpeechFile({
      textId: "p001_t001",
      text: "Hello world",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "Speak cheerfully.",
      format: "mp3",
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
    })

    expect(result!.cached).toBe(true)
    expect(mockSynthesize).toHaveBeenCalledTimes(1) // Not called again
  })

  it("only acquires the optional rate limiter when a real synth call is needed", async () => {
    const rateLimiter = {
      acquire: vi.fn().mockResolvedValue(undefined),
    }

    await generateSpeechFile({
      textId: "p001_t001",
      text: "Hello world",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "Speak cheerfully.",
      format: "mp3",
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
      rateLimiter,
    })

    await generateSpeechFile({
      textId: "p001_t001",
      text: "Hello world",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "Speak cheerfully.",
      format: "mp3",
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
      rateLimiter,
    })

    expect(rateLimiter.acquire).toHaveBeenCalledTimes(1)
    expect(mockSynthesize).toHaveBeenCalledTimes(1)
  })

  it("returns null for non-speakable text", async () => {
    const result = await generateSpeechFile({
      textId: "p001_t001",
      text: "—",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "",
      format: "mp3",
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
    })

    expect(result).toBeNull()
    expect(mockSynthesize).not.toHaveBeenCalled()
  })

  it("strips emojis before generating", async () => {
    await generateSpeechFile({
      textId: "p001_t001",
      text: "Hello 😀 world",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "",
      format: "mp3",
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
    })

    expect(mockSynthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Hello  world",
      })
    )
  })

  it("omits instructions when empty", async () => {
    await generateSpeechFile({
      textId: "p001_t001",
      text: "Hello",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "",
      format: "mp3",
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
    })

    expect(mockSynthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: undefined,
      })
    )
  })

  it("throws for unsafe language codes", async () => {
    await expect(
      generateSpeechFile({
        textId: "p001_t001",
        text: "Hello",
        language: "../evil",
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        instructions: "",
        format: "mp3",
        bookDir,
        cacheDir,
        ttsSynthesizer: mockSynthesizer,
      })
    ).rejects.toThrow(/Invalid language code/)
  })

  it("throws for unsafe text IDs", async () => {
    await expect(
      generateSpeechFile({
        textId: "../p001_t001",
        text: "Hello",
        language: "en",
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        instructions: "",
        format: "mp3",
        bookDir,
        cacheDir,
        ttsSynthesizer: mockSynthesizer,
      })
    ).rejects.toThrow(/Invalid text id/)
  })
})
