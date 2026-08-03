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

function makeSynthesizer(provider, providerCfg, apiKey) {
  if (provider === "openai") {
    return (opts) => synthesizeOpenAI({ ...opts, apiKey })
  }
  // Gemini and Azure are recognized but not yet wired into the standalone
  // regenerator. The full pipeline in ADT Studio supports them; parity here is
  // planned. Until then, fail loudly rather than silently producing wrong audio.
  throw new Error(
    `Provider "${provider}" is not yet supported by the standalone regenerator (only "openai"). ` +
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
      ].join("\n"),
    )
    return
  }

  const dryRun = args.includes("--dry-run")
  let onlyLang = null
  const langIdx = args.indexOf("--lang")
  if (langIdx !== -1) onlyLang = args[langIdx + 1]

  const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--lang"))
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

  const languages = Object.keys(config.languages).filter((l) => !onlyLang || l === onlyLang)
  if (languages.length === 0) {
    console.log(onlyLang ? `Language "${onlyLang}" not found in tts.config.json.` : "No languages configured.")
    return
  }

  console.log(dryRun ? "DRY RUN — no audio will be generated.\n" : "")
  const summary = []

  for (const lang of languages) {
    const langCfg = config.languages[lang]
    if (!manifest.languages) manifest.languages = {}
    if (!manifest.languages[lang]) manifest.languages[lang] = {}
    const manifestLang = manifest.languages[lang]
    // textId → baseline cache key (of the text that produced the current audio).
    // Updated in place as lines are re-recorded, then persisted at the end so
    // re-runs are idempotent.
    const baselineEntries = manifestLang.entries || (manifestLang.entries = {})
    const provider = langCfg.provider || "openai"
    const providerCfg = (config.providers && config.providers[provider]) || {}
    const manualTextIds = new Set(manifestLang.manualTextIds || [])
    const manualTexts = manifestLang.manualTexts || {}

    const localeDir = path.join(contentRoot, lang)
    const texts = readJson(path.join(localeDir, "texts.json"), {})
    const audios = readJson(path.join(localeDir, "audios.json"), {})
    const audioDir = path.join(localeDir, "audio")

    const result = { lang, unchanged: 0, regenerated: 0, manualSkipped: 0, warnings: [], errors: [] }
    const changedIds = []

    // API key is only required once we know there is real work to do.
    let synthesize = null
    const ensureSynth = () => {
      if (synthesize) return synthesize
      const apiKeyEnv = providerCfg.apiKeyEnv || "OPENAI_API_KEY"
      const apiKey = process.env[apiKeyEnv]
      if (!apiKey) throw new Error(`Environment variable ${apiKeyEnv} is not set (needed for ${provider} TTS).`)
      synthesize = makeSynthesizer(provider, providerCfg, apiKey)
      return synthesize
    }

    for (const [textId, fileName] of Object.entries(audios)) {
      try {
        const raw = texts[textId]
        const sanitized = stripEmojis(raw || "").trim()
        if (!isSpeakableText(sanitized)) continue

        if (manualTextIds.has(textId)) {
          result.manualSkipped++
          if (manualTexts[textId] !== undefined && manualTexts[textId] !== raw) {
            result.warnings.push(
              `${textId}: manually recorded audio, but its text changed — audio left as-is (re-record in ADT Studio if needed).`,
            )
          }
          continue
        }

        const fmt = fmtOf(fileName)
        const currentKey = computeSpeechCacheKey({
          text: sanitized,
          voice: langCfg.voice,
          model: langCfg.model,
          instructions: langCfg.instructions || "",
          provider,
          geminiTemperature: manifestLang.geminiTemperature,
          geminiSeed: manifestLang.geminiSeed,
        })
        const publishedPath = path.join(audioDir, fileName)

        // Unchanged: the current text (and config) still matches the audio
        // already in the bundle. The published file IS the audio — skip it.
        if (baselineEntries[textId] === currentKey && fs.existsSync(publishedPath)) {
          result.unchanged++
          continue
        }

        // Changed (or the audio file is missing): re-record this line.
        if (dryRun) {
          changedIds.push(textId)
          continue
        }
        const buffer = await ensureSynth()({
          model: langCfg.model,
          voice: langCfg.voice,
          input: sanitized,
          responseFormat: fmt,
          instructions: langCfg.instructions || "",
        })
        fs.mkdirSync(audioDir, { recursive: true })
        fs.writeFileSync(publishedPath, buffer)
        baselineEntries[textId] = currentKey
        manifestDirty = true
        changedIds.push(textId)
        result.regenerated++
      } catch (err) {
        result.errors.push(`${textId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Word-highlighting: re-align only the audio that actually changed.
    if (langCfg.wordHighlighting && changedIds.length > 0) {
      const timecodeFile = path.join(localeDir, "timecode", "timecode_output.json")
      const timecodes = readJson(timecodeFile, {})
      const whisperEnv = (config.whisper && config.whisper.apiKeyEnv) || "OPENAI_API_KEY"
      if (dryRun) {
        summary.push({ ...result, wouldRealign: changedIds.length })
        console.log(formatLang(result, dryRun, changedIds.length))
        continue
      }
      const whisperKey = process.env[whisperEnv]
      if (!whisperKey) {
        result.warnings.push(
          `Word highlighting is on but ${whisperEnv} is not set — timings for regenerated audio were NOT updated (highlighting will drift).`,
        )
      } else {
        for (const textId of changedIds) {
          try {
            const fileName = audios[textId]
            const audioBuf = fs.readFileSync(path.join(audioDir, fileName))
            const words = await transcribeWithWhisper(
              audioBuf,
              fileName,
              whisperKey,
              getBaseLanguage(lang),
              stripEmojis(texts[textId] || "").trim(),
            )
            if (words.length > 0) {
              timecodes[textId] = { timecodes: [null, { word_timestamps: words }] }
            } else {
              delete timecodes[textId]
            }
          } catch (err) {
            result.warnings.push(`${textId}: word-timestamp update failed: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
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
  lines.push(
    `[${result.lang}] ${dryRun ? changed : result.regenerated} ${verb}, ` +
      `${result.unchanged} unchanged, ${result.manualSkipped} manual (skipped)`,
  )
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

export { computeSpeechCacheKey, stripEmojis, isSpeakableText, main }
