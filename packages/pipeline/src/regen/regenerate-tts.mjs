#!/usr/bin/env node
/**
 * regenerate-tts.mjs — standalone TTS regenerator for an exported ADT bundle.
 *
 * Ships inside every exported ADT folder (at `tools/regenerate-tts.mjs`). It
 * lets you regenerate read-aloud audio AFTER editing the book's text outside of
 * ADT Studio — e.g. a coding agent edits `content/i18n/<lang>/texts.json`, then
 * you run this to re-record only the lines that changed.
 *
 * It is intentionally DEPENDENCY-FREE: it imports nothing but Node built-ins, so
 * it runs in the exported folder with just Node 20+ installed — no `npm install`.
 *
 * How "only what changed" works: audio is content-addressed. Each unit's key is
 * a hash of (text + voice + model + instructions + provider). ADT Studio records
 * the baseline key for every unit's current audio in `regen/manifest.json`. On
 * run, this script recomputes each unit's key from the CURRENT text:
 *   - key matches the manifest baseline → unchanged → keep the published audio, no API call
 *   - key differs (text was edited)     → synthesize via the TTS API, overwrite the audio,
 *                                         and update the baseline in the manifest
 * So editing one line costs exactly one TTS call; everything else is free. The
 * published audio in the bundle is the source of truth for unchanged units — the
 * manifest ships keys, not a duplicate copy of the audio.
 *
 * IMPORTANT: the cache-key logic here MUST stay byte-identical to
 * `computeSpeechCacheKey` / `stripEmojis` in `packages/pipeline/src/speech.ts`,
 * or shipped cache blobs stop matching. A unit test guards this parity.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node tools/regenerate-tts.mjs [bundleRoot] [--dry-run] [--lang <code>]
 *
 * `bundleRoot` defaults to the folder that contains this `tools/` directory.
 */

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath, pathToFileURL } from "node:url"

// --------------------------------------------------------------------------
// Shared logic mirrored from packages/pipeline/src/speech.ts (keep in sync)
// --------------------------------------------------------------------------

// Must match EMOJI_RE in speech.ts exactly.
const EMOJI_RE =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}]/gu

function stripEmojis(text) {
  if (!text) return text
  return text.replace(EMOJI_RE, "")
}

const HTML_ENTITY_RE = /&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi
const NAMED_HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

// Must match normalizeRegenSpeechText in regen-emit.ts. Exported texts can
// contain rendered MathML, but TTS providers need the visible text, not tags.
function normalizeRegenSpeechText(text) {
  const withoutMarkup = stripEmojis(String(text || "")).replace(/<\/?[A-Za-z][^>]*>/g, " ")
  const decoded = withoutMarkup.replace(HTML_ENTITY_RE, (match, decimal, hex, named) => {
    if (decimal || hex) {
      const codePoint = Number.parseInt(decimal ?? hex, decimal ? 10 : 16)
      return codePoint <= 0x10FFFF ? String.fromCodePoint(codePoint) : match
    }
    return named ? (NAMED_HTML_ENTITIES[named.toLowerCase()] ?? match) : match
  })
  return decoded.replace(/\s+/g, " ").trim()
}

function isSpeakableText(text) {
  if (!text || !text.trim()) return false
  return /[\p{L}\p{N}]/u.test(text)
}

/**
 * Content-addressed cache key. Mirrors computeSpeechCacheKey in speech.ts:
 * the base object is {text, voice, model, instructions, provider} in that key
 * order; gemini sampling params are folded in ONLY for the gemini provider and
 * ONLY when set (undefined/null are omitted, matching the app).
 */
function computeSpeechCacheKey(data) {
  const base = {
    text: data.text,
    voice: data.voice,
    model: data.model,
    instructions: data.instructions,
    provider: data.provider,
  }
  const obj = { ...base }
  if (data.provider === "gemini") {
    if (data.geminiTemperature !== undefined && data.geminiTemperature !== null) {
      obj.geminiTemperature = data.geminiTemperature
    }
    if (data.geminiSeed !== undefined && data.geminiSeed !== null) {
      obj.geminiSeed = data.geminiSeed
    }
  }
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex")
}

