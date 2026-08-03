#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "(nothing)"}`)
    }
    args[key.slice(2)] = value
  }
  return args
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim()
}

function sqliteJson(database, sql) {
  const output = run("sqlite3", ["-json", database, sql])
  return output ? JSON.parse(output) : []
}

function nodeData(database, node) {
  const rows = sqliteJson(database, `
    SELECT data FROM node_data
    WHERE node = '${node.replaceAll("'", "''")}'
    ORDER BY version DESC LIMIT 1
  `)
  return rows[0]?.data ? JSON.parse(rows[0].data) : null
}

function directoryBytes(directory) {
  return Number(run("du", ["-sk", directory]).split(/\s+/)[0]) * 1024
}

function mediaFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory)
    .filter((file) => /\.(?:mp3|wav)$/i.test(file))
    .map((file) => path.join(directory, file))
}

function analyzeAudio(files) {
  let durationSeconds = 0
  let decodeErrors = 0
  const encodings = {}
  for (const file of files) {
    const probe = JSON.parse(run("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_name,sample_rate,channels",
      "-of", "json",
      file,
    ]))
    const duration = Number(probe.format?.duration)
    if (Number.isFinite(duration)) durationSeconds += duration
    const stream = probe.streams?.[0] ?? {}
    const encoding = `${stream.codec_name ?? "unknown"}/${stream.sample_rate ?? "unknown"}Hz/${stream.channels ?? "unknown"}ch`
    encodings[encoding] = (encodings[encoding] ?? 0) + 1
    try {
      execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], {
        stdio: "pipe",
        maxBuffer: 4 * 1024 * 1024,
      })
    } catch {
      decodeErrors += 1
    }
  }
  return { durationSeconds, decodeErrors, encodings }
}

function stageDurations(transitions) {
  const durations = {}
  for (let index = 0; index < transitions.length - 1; index += 1) {
    const current = transitions[index]
    const elapsed = Date.parse(transitions[index + 1].at) - Date.parse(current.at)
    for (const [stage, status] of Object.entries(current.stages ?? {})) {
      if (status === "running") durations[stage] = (durations[stage] ?? 0) + elapsed
    }
  }
  return durations
}

