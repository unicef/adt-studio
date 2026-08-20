#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Expected --name value; received ${key ?? "(nothing)"}`)
    args[key.slice(2)] = value
  }
  return args
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).flatMap((line) => {
    const value = line.trim()
    if (!value || value.startsWith("#") || !value.includes("=")) return []
    const index = value.indexOf("=")
    const key = value.slice(0, index).trim()
    let content = value.slice(index + 1).trim()
    if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith("'") && content.endsWith("'"))) content = content.slice(1, -1)
    return [[key, content]]
  }))
}

function merge(left, right) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return structuredClone(right)
  const result = structuredClone(left)
  for (const [key, value] of Object.entries(right ?? {})) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? merge(result[key] ?? {}, value)
      : structuredClone(value)
  }
  return result
}

function seededShuffle(values, seed) {
  let state = seed >>> 0
  const random = () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  const output = [...values]
  for (let index = output.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[output[index], output[swap]] = [output[swap], output[index]]
  }
  return output
}

async function expectJson(response, operation) {
  const body = await response.json().catch(async () => ({ error: await response.text() }))
  if (!response.ok) throw new Error(`${operation} failed (${response.status}): ${body?.error ?? body?.message ?? JSON.stringify(body)}`)
  return body
}

async function runCandidate({ candidate, matrix, pdfPath, baseUrl, credentials, label, outputFile }) {
  const existing = await expectJson(await fetch(`${baseUrl}/books`), "List books")
  if (existing.some((book) => book.label === label)) throw new Error(`Book already exists: ${label}`)
  const form = new FormData()
  form.set("label", label)
  form.set("pdf", new Blob([fs.readFileSync(pdfPath)], { type: "application/pdf" }), path.basename(pdfPath))
  const config = merge(matrix.baseConfig, merge(candidate.config, { default_model: candidate.model }))
  form.set("config", JSON.stringify(config))
  const createStarted = Date.now()
  await expectJson(await fetch(`${baseUrl}/books`, { method: "POST", body: form }), "Create book")
  const headers = { "content-type": "application/json" }
  for (const credential of candidate.credentials ?? []) {
    const value = process.env[credential.env] ?? credentials[credential.env]
    if (!value) throw new Error(`${candidate.id} requires ${credential.env}`)
    headers[credential.header] = value
  }
  const runStarted = Date.now()
  await expectJson(await fetch(`${baseUrl}/books/${label}/stages/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ fromStage: "extract", toStage: "package", pageErrorPolicy: "stop" }),
  }), "Start run")
  const transitions = []
  let signature = ""
  let status
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    status = await expectJson(await fetch(`${baseUrl}/books/${label}/step-status`), "Read status")
    const next = JSON.stringify({ runStatus: status.runStatus, stages: status.stages, error: status.error })
    if (next !== signature) {
      transitions.push({ at: new Date().toISOString(), ...JSON.parse(next) })
      signature = next
    }
    if (status.runStatus !== "running") break
  }
  if (status.error || status.stages?.package !== "done") throw new Error(status.error ?? "Package stage did not complete")
  const result = {
    schemaVersion: 1,
    matrixId: matrix.id,
    candidateId: candidate.id,
    label,
    mode: candidate.local ? "local" : "cloud",
    model: candidate.model,
    speechProvider: config.speech?.default_provider ?? null,
    sourcePdf: pdfPath,
    sourcePdfSha256: crypto.createHash("sha256").update(fs.readFileSync(pdfPath)).digest("hex"),
    createdAt: new Date().toISOString(),
    createDurationMs: runStarted - createStarted,
    runDurationMs: Date.now() - runStarted,
    transitions,
    finalStatus: status,
  }
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dryRun = args["dry-run"] === "true"
  if (!args.matrix || (!dryRun && (!args["base-url"] || !args["books-root"] || !args["out-dir"]))) {
    throw new Error("Required: --matrix, --base-url, --books-root, and --out-dir")
  }
  const matrixPath = path.resolve(args.matrix)
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"))
  if (matrix.schemaVersion !== 1 || !matrix.id || !Array.isArray(matrix.candidates) || matrix.candidates.length < 2) throw new Error("Invalid matrix")
  const pdfPath = path.resolve(path.dirname(matrixPath), matrix.pdf)
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`)
  const document = matrix.documentFile
    ? JSON.parse(fs.readFileSync(path.resolve(path.dirname(matrixPath), matrix.documentFile), "utf8"))
    : matrix.document
  if (!document?.id) throw new Error("Matrix needs documentFile or document for evaluation")
  const repetitions = Number.parseInt(args.repetitions ?? matrix.repetitions ?? "3", 10)
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20) throw new Error("repetitions must be 1-20")
  const seed = Number.parseInt(args.seed ?? matrix.seed ?? "1", 10)
  const plan = []
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    for (const candidate of seededShuffle(matrix.candidates, seed + repetition)) plan.push({ candidate, repetition })
  }
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ valid: true, matrixId: matrix.id, pdfPath, documentId: document.id, repetitions, plan: plan.map(({ candidate, repetition }) => ({ candidateId: candidate.id, repetition })) }, null, 2)}\n`)
    return
  }
  const baseUrl = args["base-url"].replace(/\/$/, "")
  const booksRoot = path.resolve(args["books-root"])
  const outDirectory = path.resolve(args["out-dir"])
  const credentials = { ...readEnvFile(path.resolve(".env")), ...process.env }
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
  const results = []
  for (const { candidate, repetition } of plan) {
    const label = `${matrix.id}-${candidate.id}-r${repetition}-${timestamp}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 100)
    const outputFile = path.join(outDirectory, candidate.id, `r${repetition}.json`)
    process.stderr.write(`[adt-eval] ${candidate.id} repetition ${repetition}/${repetitions}\n`)
    const result = await runCandidate({ candidate, matrix, pdfPath, baseUrl, credentials, label, outputFile })
    const smokeFile = outputFile.replace(/\.json$/, ".smoke.json")
    execFileSync(process.execPath, [path.join(SCRIPT_DIRECTORY, "smoke-adt-exports.mjs"), "--labels", label, "--books-root", booksRoot, "--out", smokeFile], {
      stdio: ["ignore", "ignore", "inherit"],
      maxBuffer: 32 * 1024 * 1024,
    })
    results.push({ candidateId: candidate.id, repetition, label, runFile: outputFile, bookDir: path.join(booksRoot, label), smokeFile, runDurationMs: result.runDurationMs })
  }
  const manifest = { schemaVersion: 1, matrixId: matrix.id, seed, repetitions, generatedAt: new Date().toISOString(), results }
  fs.mkdirSync(outDirectory, { recursive: true })
  fs.writeFileSync(path.join(outDirectory, "matrix-results.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  const generatedSuite = {
    schemaVersion: 1,
    id: `${matrix.id}-generated`,
    title: matrix.title ?? matrix.id,
    seed,
    documents: [{
      ...document,
      sourcePdf: pdfPath,
      sourcePdfSha256: crypto.createHash("sha256").update(fs.readFileSync(pdfPath)).digest("hex"),
    }],
    candidates: matrix.candidates.map((candidate) => ({
      id: candidate.id,
      displayName: candidate.displayName ?? candidate.id,
      model: candidate.model,
      local: candidate.local === true,
      documentId: document.id,
      ...(candidate.costUsd == null ? {} : { costUsd: candidate.costUsd }),
      ...(candidate.pricing ? { pricing: candidate.pricing } : {}),
      runs: results.filter((result) => result.candidateId === candidate.id).map((result) => ({
        id: `r${result.repetition}`,
        runFile: result.runFile,
        bookDir: result.bookDir,
        smokeFile: result.smokeFile,
        ...(candidate.costUsd == null ? {} : { costUsd: candidate.costUsd }),
      })),
    })),
    reviewFiles: [],
    gates: matrix.evaluation?.gates ?? {
      maxLlmErrors: 0,
      maxAccessibilityViolations: 0,
      maxAccessibilityIncomplete: 0,
      minimumPageCoverage: 1,
      minimumReviewCoverage: 1,
      minimumReviewers: 2,
      minimumHumanReviewers: 1,
      minimumCaptionScore: 70,
      requireBrowserSmoke: true,
    },
    utilityAnchors: matrix.evaluation?.utilityAnchors,
    profiles: matrix.evaluation?.profiles,
  }
  const generatedSuitePath = path.join(outDirectory, "suite.generated.json")
  fs.writeFileSync(generatedSuitePath, `${JSON.stringify(generatedSuite, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ ...manifest, generatedSuite: generatedSuitePath }, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