function getBaseLanguage(languageCode) {
  return String(languageCode || "").split("-")[0].toLowerCase()
}

const SAFE_TEXT_ID_RE = /^[A-Za-z0-9._-]+$/
const SAFE_LANGUAGE_RE = /^[A-Za-z0-9_-]+$/
const SAFE_AUDIO_FILE_RE = /^[A-Za-z0-9._-]+$/
const SAFE_FORMAT_RE = /^[a-z0-9]+$/
const EASY_READ_SUFFIX_RE = /_easy_read$/

function assertSafeSegment(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`Unsafe ${label}: ${String(value)}`)
  }
  return value
}

function resolveWithin(baseDir, value, label) {
  const base = path.resolve(baseDir)
  const resolved = path.resolve(base, value)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`${label} escapes its base directory: ${value}`)
  }
  return resolved
}

// Category inference + TTS exclusion, mirrored from
// packages/types/src/text-catalog.ts (getTextCatalogCategory) and
// packages/types/src/speech.ts (isTtsExcluded). Keep in sync (a test guards it).
function getTextCatalogCategory(id) {
  if (EASY_READ_SUFFIX_RE.test(id)) return "easy-read"
  if (/_im\d{3}/.test(id)) return "captions"
  if (/_ans_/.test(id)) return "answers"
  if (/^gl(?:\d{3}|_manual_)/.test(id)) return "glossary"
  return "text"
}

/** exclude = { categories: string[], textIds: string[] }. An `{id}_easy_read`
 *  variant inherits its source entry's exclusion, matching ADT Studio. */
function isTtsExcluded(textId, exclude) {
  if (!exclude) return false
  const baseId = textId.replace(EASY_READ_SUFFIX_RE, "")
  const ids = exclude.textIds || []
  if (ids.some((id) => id === textId || id === baseId)) return true
  const cats = exclude.categories || []
  if (cats.length === 0) return false
  if (cats.includes(getTextCatalogCategory(textId))) return true
  return baseId !== textId && cats.includes(getTextCatalogCategory(baseId))
}

// --------------------------------------------------------------------------
// Providers
// --------------------------------------------------------------------------

/** OpenAI text-to-speech. Returns audio bytes as a Buffer. */
async function synthesizeOpenAI({ apiKey, model, voice, input, responseFormat, instructions }) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      input,
      response_format: responseFormat,
      instructions: instructions || undefined,
    }),
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(`OpenAI TTS request failed (${response.status}): ${message || response.statusText}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

// Gemini TTS (per-entry), ported from packages/llm/src/speech.ts
// (createGeminiTTSSynthesizer). Gemini returns base64 PCM (24 kHz mono 16-bit)
// which we wrap as a canonical WAV — the same bytes ADT Studio's default
// (non-page-batched) Gemini path produces.
const GEMINI_PCM_SAMPLE_RATE = 24_000
const GEMINI_PCM_CHANNELS = 1
const GEMINI_PCM_BITS_PER_SAMPLE = 16

function wrapPcmAsWave(pcmBytes) {
  const sampleRate = GEMINI_PCM_SAMPLE_RATE
  const channels = GEMINI_PCM_CHANNELS
  const bitsPerSample = GEMINI_PCM_BITS_PER_SAMPLE
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const dataSize = pcmBytes.byteLength
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write("data", 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, Buffer.from(pcmBytes)])
}

function buildGeminiSpeechPrompt(transcript, instructions) {
  const performance = instructions && instructions.trim()
  if (!performance) return transcript
  return `### PERFORMANCE\n${performance}\n\n#### TRANSCRIPT\n${transcript}`
}

