import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import url from "node:url"
import { DEFAULT_ELEVENLABS_TTS_MODEL_ID, ELEVENLABS_SHIPPED_VOICE_NAMES, type SpeechFileEntry } from "@adt/types"
import {
  stripEmojis,
  isSpeakableText,
  resolveVoice,
  resolveVoiceForSlot,
  resolveInstructions,
  resolveSpeechModel,
  resolveSpeechVoice,
  resolveSpeechFormat,
  resolveGeminiTtsRateLimit,
  getDocumentedGeminiTtsRpm,
  generateSpeechFile,
  loadVoicesConfig,
  loadSpeechInstructions,
  findAdjacentSpeechText,
  elevenLabsVoiceSettingsFromConfig,
  buildElevenLabsTtsLogParams,
  buildTtsLogEntry,
  buildWordTimestampsLogEntry,
  classifyElevenLabsTtsError,
  elevenLabsTtsRetryDelayMs,
  parseElevenLabsErrorStatus,
  resolveNarratorLabel,
  overlayPrimaryVoices,
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

  it("falls back to the ElevenLabs default voice ID when no mapping exists", () => {
    expect(resolveVoice("elevenlabs", "en", {})).toBe("21m00Tcm4TlvDq8ikWAM")
  })

  it("does not reuse the OpenAI alloy fallback for ElevenLabs voices", () => {
    expect(resolveVoice("elevenlabs", "en", {}, "alloy")).toBe("21m00Tcm4TlvDq8ikWAM")
  })
})

// ---------------------------------------------------------------------------
// resolveVoiceForSlot
// ---------------------------------------------------------------------------

describe("resolveVoiceForSlot", () => {
  const voiceMaps: VoiceMaps = {
    openai: {
      default: "alloy",
      en: { primary: { voice: "alloy", label: "Alloy" }, secondary: { voice: "shimmer", label: "Shimmer" } },
      es: "coral",
    },
  }

  it("resolves the primary slot from a legacy scalar entry", () => {
    expect(resolveVoiceForSlot("openai", "es", voiceMaps, "primary")).toEqual({ voice: "coral" })
  })

  describe("resolveSpeechVoice", () => {
    const voices: VoiceMaps = {
      openai: { "es-uy": "coral" },
    }

    it("uses global routing and voices for the primary narrator", () => {
      expect(
        resolveSpeechVoice(
          "es-UY",
          "primary",
          {
            default_provider: "openai",
            providers: { openai: { model: "primary-model" } },
          },
          voices,
        ),
      ).toEqual({
        provider: "openai",
        model: "primary-model",
        voice: "coral",
        label: undefined,
      })
    })

    it("uses the per-book provider, model, and voice for the secondary narrator", () => {
      expect(
        resolveSpeechVoice(
          "es-UY",
          "secondary",
          {
            secondary_voices: {
              "es-UY": {
                provider: "gemini",
                model: "gemini-custom-tts",
                voice: "Puck",
              },
            },
          },
          voices,
        ),
      ).toEqual({
        provider: "gemini",
        model: "gemini-custom-tts",
        voice: "Puck",
        label: undefined,
      })
    })

    it("does not apply a secondary narrator to a different regional locale", () => {
      expect(
        resolveSpeechVoice(
          "es-AR",
          "secondary",
          {
            secondary_voices: {
              "es-UY": { provider: "gemini", voice: "Puck" },
            },
          },
          voices,
        ),
      ).toBeNull()
    })

    it("names an unlabeled secondary ElevenLabs voice from the shipped list", () => {
      expect(
        resolveSpeechVoice(
          "es-UY",
          "secondary",
          {
            secondary_voices: {
              "es-UY": { provider: "elevenlabs", voice: "QK4xDwo9ESPHA4JNUpX3" },
            },
          },
          voices,
        ),
      ).toEqual({
        provider: "elevenlabs",
        model: DEFAULT_ELEVENLABS_TTS_MODEL_ID,
        voice: "QK4xDwo9ESPHA4JNUpX3",
        label: "Tomás",
      })
    })

    it("prefers an explicit secondary label over the shipped name", () => {
      expect(
        resolveSpeechVoice(
          "es-UY",
          "secondary",
          {
            secondary_voices: {
              "es-UY": {
                provider: "elevenlabs",
                voice: "QK4xDwo9ESPHA4JNUpX3",
                label: "Narrador dos",
              },
            },
          },
          voices,
        )?.label,
      ).toBe("Narrador dos")
    })
  })

  it("resolves the primary slot from a canonical slot-object entry", () => {
    expect(resolveVoiceForSlot("openai", "en", voiceMaps, "primary")).toEqual({
      voice: "alloy",
      label: "Alloy",
    })
  })

  it("resolves the secondary slot when configured", () => {
    expect(resolveVoiceForSlot("openai", "en", voiceMaps, "secondary")).toEqual({
      voice: "shimmer",
      label: "Shimmer",
    })
  })

  it("returns null for the secondary slot when a legacy scalar entry has no secondary", () => {
    expect(resolveVoiceForSlot("openai", "es", voiceMaps, "secondary")).toBeNull()
  })

  it("returns null for the secondary slot when nothing is configured at all", () => {
    expect(resolveVoiceForSlot("openai", "fr", voiceMaps, "secondary")).toBeNull()
  })

  it("still falls back to the hardcoded provider default for the primary slot", () => {
    expect(resolveVoiceForSlot("gemini", "en", {}, "primary")).toEqual({ voice: "Kore" })
    expect(resolveVoiceForSlot("elevenlabs", "en", {}, "primary")).toEqual({
      voice: "21m00Tcm4TlvDq8ikWAM",
      label: "Rachel",
    })
  })

  it("adds the shipped display name to a legacy ElevenLabs scalar mapping", () => {
    expect(
      resolveVoiceForSlot(
        "elevenlabs",
        "es-UY",
        { elevenlabs: { "es-uy": "QK4xDwo9ESPHA4JNUpX3" } },
        "primary",
      ),
    ).toEqual({
      voice: "QK4xDwo9ESPHA4JNUpX3",
      label: "Tomás",
    })
  })
})

