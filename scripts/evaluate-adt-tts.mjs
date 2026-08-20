#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) throw new Error("Expected --name value arguments")
    args[argv[index].slice(2)] = argv[index + 1]
  }
  return args
}

function normalize(text) {
  return String(text ?? "").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}'’]+/gu, " ").trim()
}

function distance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row++) {
    const current = [row]
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1,
        previous[column - 1] + Number(left[row - 1] !== right[column - 1]))
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]
}

export function errorRates(reference, hypothesis) {
  const referenceText = normalize(reference); const hypothesisText = normalize(hypothesis)
  const referenceWords = referenceText ? referenceText.split(/\s+/) : []
  const hypothesisWords = hypothesisText ? hypothesisText.split(/\s+/) : []
  const referenceCharacters = [...referenceText.replaceAll(" ", "")]
  const hypothesisCharacters = [...hypothesisText.replaceAll(" ", "")]
  return {
    wer: referenceWords.length ? distance(referenceWords, hypothesisWords) / referenceWords.length : null,
    cer: referenceCharacters.length ? distance(referenceCharacters, hypothesisCharacters) / referenceCharacters.length : null,
  }
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, " ").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replace(/\s+/g, " ").trim()
}

function expectedTextMap(exportDirectory, language) {
  const values = new Map()
  for (const file of fs.readdirSync(exportDirectory).filter((name) => name.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(exportDirectory, file), "utf8")
    for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bdata-id=["']([^"']+)["'][^>]*)>/gi)) {
      const [opening, tag, attributes, id] = match
      if (tag.toLowerCase() === "img") {
        const alt = attributes.match(/\balt=["']([^"']*)["']/i)?.[1]; if (alt) values.set(id, stripHtml(alt))
        continue
      }
      const closeIndex = html.toLowerCase().indexOf(`</${tag.toLowerCase()}>`, (match.index ?? 0) + opening.length)
      if (closeIndex >= 0) {
        const text = stripHtml(html.slice((match.index ?? 0) + opening.length, closeIndex)); if (text) values.set(id, text)
      }
    }
    for (const match of html.matchAll(/\bdata-explanation=["']([^"']*)["'][^>]*\bdata-explanation-id=["']([^"']+)["']/gi)) {
      values.set(match[2], stripHtml(match[1]))
    }
  }
  const glossaryFile = path.join(exportDirectory, "content", "i18n", language, "glossary.json")
  if (fs.existsSync(glossaryFile)) for (const value of Object.values(JSON.parse(fs.readFileSync(glossaryFile, "utf8")))) {
    values.set(value.id, value.word); values.set(`${value.id}_term`, value.word); values.set(`${value.id}_def`, value.definition)
  }
  return values
}

function audioStats(file) {
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=sample_rate,channels", "-of", "json", file], { encoding: "utf8" }))
  let maxVolumeDb = null; let silenceSeconds = 0
  const measured = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect,silencedetect=noise=-45dB:d=0.2", "-f", "null", "-"], { encoding: "utf8" })
  if (measured.status !== 0) throw new Error(`ffmpeg could not analyze ${file}`)
  const diagnostics = measured.stderr
  const maximum = diagnostics.match(/max_volume:\s*(-?[\d.]+) dB/); if (maximum) maxVolumeDb = Number(maximum[1])
  for (const match of diagnostics.matchAll(/silence_duration:\s*([\d.]+)/g)) silenceSeconds += Number(match[1])
  const durationSeconds = Number(probe.format?.duration ?? 0)
  return {
    durationSeconds,
    sampleRate: Number(probe.streams?.[0]?.sample_rate ?? 0),
    channels: Number(probe.streams?.[0]?.channels ?? 0),
    maxVolumeDb,
    clippingRisk: maxVolumeDb != null && maxVolumeDb >= -0.1,
    silenceRatio: durationSeconds ? Math.min(1, silenceSeconds / durationSeconds) : null,
  }
}

async function transcribe(file, options) {
  const { apiKey, endpoint, model, language } = options
  for (let attempt = 1; attempt <= 3; attempt++) {
    const form = new FormData()
    form.set("model", model); form.set("language", language.split("-")[0]); form.set("response_format", "json")
    form.set("file", new Blob([fs.readFileSync(file)]), path.basename(file))
    const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(180_000) })
    const body = await response.json().catch(async () => ({ error: await response.text() }))
    if (response.ok) return body.text ?? ""
    if (attempt === 3 || ![408, 409, 429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`Transcription failed (${response.status}): ${body.error?.message ?? JSON.stringify(body)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
  }
  return ""
}

async function mapConcurrent(values, concurrency, worker) {
  const results = Array(values.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++
      results[index] = await worker(values[index], index)
    }
  }))
  return results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.export || !args.out) throw new Error("Required: --export and --out")
  const exportDirectory = path.resolve(args.export); const language = args.language ?? "en"
  const audioDirectory = path.join(exportDirectory, "content", "i18n", language, "audio")
  if (!fs.existsSync(audioDirectory)) throw new Error(`Audio directory not found: ${audioDirectory}`)
  const expected = expectedTextMap(exportDirectory, language)
  const audioFiles = fs.readdirSync(audioDirectory).filter((name) => /\.(?:wav|mp3)$/i.test(name)).sort()
  const apiKey = args["api-key-env"] ? process.env[args["api-key-env"]] : null
  let rows = []
  for (const name of audioFiles) {
    const file = path.join(audioDirectory, name); const id = path.parse(name).name; const reference = expected.get(id) ?? null
    const row = { id, file: path.relative(exportDirectory, file), reference, ...audioStats(file) }
    rows.push(row)
  }
  if (apiKey) {
    const concurrency = Math.max(1, Number(args.concurrency ?? 4))
    rows = await mapConcurrent(rows, concurrency, async (row) => {
      if (!row.reference) return row
      const file = path.join(exportDirectory, row.file)
      row.transcript = await transcribe(file, {
        apiKey,
        endpoint: args.endpoint ?? "https://api.openai.com/v1/audio/transcriptions",
        model: args.model ?? "gpt-transcribe",
        language,
      })
      Object.assign(row, errorRates(row.reference, row.transcript))
      return row
    })
  }
  const measured = rows.filter((row) => row.wer != null)
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    exportDirectory: path.relative(process.cwd(), exportDirectory) || ".",
    language,
    transcriptionModel: apiKey ? args.model ?? "gpt-transcribe" : null,
    summary: {
      audioFiles: rows.length,
      expectedTextCoverage: rows.filter((row) => row.reference).length / Math.max(1, rows.length),
      asrMeasuredFiles: measured.length,
      macroWer: measured.length ? measured.reduce((sum, row) => sum + row.wer, 0) / measured.length : null,
      macroCer: measured.length ? measured.reduce((sum, row) => sum + row.cer, 0) / measured.length : null,
      clippingRiskFiles: rows.filter((row) => row.clippingRisk).length,
      excessiveSilenceFiles: rows.filter((row) => row.silenceRatio > 0.5).length,
      totalAudioSeconds: rows.reduce((sum, row) => sum + row.durationSeconds, 0),
    },
    methodology: {
      intelligibility: "ASR round-trip WER plus CER; CER should be prioritized for multilingual comparisons.",
      signalIntegrity: "Decode, duration, clipping-risk, and silence checks. These do not replace native-speaker MOS.",
      requiredHumanEvaluation: "Native-speaker naturalness, intelligibility, pronunciation, appropriateness, and paired preference with at least two raters.",
    },
    files: rows,
  }
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true })
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.message); process.exitCode = 1 })