function buildGeminiShortTextRetryInput(input) {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (Array.from(trimmed).length > 10) return null
  if (/[.!?؟۔。！？।]$/u.test(trimmed)) return null
  const suffix =
    /[؀-ࣿ]/u.test(trimmed) ? "۔"
      : /[ऀ-ॿ]/u.test(trimmed) ? "।"
        : /[぀-ヿ㐀-鿿]/u.test(trimmed) ? "。"
          : "."
  return `${trimmed}${suffix}`
}

function extractGeminiAudioData(payload) {
  let fallback = null
  for (const candidate of payload.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inlineData = part.inlineData
      if (!inlineData?.data) continue
      const mimeType = inlineData.mimeType?.toLowerCase()
      if (mimeType?.startsWith("audio/")) return inlineData.data
      if (!mimeType && !fallback) fallback = inlineData.data
    }
  }
  return fallback
}

async function synthesizeGemini({ apiKey, model, voice, input, responseFormat, instructions, temperature, seed }) {
  const outputFormat = String(responseFormat).toLowerCase()
  if (outputFormat !== "wav" && outputFormat !== "pcm") {
    throw new Error(`Gemini TTS only supports wav output. Received: ${responseFormat}`)
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const call = async (transcript) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildGeminiSpeechPrompt(transcript, instructions) }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          ...(temperature !== undefined && temperature !== null ? { temperature } : {}),
          ...(seed !== undefined && seed !== null ? { seed } : {}),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    })
    const text = await response.text()
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { error: text || response.statusText }
    }
    if (!response.ok) {
      const message = typeof payload.error === "string" ? payload.error : payload.error?.message ?? response.statusText
      throw new Error(`Gemini TTS request failed (${response.status}): ${message || response.statusText}`)
    }
    return payload
  }

  let payload = await call(input)
  let audioData = extractGeminiAudioData(payload)
  if (!audioData) {
    const retry = buildGeminiShortTextRetryInput(input)
    if (retry) {
      payload = await call(retry)
      audioData = extractGeminiAudioData(payload)
    }
  }
  if (!audioData) throw new Error("Gemini TTS response did not include audio data")
  const pcm = new Uint8Array(Buffer.from(audioData, "base64"))
  return outputFormat === "pcm" ? Buffer.from(pcm) : wrapPcmAsWave(pcm)
}

function makeSynthesizer(provider, providerCfg, apiKey, geminiOpts) {
  if (provider === "openai") {
    return (opts) => synthesizeOpenAI({ ...opts, apiKey })
  }
  if (provider === "gemini") {
    return (opts) => synthesizeGemini({ ...opts, apiKey, temperature: geminiOpts?.temperature, seed: geminiOpts?.seed })
  }
  // Azure is recognized but not yet wired into the standalone regenerator.
  throw new Error(
    `Provider "${provider}" is not yet supported by the standalone regenerator (openai, gemini). ` +
      `Regenerate this language from within ADT Studio, or switch the provider in tools/tts.config.json.`,
  )
}

/** OpenAI Whisper word-level timestamps. Mirrors transcribeWithWhisper. */
async function transcribeWithWhisper(audioBuffer, fileName, apiKey, language, prompt) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "mp3"
  const mimeType = ext === "wav" ? "audio/wav" : ext === "ogg" ? "audio/ogg" : "audio/mpeg"

  const post = (withLanguage) => {
    const form = new FormData()
    form.append("file", new Blob([audioBuffer], { type: mimeType }), fileName)
    form.append("model", "whisper-1")
    form.append("response_format", "verbose_json")
    form.append("timestamp_granularities[]", "word")
    if (withLanguage && language) form.append("language", language)
    if (prompt) form.append("prompt", prompt)
    return fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
  }

  let response = await post(Boolean(language))
  if (!response.ok && response.status === 400 && language) {
    // A 400 with a language hint set is usually the ISO code being rejected
    // (e.g. "sq"); retry once without it so auto-detection takes over.
    const firstError = await response.text()
    response = await post(false)
    if (!response.ok) {
      const message = await response.text()
      throw new Error(`Whisper failed (${response.status}): ${message || firstError || response.statusText}`)
    }
  } else if (!response.ok) {
    const message = await response.text()
    throw new Error(`Whisper failed (${response.status}): ${message || response.statusText}`)
  }

  const data = await response.json()
  return (data.words ?? []).map((w) => ({ text: w.word, start: w.start, end: w.end }))
}