// ---------------------------------------------------------------------------
// resolveNarratorLabel
// ---------------------------------------------------------------------------

describe("resolveNarratorLabel", () => {
  const entry = (over: Partial<SpeechFileEntry> = {}): SpeechFileEntry => ({
    textId: "pg001_t001",
    language: "en",
    fileName: "pg001_t001.mp3",
    voice: "echo",
    model: "gpt-4o-mini-tts",
    cached: false,
    ...over,
  })

  it("prefers an explicitly configured label", () => {
    expect(resolveNarratorLabel([entry({ voiceLabel: "Mateo" })], "Primary")).toBe("Mateo")
  })

  it("falls back to the shipped ElevenLabs name for an unlabelled voice", () => {
    expect(
      resolveNarratorLabel(
        [entry({ provider: "elevenlabs", voice: "QK4xDwo9ESPHA4JNUpX3" })],
        "Primary",
      ),
    ).toBe("Tomás")
  })

  it("falls back to the raw voice for a provider with no name mapping", () => {
    expect(resolveNarratorLabel([entry({ provider: "openai" })], "Primary")).toBe("echo")
  })

  it("tolerates an entry with no provider", () => {
    expect(resolveNarratorLabel([entry()], "Primary")).toBe("echo")
  })

  // A single hand-recorded line must not rename the whole narrator: manual
  // entries carry voice "uploaded", which is not a voice name.
  it("skips manual uploads while a generated entry is available", () => {
    expect(
      resolveNarratorLabel(
        [
          entry({ provider: "manual", voice: "uploaded", model: "uploaded" }),
          entry({ provider: "openai", voice: "shimmer" }),
        ],
        "Primary",
      ),
    ).toBe("shimmer")
  })

  it("uses a manual entry only when it is all there is", () => {
    expect(
      resolveNarratorLabel(
        [entry({ provider: "manual", voice: "uploaded", model: "uploaded" })],
        "Primary",
      ),
    ).toBe("uploaded")
  })

  it("returns the fallback for a slot that produced nothing", () => {
    expect(resolveNarratorLabel([], "Primary")).toBe("Primary")
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
    expect(resolveSpeechModel("elevenlabs", {})).toBe("eleven_multilingual_v2")
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

  it("loads a canonical primary/secondary slot mapping alongside legacy scalars", () => {
    fs.writeFileSync(
      path.join(tmpDir, "voices.yaml"),
      [
        "openai:",
        "  default: alloy",
        "  en:",
        "    primary:",
        "      voice: alloy",
        "      label: Alloy",
        "    secondary:",
        "      voice: shimmer",
        "      label: Shimmer",
        "",
      ].join("\n")
    )
    const result = loadVoicesConfig(tmpDir)
    expect(result).toEqual({
      openai: {
        default: "alloy",
        en: {
          primary: { voice: "alloy", label: "Alloy" },
          secondary: { voice: "shimmer", label: "Shimmer" },
        },
      },
    })
  })

  it("preserves valid mappings and warns for invalid entries", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    fs.writeFileSync(
      path.join(tmpDir, "voices.yaml"),
      "openai:\n  es: coral\n  en:\n    primary: 5\n",
    )
    expect(loadVoicesConfig(tmpDir)).toEqual({ openai: { es: "coral" } })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
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
      voiceSlot: "primary",
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

  it("suffixes the filename and stamps voiceSlot/voiceLabel for the secondary slot", async () => {
    const result = await generateSpeechFile({
      textId: "p001_t001",
      text: "Hello world",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "shimmer",
      instructions: "Speak cheerfully.",
      format: "mp3",
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
      voiceSlot: "secondary",
      voiceLabel: "Shimmer",
    })

    expect(result).toEqual({
      textId: "p001_t001",
      language: "en",
      fileName: "p001_t001--secondary.mp3",
      voice: "shimmer",
      model: "gpt-4o-mini-tts",
      cached: false,
      voiceSlot: "secondary",
      voiceLabel: "Shimmer",
    })

    const audioPath = path.join(bookDir, "audio", "en", "p001_t001--secondary.mp3")
    expect(fs.existsSync(audioPath)).toBe(true)
    // Primary file for the same textId must not exist / be untouched.
    const primaryAudioPath = path.join(bookDir, "audio", "en", "p001_t001.mp3")
    expect(fs.existsSync(primaryAudioPath)).toBe(false)
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

  it("invalidates the cache when elevenlabs context/normalization options change", async () => {
    const baseOptions = {
      textId: "p001_t001",
      text: "Hello world",
      language: "en",
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      instructions: "",
      format: "mp3" as const,
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
      provider: "elevenlabs" as const,
    }

    await generateSpeechFile(baseOptions)
    expect(mockSynthesize).toHaveBeenCalledTimes(1)

    // Same inputs, still cached.
    const cachedResult = await generateSpeechFile(baseOptions)
    expect(cachedResult!.cached).toBe(true)
    expect(mockSynthesize).toHaveBeenCalledTimes(1)

    // Adding previous/next context text changes the cache key.
    await generateSpeechFile({
      ...baseOptions,
      elevenLabsPreviousText: "Previous sentence.",
      elevenLabsNextText: "Next sentence.",
    })
    expect(mockSynthesize).toHaveBeenCalledTimes(2)

    // Adding text normalization changes the cache key too.
    await generateSpeechFile({
      ...baseOptions,
      elevenLabsApplyTextNormalization: "on",
    })
    expect(mockSynthesize).toHaveBeenCalledTimes(3)
  })

  it("ignores elevenlabs context/normalization options for non-elevenlabs providers", async () => {
    const baseOptions = {
      textId: "p001_t001",
      text: "Hello world",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "",
      format: "mp3" as const,
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
    }

    await generateSpeechFile(baseOptions)
    expect(mockSynthesize).toHaveBeenCalledTimes(1)

    // These fields are ElevenLabs-only — they must not affect the cache key
    // (and thus not trigger regeneration) for other providers.
    const result = await generateSpeechFile({
      ...baseOptions,
      elevenLabsPreviousText: "Previous sentence.",
      elevenLabsNextText: "Next sentence.",
      elevenLabsApplyTextNormalization: "on",
    })
    expect(result!.cached).toBe(true)
    expect(mockSynthesize).toHaveBeenCalledTimes(1)
  })

  it("invalidates the cache when elevenlabs voice_settings change", async () => {
    const baseOptions = {
      textId: "p001_t001",
      text: "Hello world",
      language: "en",
      model: "eleven_multilingual_v2",
      voice: "21m00Tcm4TlvDq8ikWAM",
      instructions: "",
      format: "mp3" as const,
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
      provider: "elevenlabs" as const,
    }

    await generateSpeechFile(baseOptions)
    expect(mockSynthesize).toHaveBeenCalledTimes(1)

    // Explicitly passing the defaults must hash identically to passing nothing
    // — the request body is the same either way.
    const stillCached = await generateSpeechFile({
      ...baseOptions,
      elevenLabsStability: 0.7,
      elevenLabsSimilarityBoost: 0.5,
      elevenLabsStyle: 0,
      elevenLabsUseSpeakerBoost: true,
    })
    expect(stillCached!.cached).toBe(true)
    expect(mockSynthesize).toHaveBeenCalledTimes(1)

    // Tuning stability changes the audio, so it must regenerate.
    await generateSpeechFile({ ...baseOptions, elevenLabsStability: 0.2 })
    expect(mockSynthesize).toHaveBeenCalledTimes(2)

    // So does style, and setting a speed where there was none.
    await generateSpeechFile({ ...baseOptions, elevenLabsStyle: 0.5 })
    expect(mockSynthesize).toHaveBeenCalledTimes(3)
    await generateSpeechFile({ ...baseOptions, elevenLabsSpeed: 0.9 })
    expect(mockSynthesize).toHaveBeenCalledTimes(4)
  })

  it("ignores elevenlabs voice_settings for non-elevenlabs providers", async () => {
    const baseOptions = {
      textId: "p001_t001",
      text: "Hello world",
      language: "en",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      instructions: "",
      format: "mp3" as const,
      bookDir,
      cacheDir,
      ttsSynthesizer: mockSynthesizer,
    }

    await generateSpeechFile(baseOptions)
    expect(mockSynthesize).toHaveBeenCalledTimes(1)

    const result = await generateSpeechFile({
      ...baseOptions,
      elevenLabsStability: 0.1,
      elevenLabsStyle: 0.9,
      elevenLabsSpeed: 1.2,
    })
    expect(result!.cached).toBe(true)
    expect(mockSynthesize).toHaveBeenCalledTimes(1)
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

// ---------------------------------------------------------------------------
// findAdjacentSpeechText
// ---------------------------------------------------------------------------

describe("findAdjacentSpeechText", () => {
  const entry = (id: string, text: string) => ({ id, text }) as never

  it("returns the neighbouring entry's text in both directions", () => {
    const entries = [
      entry("p001_t001", "First."),
      entry("p001_t002", "Second."),
      entry("p001_t003", "Third."),
    ]

    expect(findAdjacentSpeechText(entries, 1, -1, undefined)).toBe("First.")
    expect(findAdjacentSpeechText(entries, 1, 1, undefined)).toBe("Third.")
  })

  it("returns undefined at the array boundaries", () => {
    const entries = [entry("p001_t001", "Only.")]

    expect(findAdjacentSpeechText(entries, 0, -1, undefined)).toBeUndefined()
    expect(findAdjacentSpeechText(entries, 0, 1, undefined)).toBeUndefined()
  })

  it("skips TTS-excluded neighbours so context flows across them", () => {
    const entries = [
      entry("p001_t001", "First."),
      entry("p001_t002", "Muted."),
      entry("p001_t003", "Third."),
    ]

    expect(
      findAdjacentSpeechText(entries, 2, -1, { excluded_text_ids: ["p001_t002"] })
    ).toBe("First.")
  })

  // The entry's own `text` is emoji-stripped before synthesis, so the context
  // fields must be too — otherwise ElevenLabs sees characters it never speaks.
  it("strips emojis from the returned context text", () => {
    const entries = [entry("p001_t001", "Hello 😀 there."), entry("p001_t002", "Next.")]

    expect(findAdjacentSpeechText(entries, 1, -1, undefined)).toBe("Hello  there.")
  })

  it("skips neighbours that are empty once emoji-stripped", () => {
    const entries = [
      entry("p001_t001", "Real text."),
      entry("p001_t002", "😀"),
      entry("p001_t003", "Third."),
    ]

    expect(findAdjacentSpeechText(entries, 2, -1, undefined)).toBe("Real text.")
  })

  // `generateSpeechFile` skips entries that fail isSpeakableText, so a
  // punctuation-only neighbour has no audio and no intonation to borrow — it
  // would only end up in the cache key.
  it("skips punctuation-only neighbours, matching what synthesis skips", () => {
    const entries = [
      entry("p001_t001", "Real text."),
      entry("p001_t002", "…"),
      entry("p001_t003", "—"),
      entry("p001_t004", "Fourth."),
    ]

    expect(findAdjacentSpeechText(entries, 3, -1, undefined)).toBe("Real text.")
  })

  it("still accepts a neighbour whose only speakable content is a number", () => {
    const entries = [entry("p001_t001", "1998."), entry("p001_t002", "Next.")]

    expect(findAdjacentSpeechText(entries, 1, -1, undefined)).toBe("1998.")
  })

  // The stage-runner appends Easy Read variants to the source-language array,
  // so an unconstrained scan makes the last main entry's next_text an Easy Read
  // rewrite of much earlier content.
  it("does not cross the easy-read variant boundary", () => {
    const entries = [
      entry("p001_t001", "Main one."),
      entry("p001_t002", "Main two."),
      entry("p001_t001_easy_read", "Easy one."),
      entry("p001_t002_easy_read", "Easy two."),
    ]

    // Last main entry: no main-catalog entry follows it.
    expect(findAdjacentSpeechText(entries, 1, 1, undefined)).toBeUndefined()
    // First easy-read entry: no easy-read entry precedes it.
    expect(findAdjacentSpeechText(entries, 2, -1, undefined)).toBeUndefined()
    // Within a variant group, neighbours still resolve.
    expect(findAdjacentSpeechText(entries, 2, 1, undefined)).toBe("Easy two.")
    expect(findAdjacentSpeechText(entries, 1, -1, undefined)).toBe("Main one.")
  })
})

// ---------------------------------------------------------------------------
// elevenLabsVoiceSettingsFromConfig
// ---------------------------------------------------------------------------

describe("elevenLabsVoiceSettingsFromConfig", () => {
  it("maps the snake_case config fields onto camelCase option names", () => {
    expect(
      elevenLabsVoiceSettingsFromConfig({
        elevenlabs_stability: 0.4,
        elevenlabs_similarity_boost: 0.6,
        elevenlabs_style: 0.1,
        elevenlabs_use_speaker_boost: false,
        elevenlabs_speed: 1.1,
      })
    ).toEqual({
      elevenLabsStability: 0.4,
      elevenLabsSimilarityBoost: 0.6,
      elevenLabsStyle: 0.1,
      elevenLabsUseSpeakerBoost: false,
      elevenLabsSpeed: 1.1,
    })
  })

  it("leaves every field undefined for missing config so the defaults apply", () => {
    for (const speech of [undefined, null, {}]) {
      expect(elevenLabsVoiceSettingsFromConfig(speech)).toEqual({
        elevenLabsStability: undefined,
        elevenLabsSimilarityBoost: undefined,
        elevenLabsStyle: undefined,
        elevenLabsUseSpeakerBoost: undefined,
        elevenLabsSpeed: undefined,
      })
    }
  })
})

// ---------------------------------------------------------------------------
// Shipped ElevenLabs voices have display names
// ---------------------------------------------------------------------------

describe("config/voices.yaml ElevenLabs entries", () => {
  // ElevenLabs voice IDs are opaque, and the UI can only resolve them to names
  // via the account's voice list — which is empty when no API key is configured
  // and may exclude premade library voices. So every ID we *ship* needs an entry
  // in ELEVENLABS_SHIPPED_VOICE_NAMES, or the Speech settings fall back to
  // showing a raw `21m00Tcm4TlvDq8ikWAM`. This catches a new voices.yaml entry
  // that forgets one.
  //
  // Uses the production loader against the real file rather than a fixture, so
  // it tracks whatever we actually ship.
  it("all have display names", () => {
    const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../../../..")
    const configDir = path.join(repoRoot, "config")
    expect(fs.existsSync(path.join(configDir, "voices.yaml"))).toBe(true)

    const shippedIds = Object.values(loadVoicesConfig(configDir).elevenlabs ?? {})
    expect(shippedIds.length).toBeGreaterThan(0)

    const unnamed = shippedIds.filter((id) => !ELEVENLABS_SHIPPED_VOICE_NAMES[id])
    expect(unnamed, "add these to ELEVENLABS_SHIPPED_VOICE_NAMES in @adt/types").toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildElevenLabsTtsLogParams
// ---------------------------------------------------------------------------

describe("buildElevenLabsTtsLogParams", () => {
  const base = {
    model: "eleven_multilingual_v2",
    voice: "21m00Tcm4TlvDq8ikWAM",
    language: "es-UY",
    format: "mp3",
  }

  // The whole point of the field: a book that configures nothing must still show
  // the settings that were actually sent, not a blank.
  it("reports the effective voice settings when the book configures none", () => {
    expect(buildElevenLabsTtsLogParams(base)).toEqual({
      voice: "21m00Tcm4TlvDq8ikWAM",
      model: "eleven_multilingual_v2",
      language: "es-UY",
      outputFormat: "mp3_44100_128",
      stability: 0.7,
      similarityBoost: 0.5,
      style: 0,
      useSpeakerBoost: true,
      contextBefore: false,
      contextAfter: false,
    })
  })

  it("reports overrides when the book sets them", () => {
    const params = buildElevenLabsTtsLogParams({
      ...base,
      elevenLabsStability: 0.2,
      elevenLabsStyle: 0.6,
      elevenLabsSpeed: 0.9,
      elevenLabsUseSpeakerBoost: false,
    })
    expect(params).toMatchObject({
      stability: 0.2,
      style: 0.6,
      speed: 0.9,
      useSpeakerBoost: false,
    })
  })

  // Mirrors the request body: an unset speed leaves ElevenLabs' own pacing
  // alone, so reporting a value would misrepresent the call.
  it("omits speed when unset", () => {
    expect(buildElevenLabsTtsLogParams(base)).not.toHaveProperty("speed")
  })

  it("omits normalization when unset and reports it when set", () => {
    expect(buildElevenLabsTtsLogParams(base)).not.toHaveProperty("applyTextNormalization")
    expect(
      buildElevenLabsTtsLogParams({ ...base, applyTextNormalization: "on" })
    ).toMatchObject({ applyTextNormalization: "on" })
  })

  // The log row must stay compact and must not duplicate the neighbouring
  // sentences, which are already large in the message body.
  it("reports context as presence plus length, never the text itself", () => {
    const params = buildElevenLabsTtsLogParams({
      ...base,
      previousText: "Previous sentence.",
      nextText: "Next one.",
    })
    expect(params).toMatchObject({
      contextBefore: true,
      contextAfter: true,
      contextBeforeChars: 18,
      contextAfterChars: 9,
    })
    expect(JSON.stringify(params)).not.toContain("Previous sentence")
    expect(JSON.stringify(params)).not.toContain("Next one")
  })

  it("omits the char counts when there is no context", () => {
    const params = buildElevenLabsTtsLogParams(base)
    expect(params).not.toHaveProperty("contextBeforeChars")
    expect(params).not.toHaveProperty("contextAfterChars")
  })

  // The generic `speech.format` is just "mp3"; ElevenLabs only accepts fixed
  // (sample rate, bitrate) combos, so a configured rate gets snapped. This log
  // line is the only place that snapping is visible, so reporting the generic
  // format would tell the user nothing they didn't already configure.
  it("reports the snapped ElevenLabs wire format, not the generic one", () => {
    expect(buildElevenLabsTtsLogParams(base)).toMatchObject({
      outputFormat: "mp3_44100_128",
    })
    expect(
      buildElevenLabsTtsLogParams({ ...base, sampleRate: 22050, bitRate: "64" })
    ).toMatchObject({ outputFormat: "mp3_22050_32" })
    expect(
      buildElevenLabsTtsLogParams({ ...base, format: "wav", sampleRate: 16000 })
    ).toMatchObject({ outputFormat: "pcm_16000" })
  })

  // The failure path logs the request that just failed, and an unsupported
  // format is one reason it may have failed — building the log must not throw
  // inside the error handler and lose the entry.
  it("falls back to the generic format instead of throwing on an unsupported one", () => {
    expect(buildElevenLabsTtsLogParams({ ...base, format: "ogg" })).toMatchObject({
      outputFormat: "ogg",
    })
  })

  // The debug panel renders keys in insertion order, so identity/format come
  // before the tuning values rather than being alphabetised apart.
  it("keeps a stable, readable key order", () => {
    expect(Object.keys(buildElevenLabsTtsLogParams(base)).slice(0, 4)).toEqual([
      "voice",
      "model",
      "language",
      "outputFormat",
    ])
  })
})

// ---------------------------------------------------------------------------
// buildTtsLogEntry
// ---------------------------------------------------------------------------

describe("buildTtsLogEntry", () => {
  it("keeps the complete request text and records provider failures separately", () => {
    const text = "A very long narrated entry. ".repeat(30)
    const entry = buildTtsLogEntry({
      textId: "pg001_t001",
      language: "en",
      voice: "en-US-JennyNeural",
      model: "azure-tts",
      provider: "azure",
      text,
      durationMs: 250,
      success: false,
      cached: false,
      attempt: 0,
      error: "Azure TTS request failed (400): Bad Request",
    })

    expect(entry).toMatchObject({
      taskType: "tts",
      pageId: "pg001_t001",
      promptName: "tts-azure",
      modelId: "azure/azure-tts",
      success: false,
      errorCount: 1,
      attempt: 1,
      error: "Azure TTS request failed (400): Bad Request",
    })
    expect(entry.messages[0]?.content[0]).toEqual({
      type: "text",
      text: `[en] voice=en-US-JennyNeural\n${text}`,
    })
  })

  it("marks an entry that produced no audio so it isn't read as a synthesis", () => {
    const entry = buildTtsLogEntry({
      textId: "pg001_t002",
      language: "en",
      voice: "en-US-JennyNeural",
      model: "azure-tts",
      provider: "azure",
      text: "—",
      durationMs: 0,
      success: true,
      cached: false,
      attempt: 1,
      skippedReason: "no-speakable-text",
    })

    // Still a success (nothing went wrong) but distinguishable from an entry
    // that actually reached the provider.
    expect(entry).toMatchObject({
      success: true,
      errorCount: 0,
      cacheHit: false,
      skippedReason: "no-speakable-text",
    })
  })

  it("omits skippedReason for an entry that really was synthesized", () => {
    const entry = buildTtsLogEntry({
      textId: "pg001_t001",
      language: "en",
      voice: "en-US-JennyNeural",
      model: "azure-tts",
      provider: "azure",
      text: "Hello world",
      durationMs: 250,
      success: true,
      cached: false,
      attempt: 1,
    })

    expect(entry).not.toHaveProperty("skippedReason")
  })
})

// ---------------------------------------------------------------------------
// buildWordTimestampsLogEntry
// ---------------------------------------------------------------------------

describe("buildWordTimestampsLogEntry", () => {
  it("records a successful transcription under the word-timestamps step", () => {
    const entry = buildWordTimestampsLogEntry({
      fileName: "pg001_t001.mp3",
      language: "en",
      prompt: "Hello world",
      durationMs: 420,
      success: true,
      cached: false,
      result: {
        text: "Hello world",
        words: [
          { word: "Hello", start: 0, end: 0.4 },
          { word: "world", start: 0.4, end: 0.9 },
        ],
        duration: 0.9,
      },
    })

    // taskType is the real step name, so the Log tab's step filter and the
    // step badge work with no extra wiring.
    expect(entry).toMatchObject({
      taskType: "word-timestamps",
      pageId: "pg001_t001.mp3",
      promptName: "whisper-transcribe",
      modelId: "openai/whisper-1",
      cacheHit: false,
      success: true,
      errorCount: 0,
    })
    expect(entry.params).toEqual({
      language: "en",
      fileName: "pg001_t001.mp3",
      hasPrompt: true,
      words: 2,
      durationSec: 0.9,
    })
  })

  it("marks a cache hit and a provider failure distinctly", () => {
    const cached = buildWordTimestampsLogEntry({
      fileName: "pg001_t001.mp3",
      durationMs: 1,
      success: true,
      cached: true,
    })
    expect(cached.cacheHit).toBe(true)
    // No result and no prompt — the row still says so rather than omitting it.
    expect(cached.params).toEqual({ language: "", fileName: "pg001_t001.mp3", hasPrompt: false })

    const failed = buildWordTimestampsLogEntry({
      fileName: "pg001_t001.mp3",
      durationMs: 30,
      success: false,
      cached: false,
      error: "Whisper request failed (401): invalid api key",
    })
    expect(failed).toMatchObject({
      success: false,
      errorCount: 1,
      error: "Whisper request failed (401): invalid api key",
    })
  })
})

// ---------------------------------------------------------------------------
// ElevenLabs retry classification
// ---------------------------------------------------------------------------

describe("classifyElevenLabsTtsError", () => {
  const failure = (status: number, body: string) =>
    `ElevenLabs TTS request failed (${status}): ${body}`

  it("treats 429 as a rate limit", () => {
    expect(classifyElevenLabsTtsError(failure(429, "too many concurrent requests"))).toBe(
      "rate-limit"
    )
  })

  it("treats 5xx as transient", () => {
    expect(classifyElevenLabsTtsError(failure(500, "internal error"))).toBe("transient")
    expect(classifyElevenLabsTtsError(failure(503, "unavailable"))).toBe("transient")
  })

  it("treats other 4xx as permanent", () => {
    expect(classifyElevenLabsTtsError(failure(401, "invalid_api_key"))).toBe("permanent")
    expect(classifyElevenLabsTtsError(failure(404, "voice_not_found"))).toBe("permanent")
  })

  // The previous classifier matched /try again/i against the response body, so
  // a permanent 4xx whose body happened to say "try again" burned five backoff
  // waits (~60s) on a request that could never succeed.
  it("does not retry a permanent 4xx whose body says 'try again'", () => {
    expect(
      classifyElevenLabsTtsError(failure(400, "Invalid voice_id — fix it and try again"))
    ).toBe("permanent")
    expect(classifyElevenLabsTtsError(failure(422, "unprocessable; please try again"))).toBe(
      "permanent"
    )
  })

  it("retries genuine transport errors that never reached the API", () => {
    expect(classifyElevenLabsTtsError("fetch failed")).toBe("transient")
    expect(classifyElevenLabsTtsError("read ECONNRESET")).toBe("transient")
    expect(classifyElevenLabsTtsError("socket hang up")).toBe("transient")
  })

  it("treats an unrecognised statusless error as permanent", () => {
    expect(classifyElevenLabsTtsError("ELEVENLABS_API_KEY is required")).toBe("permanent")
  })
})

describe("parseElevenLabsErrorStatus", () => {
  it("extracts the status the synthesizer formats into the message", () => {
    expect(parseElevenLabsErrorStatus("ElevenLabs TTS request failed (429): x")).toBe(429)
  })

  it("returns null when there is no status", () => {
    expect(parseElevenLabsErrorStatus("fetch failed")).toBeNull()
  })
})

describe("elevenLabsTtsRetryDelayMs", () => {
  it("backs off exponentially and caps at the maximum", () => {
    expect(elevenLabsTtsRetryDelayMs(1)).toBe(2_000)
    expect(elevenLabsTtsRetryDelayMs(2)).toBe(4_000)
    expect(elevenLabsTtsRetryDelayMs(3)).toBe(8_000)
    expect(elevenLabsTtsRetryDelayMs(10)).toBe(30_000)
  })
})

// ---------------------------------------------------------------------------
// Per-book primary voice overrides
// ---------------------------------------------------------------------------

describe("primary voice overrides", () => {
  const voiceMaps: VoiceMaps = {
    azure: {
      default: "en-US-JennyNeural",
      es: "es-MX-DaliaNeural",
      "es-uy": "es-UY-ValentinaNeural",
    },
    openai: { default: "alloy" },
  }

  const resolve = (
    language: string,
    primary_voices: Record<string, Record<string, { voice: string; label?: string }>>,
    speech: Record<string, unknown> = {},
  ) =>
    resolveSpeechVoice(
      language,
      "primary",
      { default_provider: "azure", primary_voices, ...speech },
      voiceMaps,
    )

  it("prefers a book override over the global mapping", () => {
    expect(
      resolve("es-UY", { azure: { "es-uy": { voice: "es-UY-MateoNeural" } } })?.voice,
    ).toBe("es-UY-MateoNeural")
  })

  it("falls back to the global mapping when the book overrides nothing", () => {
    expect(resolve("es-UY", {})?.voice).toBe("es-UY-ValentinaNeural")
  })

  // The override goes through the same exact -> base -> default chain as the
  // global map, so an `es` override reaches an es-UY book.
  it("applies a base-language override to a regional locale", () => {
    expect(
      resolve("es-UY", { azure: { es: { voice: "es-ES-ElviraNeural" } } })?.voice,
    ).toBe("es-UY-ValentinaNeural")
    expect(
      resolve("es-AR", { azure: { es: { voice: "es-ES-ElviraNeural" } } })?.voice,
    ).toBe("es-ES-ElviraNeural")
  })

  it("accepts an override written with an uppercase region", () => {
    expect(
      resolve("es-UY", { azure: { "es-UY": { voice: "es-UY-MateoNeural" } } })?.voice,
    ).toBe("es-UY-MateoNeural")
  })

  // Keyed by provider, so rerouting a language cannot hand another provider's
  // voice name to the new one.
  it("ignores an override belonging to a different provider", () => {
    const resolved = resolveSpeechVoice(
      "es-UY",
      "primary",
      {
        default_provider: "openai",
        primary_voices: { azure: { "es-uy": { voice: "es-UY-MateoNeural" } } },
      },
      voiceMaps,
    )
    expect(resolved?.provider).toBe("openai")
    expect(resolved?.voice).toBe("alloy")
  })

  it("carries the override's label through", () => {
    expect(
      resolve("es-UY", { azure: { "es-uy": { voice: "es-UY-MateoNeural", label: "Mateo" } } })
        ?.label,
    ).toBe("Mateo")
  })

  it("ignores a blank override rather than silencing the voice", () => {
    expect(resolve("es-UY", { azure: { "es-uy": { voice: "  " } } })?.voice).toBe(
      "es-UY-ValentinaNeural",
    )
  })

  it("returns the global map untouched when there are no overrides", () => {
    expect(overlayPrimaryVoices(voiceMaps, undefined)).toBe(voiceMaps)
    expect(overlayPrimaryVoices(voiceMaps, {})).toBe(voiceMaps)
  })

  it("does not mutate the global map", () => {
    overlayPrimaryVoices(voiceMaps, { azure: { "es-uy": { voice: "es-UY-MateoNeural" } } })
    expect(voiceMaps.azure["es-uy"]).toBe("es-UY-ValentinaNeural")
  })

  // Only the primary slot is overridden. A legacy entry of the extended
  // {primary, secondary} shape must not lose its secondary just because the
  // book renamed the primary narrator.
  it("keeps a legacy secondary slot when the primary is overridden", () => {
    const withSecondary: VoiceMaps = {
      azure: {
        "es-uy": {
          primary: { voice: "es-UY-ValentinaNeural" },
          secondary: { voice: "es-UY-MateoNeural", label: "Mateo" },
        },
      },
    }

    const merged = overlayPrimaryVoices(withSecondary, {
      azure: { "es-uy": { voice: "es-UY-ElviraNeural" } },
    })

    expect(merged.azure["es-uy"]).toEqual({
      primary: { voice: "es-UY-ElviraNeural" },
      secondary: { voice: "es-UY-MateoNeural", label: "Mateo" },
    })
    expect(
      resolveVoiceForSlot("azure", "es-UY", merged, "secondary")?.voice,
    ).toBe("es-UY-MateoNeural")
  })

  it("overrides a legacy scalar entry without inventing a secondary", () => {
    const merged = overlayPrimaryVoices(voiceMaps, {
      azure: { "es-uy": { voice: "es-UY-MateoNeural" } },
    })

    expect(merged.azure["es-uy"]).toEqual({ primary: { voice: "es-UY-MateoNeural" } })
    expect(resolveVoiceForSlot("azure", "es-UY", merged, "secondary")).toBeNull()
  })
})