function analyzeRun(runFile, booksRoot) {
  const runResult = JSON.parse(fs.readFileSync(runFile, "utf8"))
  const bookDirectory = path.join(booksRoot, runResult.label)
  const database = path.join(bookDirectory, `${runResult.label}.db`)
  const exportDirectory = path.join(bookDirectory, "adt")
  const audioDirectory = path.join(exportDirectory, "content", "i18n", "en", "audio")
  if (!fs.existsSync(database)) throw new Error(`Database not found: ${database}`)

  const logRows = sqliteJson(database, `
    SELECT
      step,
      COUNT(*) AS calls,
      SUM(json_extract(data, '$.durationMs')) AS durationMs,
      SUM(json_extract(data, '$.usage.inputTokens')) AS inputTokens,
      SUM(json_extract(data, '$.usage.outputTokens')) AS outputTokens,
      SUM(CASE WHEN json_extract(data, '$.cacheHit') THEN 1 ELSE 0 END) AS cacheHits,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS errors
    FROM llm_log GROUP BY step ORDER BY MIN(id)
  `)
  const totals = logRows.reduce((result, row) => ({
    calls: result.calls + row.calls,
    durationMs: result.durationMs + (row.durationMs ?? 0),
    inputTokens: result.inputTokens + (row.inputTokens ?? 0),
    outputTokens: result.outputTokens + (row.outputTokens ?? 0),
    cacheHits: result.cacheHits + (row.cacheHits ?? 0),
    errors: result.errors + (row.errors ?? 0),
  }), { calls: 0, durationMs: 0, inputTokens: 0, outputTokens: 0, cacheHits: 0, errors: 0 })
  const audio = mediaFiles(audioDirectory)
  const quizzes = nodeData(database, "quiz-generation")?.quizzes ?? []
  const glossary = nodeData(database, "glossary")?.items ?? []
  const toc = nodeData(database, "toc-generation")?.entries ?? []
  const catalog = nodeData(database, "text-catalog")?.entries ?? []
  const captions = sqliteJson(database, `
    SELECT item_id AS pageId, data FROM node_data
    WHERE node = 'image-captioning'
    ORDER BY item_id, version DESC
  `).map((row) => ({ pageId: row.pageId, ...JSON.parse(row.data) }))
  const accessibility = nodeData(database, "accessibility-assessment")
  const accessibilityTotals = (accessibility?.pages ?? []).reduce((result, page) => ({
    violations: result.violations + (page.violationCount ?? 0),
    incomplete: result.incomplete + (page.incompleteCount ?? 0),
  }), { violations: 0, incomplete: 0 })
  const audioMetrics = analyzeAudio(audio)
  const llmCostUsd = runResult.mode === "openai"
    ? totals.inputTokens * 2.5 / 1_000_000 + totals.outputTokens * 15 / 1_000_000
    : 0
  const ttsEstimatedCostUsd = runResult.mode === "openai" ? audioMetrics.durationSeconds / 60 * 0.015 : 0

  return {
    label: runResult.label,
    mode: runResult.mode,
    model: runResult.model,
    speechProvider: runResult.speechProvider,
    runDurationMs: runResult.runDurationMs,
    stageDurationsMs: stageDurations(runResult.transitions),
    logs: { totals, byStep: logRows },
    output: {
      pages: 20,
      quizzes: quizzes.length,
      glossaryTerms: glossary.length,
      tocEntries: toc.length,
      textEntries: catalog.length,
      captionedImages: captions.reduce((count, page) => count + (page.captions?.length ?? 0), 0),
      audioFiles: audio.length,
      audioDurationSeconds: Number(audioMetrics.durationSeconds.toFixed(3)),
      audioDecodeErrors: audioMetrics.decodeErrors,
      audioEncodings: audioMetrics.encodings,
      exportBytes: directoryBytes(exportDirectory),
      accessibility: {
        tool: accessibility?.tool ?? null,
        disabledRules: accessibility?.disabledRules ?? [],
        ...accessibilityTotals,
      },
    },
    cost: {
      llmUsd: Number(llmCostUsd.toFixed(6)),
      ttsEstimatedUsd: Number(ttsEstimatedCostUsd.toFixed(6)),
      totalEstimatedUsd: Number((llmCostUsd + ttsEstimatedCostUsd).toFixed(6)),
      assumptions: runResult.mode === "openai" ? {
        llm: "GPT-5.4 standard: $2.50/M input and $15/M output; no cached token discount was observed.",
        tts: "Estimated from generated duration at $0.015/min; the speech endpoint does not expose per-request audio token usage in this run.",
      } : {
        api: "$0 marginal API cost; hardware, electricity, and one-time model download are excluded.",
      },
    },
    samples: { captions, quizzes, glossary, toc },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const runFiles = (args.runs ?? "").split(",").filter(Boolean).map((file) => path.resolve(file))
  if (runFiles.length < 2) throw new Error("--runs requires at least two comma-separated run JSON files")
  const booksRoot = path.resolve(args["books-root"] ?? path.join(
    os.homedir(), "Library", "Application Support", "@adt", "desktop", "books",
  ))
  let localRuntime = null
  if (args["local-status-url"]) {
    const response = await fetch(args["local-status-url"])
    if (!response.ok) throw new Error(`Local status failed: HTTP ${response.status}`)
    const status = await response.json()
    localRuntime = {
      runtime: status.runtime,
      runtimeVersion: status.runtimeVersion,
      state: status.state,
      backend: status.backend,
      device: status.device,
      deviceMemoryBytes: status.deviceMemoryBytes,
      modelGpuMemoryBytes: status.modelGpuMemoryBytes,
      loadedModelId: status.loadedModelId,
      contextSize: status.contextSize,
      gpuLayersLoaded: status.gpuLayersLoaded,
      recommendedModelId: status.recommendedModelId,
      models: status.models?.map((model) => ({
        id: model.id,
        revision: model.revision,
        license: model.license,
        downloadBytes: model.downloadBytes,
        minimumMemoryBytes: model.minimumMemoryBytes,
        installed: model.installed,
      })),
    }
  }
  const result = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    host: { platform: process.platform, architecture: process.arch, totalMemoryBytes: os.totalmem() },
    localRuntime,
    runs: runFiles.map((file) => analyzeRun(file, booksRoot)),
  }
  const serialized = `${JSON.stringify(result, null, 2)}\n`
  if (args.out) {
    const outputPath = path.resolve(args.out)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, serialized, "utf8")
  }
  process.stdout.write(serialized)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
