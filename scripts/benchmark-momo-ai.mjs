#!/usr/bin/env node

import fs from "node:fs"
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

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const values = {}
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separator = line.indexOf("=")
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1)
    values[key] = value
  }
  return values
}

async function expectJson(response, operation) {
  const body = await response.json().catch(async () => ({ error: await response.text() }))
  if (!response.ok) {
    const message = body?.error ?? body?.message ?? JSON.stringify(body)
    throw new Error(`${operation} failed (${response.status}): ${message}`)
  }
  return body
}

async function getJsonWithRetry(url, operation, attempts = 5) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await expectJson(await fetch(url), operation)
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
      }
    }
  }
  throw lastError
}

function benchmarkConfig(mode) {
  const common = {
    editing_language: "en",
    output_languages: ["en"],
    start_page: 1,
    end_page: 20,
  }
  if (mode === "local") {
    return {
      ...common,
      default_model: "local:gemma4-12b",
      concurrency: 1,
      speech: {
        default_provider: "local-hf",
        format: "wav",
        word_highlighting: false,
        providers: {
          "local-hf": {
            adapter: "kokoro",
            model: "onnx-community/Kokoro-82M-v1.0-ONNX",
            voice: "af_heart",
            dtype: "q8",
            device: "cpu",
            speed: 1,
            languages: ["en"],
          },
        },
      },
    }
  }
  if (mode === "openai") {
    return {
      ...common,
      default_model: "openai:gpt-5.4",
      concurrency: 32,
      speech: {
        default_provider: "openai",
        model: "gpt-4o-mini-tts",
        format: "mp3",
        word_highlighting: false,
      },
    }
  }
  throw new Error(`Unsupported mode: ${mode}. Use local or openai.`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const mode = args.mode
  const label = args.label
  if (!label) throw new Error("--label is required")
  const pdfPath = path.resolve(args.pdf ?? "/Users/amoghbanta/Downloads/UNICEF/momograde1.pdf")
  const outputPath = args.out ? path.resolve(args.out) : null
  const baseUrl = (args["base-url"] ?? "http://127.0.0.1:3133/api").replace(/\/$/, "")
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`)

  const fileEnv = readEnvFile(path.resolve(".env"))
  const openaiApiKey = process.env.OPENAI_API_KEY
    ?? fileEnv.OPENAI_API_KEY
    ?? fileEnv.OPEN_AI_API_KEY
  if (mode === "openai" && !openaiApiKey) {
    throw new Error("OpenAI mode requires OPENAI_API_KEY (legacy OPEN_AI_API_KEY is also accepted).")
  }

  if (mode === "openai") {
    await expectJson(await fetch("https://api.openai.com/v1/models/gpt-5.4", {
      headers: { authorization: `Bearer ${openaiApiKey}` },
    }), "OpenAI model-access check")
  }

  const existing = await expectJson(await fetch(`${baseUrl}/books`), "List books")
  if (existing.some((book) => book.label === label)) {
    throw new Error(`Book already exists: ${label}. Use a new label; benchmark runs never overwrite data.`)
  }

  const createStartedAt = Date.now()
  const form = new FormData()
  form.set("label", label)
  form.set("pdf", new Blob([fs.readFileSync(pdfPath)], { type: "application/pdf" }), path.basename(pdfPath))
  form.set("config", JSON.stringify(benchmarkConfig(mode)))
  await expectJson(await fetch(`${baseUrl}/books`, { method: "POST", body: form }), "Create benchmark book")
  const createCompletedAt = Date.now()

  const headers = { "content-type": "application/json" }
  if (mode === "openai" && openaiApiKey) headers["X-OpenAI-Key"] = openaiApiKey
  const runStartedAt = Date.now()
  const start = await expectJson(await fetch(`${baseUrl}/books/${label}/stages/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ fromStage: "extract", toStage: "package", pageErrorPolicy: "stop" }),
  }), "Start benchmark run")
  if (start.status !== "started") throw new Error(`Benchmark did not start immediately: ${start.status}`)

  const transitions = []
  let previousSignature = ""
  let finalStatus
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    finalStatus = await getJsonWithRetry(
      `${baseUrl}/books/${label}/step-status`,
      "Read benchmark status",
    )
    const signature = JSON.stringify({
      runStatus: finalStatus.runStatus,
      stages: finalStatus.stages,
      error: finalStatus.error,
    })
    if (signature !== previousSignature) {
      transitions.push({ at: new Date().toISOString(), ...JSON.parse(signature) })
      previousSignature = signature
    }
    if (finalStatus.runStatus !== "running") break
  }
  const runCompletedAt = Date.now()
  if (finalStatus.error || finalStatus.stages?.package !== "done") {
    throw new Error(`Benchmark failed: ${finalStatus.error ?? "package stage did not complete"}`)
  }

  const result = {
    schemaVersion: 1,
    label,
    mode,
    model: benchmarkConfig(mode).default_model,
    speechProvider: benchmarkConfig(mode).speech.default_provider,
    sourcePdf: pdfPath,
    createdAt: new Date().toISOString(),
    createDurationMs: createCompletedAt - createStartedAt,
    runDurationMs: runCompletedAt - runStartedAt,
    transitions,
    finalStatus,
  }
  const serialized = `${JSON.stringify(result, null, 2)}\n`
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, serialized, "utf8")
  }
  process.stdout.write(serialized)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