// --------------------------------------------------------------------------
// Bundle helpers
// --------------------------------------------------------------------------

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback
  return JSON.parse(fs.readFileSync(filePath, "utf-8"))
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n")
}

function fmtOf(fileName) {
  return (path.extname(fileName).slice(1) || "mp3").toLowerCase()
}

function normalizeSpeechSettings(value, fallbackFormat = "mp3") {
  return {
    provider: String(value?.provider || "openai"),
    model: String(value?.model || ""),
    voice: String(value?.voice || ""),
    instructions: String(value?.instructions || ""),
    format: String(value?.format || fallbackFormat).toLowerCase(),
  }
}

function sameSpeechSettings(a, b) {
  return (
    a.provider === b.provider &&
    a.model === b.model &&
    a.voice === b.voice &&
    a.instructions === b.instructions &&
    a.format === b.format
  )
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      [
        "Regenerate read-aloud audio for edited text in this ADT bundle.",
        "",
        "Usage:",
        "  OPENAI_API_KEY=sk-... node tools/regenerate-tts.mjs [bundleRoot] [--dry-run] [--lang <code>]",
        "",
        "  bundleRoot   Folder containing content/, tools/, regen/ (default: parent of tools/).",
        "  --dry-run    Report what would change without calling the TTS API.",
        "  --lang <c>   Only process one language (e.g. --lang es-uy).",
        "  --id <textId>  Only process a single text unit (e.g. --id pg001_n0001).",
        "  --force      Re-record even if the text is unchanged (respects --lang/--id).",
      ].join("\n"),
    )
    return
  }

  const dryRun = args.includes("--dry-run")
  const force = args.includes("--force")
  const valueFlags = new Set(["--lang", "--id"])
  const flagValue = (name) => {
    const i = args.indexOf(name)
    if (i === -1) return null
    const value = args[i + 1]
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value.`)
    }
    return value
  }
  const onlyLang = flagValue("--lang")
  const onlyId = flagValue("--id")

  const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && valueFlags.has(args[i - 1])))
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const bundleRoot = positional[0] ? path.resolve(positional[0]) : path.resolve(scriptDir, "..")

  const contentRoot = path.join(bundleRoot, "content", "i18n")
  const manifestPath = path.join(bundleRoot, "regen", "manifest.json")
  const config = readJson(path.join(bundleRoot, "tools", "tts.config.json"), null)
  const manifest = readJson(manifestPath, { languages: {} })
  let manifestDirty = false

  if (!config || !config.languages) {
    throw new Error(
      `No tools/tts.config.json found under ${bundleRoot}. This bundle was not exported with TTS regeneration support.`,
    )
  }

  // Read-aloud exclusions (book-level). Editing these adds/removes audio:
  // excluding a category mutes it (dropped from audios.json), re-including it
  // generates audio for its units.
  const exclude = {
    categories: (config.exclude && config.exclude.categories) || [],
    textIds: (config.exclude && config.exclude.textIds) || [],
  }

  const languages = Object.keys(config.languages).filter((l) => !onlyLang || l === onlyLang)
  if (languages.length === 0) {
    console.log(onlyLang ? `Language "${onlyLang}" not found in tts.config.json.` : "No languages configured.")
    return
  }

  console.log(dryRun ? "DRY RUN — no audio will be generated.\n" : "")
  const summary = []

  for (const lang of languages) {
    const safeLang = assertSafeSegment(lang, SAFE_LANGUAGE_RE, "language code")
    const langCfg = config.languages[lang] || {}
    if (!manifest.languages) manifest.languages = {}
    if (!manifest.languages[lang]) manifest.languages[lang] = {}
    const manifestLang = manifest.languages[lang]
    // textId → baseline cache key (of the text that produced the current audio).
    // Updated in place as lines are re-recorded, then persisted at the end so
    // re-runs are idempotent.
    const baselineEntries = manifestLang.entries || (manifestLang.entries = {})
    const storedEntrySettings = manifestLang.entrySettings || (manifestLang.entrySettings = {})
    const storedConfigBaselines = manifestLang.entryConfigBaselines || (manifestLang.entryConfigBaselines = {})
    const configSettings = normalizeSpeechSettings(langCfg)
    const exportedDefaults = normalizeSpeechSettings(manifestLang.defaults || langCfg)
    const manualTextIds = new Set(manifestLang.manualTextIds || [])
    const manualTexts = manifestLang.manualTexts || {}
    const manualFiles = manifestLang.manualFiles || {}

    const localeDir = resolveWithin(contentRoot, safeLang, "language directory")
    const texts = readJson(path.join(localeDir, "texts.json"), {})
    const audios = readJson(path.join(localeDir, "audios.json"), {})
    const audioDir = resolveWithin(localeDir, "audio", "audio directory")

    const result = { lang, unchanged: 0, regenerated: 0, manualSkipped: 0, excludedRemoved: 0, realigned: 0, warnings: [], errors: [] }
    const changedIds = []
    let audiosDirty = false

    const timecodeFile = path.join(localeDir, "timecode", "timecode_output.json")
    const timecodes = readJson(timecodeFile, {})
    let timecodesDirty = false

    // API keys and clients are only resolved once there is real work. A language
    // may contain per-entry provider fallbacks, so cache one client per provider.
    const synthesizers = new Map()
    const ensureSynth = (settings) => {
      if (synthesizers.has(settings.provider)) return synthesizers.get(settings.provider)
      const provider = settings.provider
      const providerCfg = (config.providers && config.providers[provider]) || {}
      const apiKeyEnv = providerCfg.apiKeyEnv || (provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY")
      const apiKey = process.env[apiKeyEnv]
      if (!apiKey) throw new Error(`Environment variable ${apiKeyEnv} is not set (needed for ${provider} TTS).`)
      const synthesize = makeSynthesizer(provider, providerCfg, apiKey, {
        temperature: manifestLang.geminiTemperature,
        seed: manifestLang.geminiSeed,
      })
      synthesizers.set(provider, synthesize)
      return synthesize
    }

    // Candidate universe: every text unit (texts.json is a superset of the
    // spoken units) plus any id that already has audio. This lets exclusions
    // be edited in the folder — excluding drops audio, re-including generates it.
    const allIds = new Set([...Object.keys(texts), ...Object.keys(audios)])
    for (const textId of allIds) {
      if (onlyId && textId !== onlyId) continue
      try {
        const raw = texts[textId]
        const sanitized = normalizeRegenSpeechText(raw)
        const speakable = isSpeakableText(sanitized)
        const excluded = isTtsExcluded(textId, exclude)
        let hasAudio = audios[textId] !== undefined
        const isManual = manualTextIds.has(textId)

        // Not a spoken unit (excluded, or nothing speakable): drop its mapping so
        // it stops playing. Files stay on disk, including manual recordings.
        if (excluded || !speakable) {
          if (hasAudio) {
            result.excludedRemoved++
            if (dryRun) continue
            delete audios[textId]
            audiosDirty = true
            if (timecodes[textId] !== undefined) {
              delete timecodes[textId]
              timecodesDirty = true
            }
            if (!isManual && baselineEntries[textId] !== undefined) {
              delete baselineEntries[textId]
              delete storedEntrySettings[textId]
              delete storedConfigBaselines[textId]
              manifestDirty = true
            }
          }
          continue
        }

        // Manual: never regenerated. Restore a previously excluded mapping from
        // the manifest, and warn if the displayed text was edited.
        if (isManual) {
          result.manualSkipped++
          if (!hasAudio) {
            const manualFile = assertSafeSegment(
              manualFiles[textId],
              SAFE_AUDIO_FILE_RE,
              `manual audio filename for ${textId}`,
            )
            const manualPath = resolveWithin(audioDir, manualFile, "manual audio file")
            if (fs.existsSync(manualPath)) {
              if (!dryRun) {
                audios[textId] = manualFile
                audiosDirty = true
                hasAudio = true
              }
            } else {
              result.warnings.push(`${textId}: manual recording file is missing (${manualFile}).`)
            }
          }
          if (manualTexts[textId] !== undefined && manualTexts[textId] !== raw) {
            result.warnings.push(
              `${textId}: manually recorded audio, but its text changed — audio left as-is (re-record in ADT Studio if needed).`,
            )
          }
          continue
        }

        if (!SAFE_TEXT_ID_RE.test(textId)) {
          result.warnings.push(`${textId}: unsafe id, skipped.`)
          continue
        }

        const existingFileName = hasAudio
          ? assertSafeSegment(audios[textId], SAFE_AUDIO_FILE_RE, `audio filename for ${textId}`)
          : null
        const existingFormat = existingFileName ? fmtOf(existingFileName) : configSettings.format
        const entryConfigBaseline = normalizeSpeechSettings(
          storedConfigBaselines[textId] || exportedDefaults,
          existingFormat,
        )
        const configOverridesEntry = !sameSpeechSettings(configSettings, entryConfigBaseline)
        const settings = configOverridesEntry
          ? configSettings
          : normalizeSpeechSettings(storedEntrySettings[textId] || configSettings, existingFormat)
        const fmt = assertSafeSegment(settings.format, SAFE_FORMAT_RE, `audio format for ${textId}`)
        const fileName = existingFileName && fmtOf(existingFileName) === fmt
          ? existingFileName
          : `${textId}.${fmt}`
        assertSafeSegment(fileName, SAFE_AUDIO_FILE_RE, `audio filename for ${textId}`)
        const publishedPath = resolveWithin(audioDir, fileName, "published audio file")
        const currentKey = computeSpeechCacheKey({
          text: sanitized,
          voice: settings.voice,
          model: settings.model,
          instructions: settings.instructions,
          provider: settings.provider,
          geminiTemperature: manifestLang.geminiTemperature,
          geminiSeed: manifestLang.geminiSeed,
        })

        // Unchanged: text (+ config) still matches the audio already present.
        // --force re-records anyway.
        if (
          !force &&
          baselineEntries[textId] === currentKey &&
          audios[textId] === fileName &&
          fs.existsSync(publishedPath)
        ) {
          result.unchanged++
          continue
        }

        if (dryRun) {
          changedIds.push(textId)
          continue
        }
        const buffer = await ensureSynth(settings)({
          model: settings.model,
          voice: settings.voice,
          input: sanitized,
          responseFormat: fmt,
          instructions: settings.instructions,
        })
        fs.mkdirSync(audioDir, { recursive: true })
        fs.writeFileSync(publishedPath, buffer)
        if (audios[textId] !== fileName) {
          audios[textId] = fileName
          audiosDirty = true
        }
        if (langCfg.wordHighlighting && timecodes[textId] !== undefined) {
          // Do not leave precise timings for the old audio behind. If Whisper is
          // unavailable/fails below, the missing entry makes the next run retry.
          delete timecodes[textId]
          timecodesDirty = true
        }
        baselineEntries[textId] = currentKey
        storedEntrySettings[textId] = settings
        storedConfigBaselines[textId] = configSettings
        manifestDirty = true
        changedIds.push(textId)
        result.regenerated++
      } catch (err) {
        result.errors.push(`${textId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Page-batched Gemini books synthesize a whole page in one request for tone
    // consistency; this tool re-records lines individually, so a re-recorded
    // line's tone may drift from its unedited page neighbours.
    if (langCfg.batchByPage && result.regenerated > 0) {
      result.warnings.push(
        "This language used page-batched (whole-page) Gemini synthesis for tone consistency. " +
          "Re-recorded lines were synthesized individually, so their tone may differ from unedited " +
          "lines on the same page — regenerate the page/book in ADT Studio for exact parity.",
      )
    }

    // Word highlighting: re-align changed audio AND backfill any unit that has
    // audio but no timings yet — so turning highlighting on fills the whole book.
    if (langCfg.wordHighlighting) {
      const whisperTargets = new Set(changedIds)
      for (const id of Object.keys(audios)) {
        if (onlyId && id !== onlyId) continue
        if (!timecodes[id]) whisperTargets.add(id) // missing timings → backfill
      }
      if (whisperTargets.size > 0) {
        if (dryRun) {
          result.realigned = whisperTargets.size
        } else {
          const whisperEnv = (config.whisper && config.whisper.apiKeyEnv) || "OPENAI_API_KEY"
          const whisperKey = process.env[whisperEnv]
          if (!whisperKey) {
            result.warnings.push(
              `Word highlighting is on but ${whisperEnv} is not set — timings were not updated for ${whisperTargets.size} line(s).`,
            )
          } else {
            for (const id of whisperTargets) {
              try {
                const fileName = audios[id]
                if (!fileName) continue
                assertSafeSegment(fileName, SAFE_AUDIO_FILE_RE, `audio filename for ${id}`)
                const audioBuf = fs.readFileSync(resolveWithin(audioDir, fileName, "audio file"))
                const words = await transcribeWithWhisper(
                  audioBuf,
                  fileName,
                  whisperKey,
                  getBaseLanguage(lang),
                  normalizeRegenSpeechText(texts[id]),
                )
                if (words.length > 0) {
                  timecodes[id] = { timecodes: [null, { word_timestamps: words }] }
                } else {
                  delete timecodes[id]
                }
                timecodesDirty = true
                result.realigned++
              } catch (err) {
                result.warnings.push(`${id}: word-timestamp update failed: ${err instanceof Error ? err.message : String(err)}`)
              }
            }
          }
        }
      }
    }

    if (!dryRun) {
      if (audiosDirty) writeJson(path.join(localeDir, "audios.json"), audios)
      if (timecodesDirty) {
        fs.mkdirSync(path.dirname(timecodeFile), { recursive: true })
        writeJson(timecodeFile, timecodes)
      }
    }

    summary.push(result)
    console.log(formatLang(result, dryRun, changedIds.length))
  }

  // Persist updated baselines so a re-run with no further edits is a no-op.
  if (manifestDirty && !dryRun) {
    writeJson(manifestPath, manifest)
  }

  const totalErrors = summary.reduce((n, r) => n + r.errors.length, 0)
  if (totalErrors > 0) {
    console.error(`\nCompleted with ${totalErrors} error(s). See per-language output above.`)
    process.exitCode = 1
  } else {
    console.log("\nDone.")
  }
}

function formatLang(result, dryRun, changed) {
  const lines = []
  const verb = dryRun ? "would regenerate" : "regenerated"
  const parts = [
    `${dryRun ? changed : result.regenerated} ${verb}`,
    `${result.unchanged} unchanged`,
    `${result.manualSkipped} manual`,
  ]
  if (result.excludedRemoved) parts.push(`${result.excludedRemoved} excluded${dryRun ? " (would remove)" : ""}`)
  if (result.realigned) parts.push(`${result.realigned} ${dryRun ? "would realign" : "realigned"}`)
  lines.push(`[${result.lang}] ${parts.join(", ")}`)
  for (const w of result.warnings) lines.push(`  ⚠ ${w}`)
  for (const e of result.errors) lines.push(`  ✗ ${e}`)
  return lines.join("\n")
}

// Run only when invoked directly (`node regenerate-tts.mjs`), not when imported
// by a test that exercises the helpers below.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}

export {
  computeSpeechCacheKey,
  stripEmojis,
  normalizeRegenSpeechText,
  isSpeakableText,
  getTextCatalogCategory,
  isTtsExcluded,
  main,
}
