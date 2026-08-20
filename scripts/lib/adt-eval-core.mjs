import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { analyzeSystems, metaEvaluateJudges } from "./adt-eval-science.mjs"

const DEFAULT_PROFILES = {
  quality: { fidelity: 0.55, completeness: 0.15, accessibility: 0.15, reliability: 0.15 },
  balanced: { fidelity: 0.44, completeness: 0.12, accessibility: 0.12, reliability: 0.12, latency: 0.1, cost: 0.1 },
}

const ATOMIC_CAPTION_AXES = ["groundedness", "essentialCoverage", "languageClarity", "accessibilityUsefulness"]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function expandPath(value, baseDirectory = process.cwd()) {
  assert(typeof value === "string" && value.trim(), "Expected a non-empty path")
  const expanded = value
    .replace(/^~(?=$|\/)/, os.homedir())
    .replaceAll("${HOME}", os.homedir())
    .replaceAll("${REPO}", baseDirectory)
  return path.resolve(baseDirectory, expanded)
}

export function validateSuite(suite) {
  assert(suite?.schemaVersion === 1, "Suite schemaVersion must be 1")
  assert(typeof suite.id === "string" && suite.id.length > 0, "Suite id is required")
  assert(Array.isArray(suite.documents) && suite.documents.length > 0, "Suite needs at least one document")
  assert(Array.isArray(suite.candidates) && suite.candidates.length >= 2, "Suite needs at least two candidates")
  const documentIds = new Set(suite.documents.map((document) => document.id))
  assert(documentIds.size === suite.documents.length, "Document ids must be unique")
  const candidateIds = new Set()
  for (const candidate of suite.candidates) {
    assert(candidate?.id && !candidateIds.has(candidate.id), `Duplicate or missing candidate id: ${candidate?.id}`)
    assert(documentIds.has(candidate.documentId), `Candidate ${candidate.id} references unknown document ${candidate.documentId}`)
    assert(candidate.model, `Candidate ${candidate.id} is missing model`)
    const runs = candidate.runs ?? [candidate]
    assert(Array.isArray(runs) && runs.length > 0, `Candidate ${candidate.id} needs at least one run`)
    for (const run of runs) assert(run.runFile && run.bookDir, `Candidate ${candidate.id} needs runFile and bookDir for every run`)
    candidateIds.add(candidate.id)
  }
  const allowedDimensions = new Set(["fidelity", "completeness", "accessibility", "reliability", "latency", "cost"])
  const profiles = suite.profiles ?? DEFAULT_PROFILES
  assert(profiles.quality, "Suite needs a quality profile")
  for (const [name, rawProfile] of Object.entries(profiles)) {
    const profile = rawProfile.weights ?? rawProfile
    assert(Object.keys(profile).every((dimension) => allowedDimensions.has(dimension)), `Profile ${name} has an unknown dimension`)
    assert(Object.values(profile).every((weight) => Number.isFinite(weight) && weight >= 0), `Profile ${name} has an invalid weight`)
    const total = Object.values(profile).reduce((sum, weight) => sum + weight, 0)
    assert(Math.abs(total - 1) < 1e-6, `Profile ${name} weights must sum to 1, got ${total}`)
  }
  const anchors = suite.utilityAnchors
  if (anchors) {
    assert(anchors.latencyMaxMs > anchors.latencyTargetMs, "latencyMaxMs must exceed latencyTargetMs")
    assert(anchors.costMaxUsd > anchors.costTargetUsd, "costMaxUsd must exceed costTargetUsd")
  }
  return suite
}

export function readSuite(file) {
  const suitePath = path.resolve(file)
  const raw = JSON.parse(fs.readFileSync(suitePath, "utf8"))
  const baseDirectory = path.dirname(suitePath)
  const resolveDocument = (document, directory) => ({
    ...document,
    ...(document.sourcePdf ? { sourcePdf: expandPath(document.sourcePdf, directory) } : {}),
  })
  const referencedDocuments = (raw.documentFiles ?? []).map((documentFile) => {
    const target = expandPath(documentFile, baseDirectory)
    return resolveDocument(JSON.parse(fs.readFileSync(target, "utf8")), path.dirname(target))
  })
  const suite = validateSuite({ ...raw, documents: [
    ...(raw.documents ?? []).map((document) => resolveDocument(document, baseDirectory)),
    ...referencedDocuments,
  ] })
  for (const document of suite.documents) {
    if (document.sourcePdfSha256) {
      assert(document.sourcePdf && fs.existsSync(document.sourcePdf), `Corpus PDF not found for ${document.id}`)
      assert(sha256(document.sourcePdf) === document.sourcePdfSha256, `Corpus PDF hash mismatch for ${document.id}`)
    }
  }
  return { suite, suitePath, baseDirectory }
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim()
}

function sqliteJson(database, sql) {
  const output = run("sqlite3", ["-json", database, sql])
  return output ? JSON.parse(output) : []
}

function latestNodeItems(database, node) {
  const escaped = node.replaceAll("'", "''")
  return sqliteJson(database, `
    SELECT data.item_id, data.data
    FROM node_data data
    JOIN (
      SELECT item_id, MAX(version) AS version
      FROM node_data WHERE node = '${escaped}' GROUP BY item_id
    ) current ON current.item_id = data.item_id AND current.version = data.version
    WHERE data.node = '${escaped}' ORDER BY data.item_id
  `).map((row) => ({ itemId: row.item_id, data: row.data ? JSON.parse(row.data) : null }))
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return []
  const files = []
  const pending = [directory]
  while (pending.length) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(target)
      else if (entry.isFile()) files.push(target)
    }
  }
  return files.sort()
}

function normalizedTokens(text) {
  return String(text ?? "").toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? []
}

export function tokenRecall(sourceText, candidateText) {
  const source = normalizedTokens(sourceText)
  if (source.length === 0) return 1
  const available = new Map()
  for (const token of normalizedTokens(candidateText)) available.set(token, (available.get(token) ?? 0) + 1)
  let matched = 0
  for (const token of source) {
    const count = available.get(token) ?? 0
    if (count > 0) {
      matched++
      available.set(token, count - 1)
    }
  }
  return matched / source.length
}

function inspectExport(exportDirectory) {
  const files = listFiles(exportDirectory)
  const htmlFiles = files.filter((file) => file.endsWith(".html"))
  const mediaFiles = files.filter((file) => /\.(?:mp3|wav)$/i.test(file))
  let emptyMediaFiles = 0
  let audioDecodeErrors = 0
  for (const file of mediaFiles) {
    if (fs.statSync(file).size === 0) emptyMediaFiles++
    try { run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1", file]) }
    catch { audioDecodeErrors++ }
  }

  const missingAssets = new Set()
  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(htmlFile, "utf8")
    for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const reference = match[1].trim()
      if (!reference || /^(?:[a-z]+:|#|\/\/)/i.test(reference)) continue
      const clean = reference.split(/[?#]/)[0]
      if (!clean) continue
      let decoded
      try { decoded = decodeURIComponent(clean) } catch { decoded = clean }
      const target = path.resolve(path.dirname(htmlFile), decoded)
      if (!target.startsWith(`${path.resolve(exportDirectory)}${path.sep}`) || !fs.existsSync(target)) {
        missingAssets.add(`${path.relative(exportDirectory, htmlFile)} -> ${reference}`)
      }
    }
  }
  return {
    htmlFiles: htmlFiles.length,
    mediaFiles: mediaFiles.length,
    emptyMediaFiles,
    audioDecodeErrors,
    missingAssets: [...missingAssets].sort(),
  }
}

function captionsFromRows(rows) {
  return rows.flatMap((row) => (row.data?.captions ?? []).map((caption) => ({
    itemId: row.itemId,
    imageId: caption.imageId,
    caption: caption.caption ?? "",
    decorative: caption.decorative === true,
  })))
}

function sectionText(value) {
  const texts = []
  const visit = (node) => {
    if (!node || typeof node !== "object") return
    if (typeof node.text === "string") texts.push(node.text)
    for (const child of node.children ?? []) visit(child)
  }
  for (const section of value?.sections ?? []) for (const node of section.nodes ?? []) visit(node)
  return texts.join(" ")
}

function collectRun(candidate, descriptor, document, baseDirectory, runIndex) {
  const runId = descriptor.id ?? `r${runIndex + 1}`
  const runFile = expandPath(descriptor.runFile, baseDirectory)
  const bookDirectory = expandPath(descriptor.bookDir, baseDirectory)
  const database = path.join(bookDirectory, `${path.basename(bookDirectory)}.db`)
  const exportDirectory = path.join(bookDirectory, "adt")
  assert(fs.existsSync(runFile), `Run file not found for ${candidate.id}: ${runFile}`)
  assert(fs.existsSync(database), `Database not found for ${candidate.id}: ${database}`)
  assert(fs.existsSync(exportDirectory), `Export not found for ${candidate.id}: ${exportDirectory}`)

  const runResult = JSON.parse(fs.readFileSync(runFile, "utf8"))
  const sourcePdf = runResult.sourcePdf ? expandPath(runResult.sourcePdf, process.cwd()) : null
  const sourcePdfSha256 = runResult.sourcePdfSha256
    ?? (sourcePdf && fs.existsSync(sourcePdf) ? sha256(sourcePdf) : null)
  const pages = sqliteJson(database, "SELECT page_id, page_number, text FROM pages ORDER BY page_number")
  const positioned = latestNodeItems(database, "positioned-text")
  const sectioning = latestNodeItems(database, "page-sectioning")
  const sourceTextRecall = tokenRecall(
    positioned.flatMap((row) => row.data?.drawItems ?? [])
      .filter((item) => item.kind === "paragraph")
      .map((item) => item.text)
      .join(" "),
    sectioning.map((row) => sectionText(row.data)).join(" "),
  )
  const rendering = latestNodeItems(database, "web-rendering")
  const captions = captionsFromRows(latestNodeItems(database, "image-captioning"))
  const accessibility = latestNodeItems(database, "accessibility-assessment")[0]?.data ?? null
  const accessibilityPages = accessibility?.pages ?? []
  const llm = sqliteJson(database, `
    SELECT COUNT(*) AS calls,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS errors,
      SUM(COALESCE(json_extract(data, '$.usage.inputTokens'), 0)) AS input_tokens,
      SUM(COALESCE(json_extract(data, '$.usage.outputTokens'), 0)) AS output_tokens
    FROM llm_log
  `)[0] ?? { calls: 0, errors: 0, input_tokens: 0, output_tokens: 0 }
  const exportResult = inspectExport(exportDirectory)
  let browserSmoke = null
  if (descriptor.smokeFile) {
    const smoke = JSON.parse(fs.readFileSync(expandPath(descriptor.smokeFile, baseDirectory), "utf8"))
    const matching = smoke.results?.find((result) => result.label === runResult.label)
    browserSmoke = matching ? {
      passed: matching.successfulPages === matching.htmlFiles && (matching.errors?.length ?? 0) === 0,
      htmlFiles: matching.htmlFiles,
      successfulPages: matching.successfulPages,
      errors: matching.errors ?? [],
    } : { passed: false, htmlFiles: 0, successfulPages: 0, errors: [{ type: "evidence", message: "Run label missing from smoke evidence" }] }
  }
  const expectedPages = document.expectedPages ?? pages.length
  const pageCoverage = Math.min(sectioning.length, rendering.length, expectedPages) / expectedPages
  const violations = accessibilityPages.reduce((sum, page) => sum + (page.violationCount ?? 0), 0)
  const incomplete = accessibilityPages.reduce((sum, page) => sum + (page.incompleteCount ?? 0), 0)

  return {
    id: candidate.id,
    runId,
    displayName: candidate.displayName ?? candidate.id,
    model: candidate.model,
    local: candidate.local === true,
    documentId: candidate.documentId,
    sourcePdfSha256,
    runDurationMs: runResult.runDurationMs,
    costUsd: descriptor.costUsd ?? candidate.costUsd ?? (
      (Number(llm.input_tokens ?? 0) * (candidate.pricing?.inputPerMillionUsd ?? 0)
        + Number(llm.output_tokens ?? 0) * (candidate.pricing?.outputPerMillionUsd ?? 0)) / 1_000_000
    ),
    run: {
      label: runResult.label,
      pipelineComplete: runResult.finalStatus?.stages?.package === "done" && !runResult.finalStatus?.error,
      llmCalls: Number(llm.calls ?? 0),
      llmErrors: Number(llm.errors ?? 0),
      inputTokens: Number(llm.input_tokens ?? 0),
      outputTokens: Number(llm.output_tokens ?? 0),
    },
    metrics: {
      pageCount: pages.length,
      expectedPages,
      sectionedPages: sectioning.length,
      renderedPages: rendering.length,
      pageCoverage,
      sourceTextRecall,
      captionCount: captions.filter((caption) => !caption.decorative && caption.caption.trim()).length,
      accessibility: {
        assessedPages: accessibilityPages.length,
        violations,
        incomplete,
        disabledRules: accessibility?.disabledRules ?? [],
      },
      export: { ...exportResult, browserSmoke },
    },
    samples: {
      captions,
      quizzes: latestNodeItems(database, "quiz-generation")[0]?.data?.quizzes ?? [],
      glossary: latestNodeItems(database, "glossary")[0]?.data?.items ?? [],
      toc: latestNodeItems(database, "toc-generation")[0]?.data?.entries ?? [],
    },
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

function standardDeviation(values) {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1))
}

export function collectCandidate(candidate, document, baseDirectory) {
  const descriptors = candidate.runs ?? [candidate]
  const runs = descriptors.map((descriptor, index) => collectRun(candidate, descriptor, document, baseDirectory, index))
  const summary = (run) => ({
    runId: run.runId,
    label: run.run.label,
    runDurationMs: run.runDurationMs,
    costUsd: run.costUsd,
    technicalPassed: run.run.pipelineComplete && run.run.llmErrors === 0
      && run.metrics.export.audioDecodeErrors === 0 && run.metrics.export.emptyMediaFiles === 0
      && run.metrics.export.missingAssets.length === 0 && run.metrics.export.browserSmoke?.passed === true,
  })
  if (runs.length === 1) return { ...runs[0], repetitions: 1, runSummaries: [summary(runs[0])] }
  const durations = runs.map((run) => run.runDurationMs)
  const disabledRules = new Set(runs.flatMap((run) => run.metrics.accessibility.disabledRules))
  return {
    id: candidate.id,
    displayName: candidate.displayName ?? candidate.id,
    model: candidate.model,
    local: candidate.local === true,
    documentId: candidate.documentId,
    sourcePdfSha256: runs.every((run) => run.sourcePdfSha256 === runs[0].sourcePdfSha256) ? runs[0].sourcePdfSha256 : null,
    repetitions: runs.length,
    runDurationMs: median(durations),
    runDurationMeanMs: mean(durations),
    runDurationStdDevMs: standardDeviation(durations),
    costUsd: mean(runs.map((run) => run.costUsd)),
    run: {
      label: runs.map((run) => run.run.label).join(","),
      pipelineComplete: runs.every((run) => run.run.pipelineComplete),
      llmCalls: mean(runs.map((run) => run.run.llmCalls)),
      llmErrors: Math.max(...runs.map((run) => run.run.llmErrors)),
      inputTokens: mean(runs.map((run) => run.run.inputTokens)),
      outputTokens: mean(runs.map((run) => run.run.outputTokens)),
    },
    metrics: {
      pageCount: Math.min(...runs.map((run) => run.metrics.pageCount)),
      expectedPages: document.expectedPages,
      sectionedPages: Math.min(...runs.map((run) => run.metrics.sectionedPages)),
      renderedPages: Math.min(...runs.map((run) => run.metrics.renderedPages)),
      pageCoverage: Math.min(...runs.map((run) => run.metrics.pageCoverage)),
      sourceTextRecall: mean(runs.map((run) => run.metrics.sourceTextRecall)),
      captionCount: Math.min(...runs.map((run) => run.metrics.captionCount)),
      accessibility: {
        assessedPages: Math.min(...runs.map((run) => run.metrics.accessibility.assessedPages)),
        violations: Math.max(...runs.map((run) => run.metrics.accessibility.violations)),
        incomplete: Math.max(...runs.map((run) => run.metrics.accessibility.incomplete)),
        disabledRules: [...disabledRules].sort(),
      },
      export: {
        htmlFiles: Math.min(...runs.map((run) => run.metrics.export.htmlFiles)),
        mediaFiles: Math.min(...runs.map((run) => run.metrics.export.mediaFiles)),
        emptyMediaFiles: Math.max(...runs.map((run) => run.metrics.export.emptyMediaFiles)),
        audioDecodeErrors: Math.max(...runs.map((run) => run.metrics.export.audioDecodeErrors)),
        missingAssets: runs.flatMap((run) => run.metrics.export.missingAssets.map((asset) => `${run.runId}: ${asset}`)),
        browserSmoke: {
          passed: runs.every((run) => run.metrics.export.browserSmoke?.passed === true),
          evidenceRuns: runs.filter((run) => run.metrics.export.browserSmoke !== null).length,
          errors: runs.flatMap((run) => run.metrics.export.browserSmoke?.errors ?? []),
        },
      },
    },
    samples: {
      captions: runs.flatMap((run) => run.samples.captions.map((sample) => ({ ...sample, runId: run.runId }))),
      quizzes: runs.flatMap((run) => run.samples.quizzes.map((sample) => ({ ...sample, _evalRunId: run.runId }))),
      glossary: runs.flatMap((run) => run.samples.glossary.map((sample) => ({ ...sample, _evalRunId: run.runId }))),
      toc: runs.flatMap((run) => run.samples.toc.map((sample) => ({ ...sample, _evalRunId: run.runId }))),
    },
    runSummaries: runs.map(summary),
  }
}

export function loadReviews(reviewFiles, baseDirectory) {
  const reviews = []
  const comparisons = []
  for (const file of reviewFiles ?? []) {
    const target = expandPath(file, baseDirectory)
    const value = JSON.parse(fs.readFileSync(target, "utf8"))
    assert(value.schemaVersion === 1 && Array.isArray(value.reviews), `Invalid review file: ${target}`)
    reviews.push(...value.reviews)
    comparisons.push(...(value.comparisons ?? []))
  }
  return { reviews, comparisons }
}

function reviewSummary(candidateId, document, reviews, repetitions) {
  const relevant = reviews.filter((review) => review.candidateId === candidateId && review.dimension === "captionFidelity")
  const byItem = new Map()
  for (const review of relevant) {
    for (const item of review.items ?? []) {
      if (!byItem.has(item.itemId)) byItem.set(item.itemId, [])
      byItem.get(item.itemId).push(Number(item.score))
    }
  }
  const itemScores = [...byItem.entries()].map(([itemId, scores]) => ({
    itemId,
    score: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    reviews: scores.length,
  }))
  const requiredItems = (document.rubric?.captions?.length ?? itemScores.length) * repetitions
  const mean = itemScores.length
    ? itemScores.reduce((sum, item) => sum + item.score, 0) / itemScores.length
    : null
  const reviewers = new Set(relevant.map((review) => review.reviewerId)).size
  const humanReviewers = new Set(relevant.filter((review) => !review.judgeModel).map((review) => review.reviewerId)).size
  const atomicCoverages = relevant.flatMap((review) => (review.items ?? []).map((item) => item.atomicDecisionCoverage)).filter(Number.isFinite)
  const byRun = new Map()
  for (const item of itemScores) {
    const run = item.itemId.match(/^(r\d+):/)?.[1] ?? "r1"
    if (!byRun.has(run)) byRun.set(run, [])
    byRun.get(run).push(item.score)
  }
  return {
    score: mean,
    itemScores,
    requiredItems,
    reviewedItems: itemScores.length,
    coverage: requiredItems > 0 ? itemScores.length / requiredItems : 0,
    reviewers,
    humanReviewers,
    blinded: relevant.length > 0 && relevant.every((review) => review.blinded === true),
    worstRunScore: byRun.size ? Math.min(...[...byRun.values()].map((scores) => scores.reduce((sum, score) => sum + score, 0) / scores.length)) : null,
    atomicDecisionCoverage: atomicCoverages.length ? atomicCoverages.reduce((sum, value) => sum + value, 0) / atomicCoverages.length : null,
  }
}

function mulberry32(seed) {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

export function bootstrapMean(values, { seed = 1, samples = 5_000 } = {}) {
  if (!values.length) return null
  const random = mulberry32(seed)
  const means = []
  for (let sample = 0; sample < samples; sample++) {
    let total = 0
    for (let index = 0; index < values.length; index++) {
      total += values[Math.floor(random() * values.length)]
    }
    means.push(total / values.length)
  }
  means.sort((a, b) => a - b)
  return {
    low: means[Math.floor(samples * 0.025)],
    high: means[Math.floor(samples * 0.975)],
  }
}

function clampScore(value) {
  return Math.max(0, Math.min(100, value))
}

function utility(value, target, maximum) {
  if (value <= target) return 100
  if (value >= maximum) return 0
  return 100 * (maximum - value) / (maximum - target)
}

function weightedScore(dimensions, weights) {
  return Object.entries(weights).reduce((score, [dimension, weight]) => score + (dimensions[dimension] ?? 0) * weight, 0)
}

function candidateScores(candidate, document, reviews, suite) {
  const review = reviewSummary(candidate.id, document, reviews, candidate.repetitions ?? 1)
  const captionScore = review.score == null ? null : review.score * 100
  const a11y = candidate.metrics.accessibility
  const exportMetrics = candidate.metrics.export
  const dimensions = {
    fidelity: captionScore == null
      ? null
      : clampScore(candidate.metrics.sourceTextRecall * 40 + captionScore * 0.6),
    completeness: clampScore(candidate.metrics.pageCoverage * 100),
    accessibility: clampScore(100 - a11y.violations * 10 - a11y.incomplete * 2 - a11y.disabledRules.length * 5),
    reliability: clampScore(100
      - candidate.run.llmErrors * 20
      - exportMetrics.missingAssets.length * 10
      - exportMetrics.audioDecodeErrors * 20
      - exportMetrics.emptyMediaFiles * 20
      - (exportMetrics.browserSmoke?.passed === false ? 100 : 0)
      - (candidate.run.pipelineComplete ? 0 : 100)),
    latency: utility(candidate.runDurationMs, suite.utilityAnchors?.latencyTargetMs ?? 120_000, suite.utilityAnchors?.latencyMaxMs ?? 600_000),
    cost: utility(candidate.costUsd, suite.utilityAnchors?.costTargetUsd ?? 0, suite.utilityAnchors?.costMaxUsd ?? 2),
  }
  const gateFailures = []
  if (!candidate.run.pipelineComplete) gateFailures.push("pipeline did not complete")
  if (document.sourcePdfSha256 && candidate.sourcePdfSha256 !== document.sourcePdfSha256) gateFailures.push("source PDF hash does not match corpus")
  if (candidate.run.llmErrors > (suite.gates?.maxLlmErrors ?? 0)) gateFailures.push("LLM errors exceed gate")
  if (candidate.metrics.pageCoverage < (suite.gates?.minimumPageCoverage ?? 1)) gateFailures.push("page coverage below gate")
  if (exportMetrics.missingAssets.length) gateFailures.push("export has missing assets")
  if (suite.gates?.requireBrowserSmoke !== false && exportMetrics.browserSmoke?.passed !== true) gateFailures.push("browser export smoke is missing or failed")
  if (exportMetrics.audioDecodeErrors || exportMetrics.emptyMediaFiles) gateFailures.push("export has invalid audio")
  if (a11y.violations > (suite.gates?.maxAccessibilityViolations ?? 0)) gateFailures.push("accessibility violations exceed gate")
  if (a11y.incomplete > (suite.gates?.maxAccessibilityIncomplete ?? Number.POSITIVE_INFINITY)) gateFailures.push("accessibility incomplete checks exceed gate")
  if (review.coverage < (suite.gates?.minimumReviewCoverage ?? 1)) gateFailures.push("human review coverage below gate")
  if (review.reviewers < (suite.gates?.minimumReviewers ?? 1)) gateFailures.push("not enough reviewers")
  if (review.humanReviewers < (suite.gates?.minimumHumanReviewers ?? 0)) gateFailures.push("not enough human reviewers")
  if (review.atomicDecisionCoverage != null && review.atomicDecisionCoverage < (suite.gates?.minimumAtomicDecisionCoverage ?? 0.9)) gateFailures.push("atomic judge decision coverage below gate")
  if (captionScore != null && captionScore < (suite.gates?.minimumCaptionScore ?? 0)) gateFailures.push("caption quality below gate")
  if (dimensions.fidelity == null) gateFailures.push("required fidelity score is missing")

  const profiles = suite.profiles ?? DEFAULT_PROFILES
  const leaderboards = Object.fromEntries(Object.entries(profiles).map(([name, profile]) => [
    name,
    Number(weightedScore(dimensions, profile.weights ?? profile).toFixed(3)),
  ]))
  const interval = bootstrapMean(review.itemScores.map((item) => item.score), {
    seed: (suite.seed ?? 1) + candidate.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0),
  })
  const qualityWeights = profiles.quality?.weights ?? profiles.quality ?? DEFAULT_PROFILES.quality
  const qualityInterval = interval ? {
    low: Number(weightedScore({ ...dimensions, fidelity: candidate.metrics.sourceTextRecall * 40 + interval.low * 60 }, qualityWeights).toFixed(3)),
    high: Number(weightedScore({ ...dimensions, fidelity: candidate.metrics.sourceTextRecall * 40 + interval.high * 60 }, qualityWeights).toFixed(3)),
  } : null
  return { dimensions, review, leaderboards, qualityInterval, eligible: gateFailures.length === 0, gateFailures }
}

function paretoFrontier(candidates) {
  return candidates.filter((candidate) => !candidates.some((other) => other.id !== candidate.id
    && other.scores.leaderboards.quality >= candidate.scores.leaderboards.quality
    && other.runDurationMs <= candidate.runDurationMs
    && other.costUsd <= candidate.costUsd
    && (other.scores.leaderboards.quality > candidate.scores.leaderboards.quality
      || other.runDurationMs < candidate.runDurationMs
      || other.costUsd < candidate.costUsd))).map((candidate) => candidate.id)
}

export function evaluateSuite(suite, baseDirectory) {
  const reviewBundle = loadReviews(suite.reviewFiles ?? [], baseDirectory)
  const { reviews, comparisons } = reviewBundle
  const candidateIds = new Set(suite.candidates.map((candidate) => candidate.id))
  for (const review of reviews) {
    assert(candidateIds.has(review.candidateId), `Review references unknown candidate ${review.candidateId}`)
    assert(review.reviewerId && review.dimension === "captionFidelity", "Review needs reviewerId and captionFidelity dimension")
    for (const item of review.items ?? []) assert(Number.isFinite(item.score) && item.score >= 0 && item.score <= 1, `Review score must be 0-1 for ${review.candidateId}/${item.itemId}`)
  }
  const documentById = new Map(suite.documents.map((document) => [document.id, document]))
  const candidates = suite.candidates.map((candidate) => {
    const document = documentById.get(candidate.documentId)
    const collected = collectCandidate(candidate, document, baseDirectory)
    return {
      ...collected,
      systemId: candidate.systemId ?? candidate.id,
      scores: candidateScores(collected, document, reviews, suite),
    }
  })
  const profileNames = Object.keys(suite.profiles ?? DEFAULT_PROFILES)
  const rankings = Object.fromEntries(profileNames.map((profile) => [profile, candidates
    .slice()
    .sort((left, right) => Number(right.scores.eligible) - Number(left.scores.eligible)
      || right.scores.leaderboards[profile] - left.scores.leaderboards[profile])
    .map((candidate, index) => ({ rank: index + 1, candidateId: candidate.id, eligible: candidate.scores.eligible, score: candidate.scores.leaderboards[profile] }))]))
  const pairwise = new Map(candidates.map((candidate) => [candidate.id, { candidateId: candidate.id, points: 0, comparisons: 0 }]))
  for (const comparison of comparisons) {
    const ids = comparison.candidateIds ?? []
    for (const id of ids) {
      assert(pairwise.has(id), `Pairwise review references unknown candidate ${id}`)
      const value = pairwise.get(id)
      value.comparisons++
      value.points += comparison.winnerCandidateId == null ? 0.5 : Number(comparison.winnerCandidateId === id)
    }
  }
  const pairwiseRanking = comparisons.length ? [...pairwise.values()]
    .map((value) => ({ ...value, winRate: value.comparisons ? value.points / value.comparisons : null }))
    .sort((left, right) => (right.winRate ?? -1) - (left.winRate ?? -1))
    .map((value, index) => ({ rank: index + 1, ...value })) : null
  const warnings = []
  if (candidates.some((candidate) => !candidate.scores.review.blinded)) warnings.push("At least one required human review was not blinded; rankings are provisional.")
  if (candidates.some((candidate) => candidate.scores.review.reviewers < 2)) warnings.push("Fewer than two independent reviewers scored at least one candidate.")
  const judgeModels = new Set(reviews.map((review) => review.judgeModel).filter(Boolean))
  for (const candidate of candidates) {
    if (judgeModels.has(candidate.model)) warnings.push(`Judge leakage risk: ${candidate.model} also appears as a candidate model.`)
  }
  const minimumDocuments = suite.recommendationPolicy?.minimumDocuments ?? 5
  if (suite.documents.length < minimumDocuments) warnings.push(`The corpus has fewer than ${minimumDocuments} documents; do not generalize this ranking beyond the represented document type.`)
  const systemAnalysis = analyzeSystems(candidates, suite.documents, comparisons, suite)
  const judgeMetaEvaluation = metaEvaluateJudges(reviews, suite.judgePolicy ?? {})
  if (reviews.some((review) => review.judgeModel) && !judgeMetaEvaluation.calibrated) {
    warnings.push("Automated judges have not met the configured human-agreement evidence bar; judge-derived recommendations are provisional.")
  }
  if (systemAnalysis.systems.some((system) => !system.recommendationEligible)) {
    warnings.push("At least one system lacks the minimum document coverage required for a publishable recommendation.")
  }
  return {
    schemaVersion: 1,
    suite: { id: suite.id, title: suite.title, seed: suite.seed ?? 1 },
    generatedAt: new Date().toISOString(),
    methodology: {
      rankingRule: "Hard gates first; then transparent weighted profiles. Quality confidence intervals bootstrap reviewed rubric items.",
      statisticalUnit: "Documents, not pages or rubric items, are the independent unit for system-level confidence intervals and paired comparisons.",
      dimensions: {
        fidelity: "40% lexical source-text preservation and 60% reviewed caption fidelity.",
        completeness: "Minimum expected page sectioning/rendering coverage across repetitions.",
        accessibility: "100 minus 10 per axe violation, 2 per incomplete check, and 5 per disabled rule.",
        reliability: "Completed package with zero LLM errors, invalid audio files, missing assets, or browser runtime failures.",
        latency: "Linear utility between the configured target and maximum, using median end-to-end wall time.",
        cost: "Linear utility between the configured target and maximum, using mean cost per completed ADT.",
      },
      gates: suite.gates ?? {},
      utilityAnchors: suite.utilityAnchors ?? { latencyTargetMs: 120_000, latencyMaxMs: 600_000, costTargetUsd: 0, costMaxUsd: 2 },
      profiles: suite.profiles ?? DEFAULT_PROFILES,
      provisional: warnings.length > 0,
      warnings,
    },
    candidates,
    rankings,
    pairwiseRanking,
    paretoFrontier: paretoFrontier(candidates),
    systemAnalysis,
    judgeMetaEvaluation,
  }
}

function shuffle(values, random) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

export function createBlindCaptionPack(suite, baseDirectory) {
  const random = mulberry32(suite.seed ?? 1)
  const blindSuiteId = `suite-${crypto.createHash("sha256").update(`${suite.id}:${suite.seed ?? 1}`).digest("hex").slice(0, 12)}`
  const documentById = new Map(suite.documents.map((document) => [document.id, document]))
  const collected = suite.candidates.map((candidate) => collectCandidate(candidate, documentById.get(candidate.documentId), baseDirectory))
  const samples = []
  const key = []
  for (const document of suite.documents) {
    for (const rubric of document.rubric?.captions ?? []) {
      const candidates = collected.filter((candidate) => candidate.documentId === document.id)
      const repetitions = Math.max(...candidates.map((candidate) => candidate.repetitions ?? 1))
      for (let runIndex = 0; runIndex < repetitions; runIndex++) {
        const reviewItemId = repetitions === 1 ? rubric.itemId : `r${runIndex + 1}:${rubric.itemId}`
        const sampleId = `${document.id}:caption:${reviewItemId}`
        const shuffled = shuffle(candidates, random)
        const options = shuffled.map((candidate, index) => {
          const alias = String.fromCharCode(65 + index)
          const runId = candidate.runSummaries?.[runIndex]?.runId ?? candidate.runId
          const captions = candidate.samples.captions.filter((caption) =>
            caption.itemId === rubric.itemId && (!caption.runId || caption.runId === runId))
          key.push({ sampleId, alias, candidateId: candidate.id, reviewItemId })
          return { alias, output: captions.map((caption) => caption.caption).join("\n") }
        })
        samples.push({
          sampleId,
          documentId: document.id,
          itemId: rubric.itemId,
          reviewItemId,
          criterion: rubric.criterion,
          sourcePdf: document.sourcePdf ?? null,
          sourcePage: Number.parseInt(rubric.itemId.replace(/^pg/, ""), 10),
          options,
          judgment: {
            scores: Object.fromEntries(options.map((option) => [option.alias, { fidelity: null, completeness: null, clarity: null }])),
            criteria: Object.fromEntries(options.map((option) => [option.alias, Object.fromEntries(ATOMIC_CAPTION_AXES.map((axis) => [axis, {
              verdict: null,
              confidence: null,
              evidence: "",
            }]))])),
            preferred: null,
            rationale: "",
          },
        })
      }
    }
  }
  return {
    pack: { schemaVersion: 1, suiteId: blindSuiteId, seed: suite.seed ?? 1, samples },
    key: { schemaVersion: 1, suiteId: blindSuiteId, sourceSuiteId: suite.id, mappings: key },
  }
}

export function resolveBlindCaptionReview(pack, key, reviewerId) {
  assert(pack?.schemaVersion === 1 && Array.isArray(pack.samples), "Invalid blind review pack")
  assert(key?.schemaVersion === 1 && Array.isArray(key.mappings), "Invalid blind review key")
  assert(pack.suiteId === key.suiteId, "Blind pack and key suite ids do not match")
  assert(typeof reviewerId === "string" && reviewerId.trim(), "reviewerId is required")
  const mappings = new Map(key.mappings.map((mapping) => [`${mapping.sampleId}:${mapping.alias}`, mapping]))
  const itemsByCandidate = new Map()
  const comparisons = []
  for (const sample of pack.samples) {
    const sampleMappings = []
    for (const option of sample.options ?? []) {
      const mapping = mappings.get(`${sample.sampleId}:${option.alias}`)
      assert(mapping, `Missing key mapping for ${sample.sampleId}/${option.alias}`)
      const scores = sample.judgment?.scores?.[option.alias]
      const values = [scores?.fidelity, scores?.completeness, scores?.clarity].map(Number)
      const atomic = sample.judgment?.criteria?.[option.alias]
      const atomicComplete = ATOMIC_CAPTION_AXES.every((axis) => ["met", "not_met", "uncertain"].includes(atomic?.[axis]?.verdict))
      const legacyComplete = values.every((value) => Number.isFinite(value) && value >= 1 && value <= 5)
      assert(atomicComplete || legacyComplete, `Incomplete atomic or 1-5 scores for ${sample.sampleId}/${option.alias}`)
      const decidedAtomic = atomicComplete ? ATOMIC_CAPTION_AXES.filter((axis) => atomic[axis].verdict !== "uncertain") : []
      const normalized = atomicComplete
        ? (decidedAtomic.length
          ? decidedAtomic.reduce((sum, axis) => sum + Number(atomic[axis].verdict === "met"), 0) / decidedAtomic.length
          : 0.5)
        : values.reduce((sum, value) => sum + (value - 1) / 4, 0) / values.length
      if (!itemsByCandidate.has(mapping.candidateId)) itemsByCandidate.set(mapping.candidateId, [])
      sampleMappings.push({ alias: option.alias, candidateId: mapping.candidateId })
      itemsByCandidate.get(mapping.candidateId).push({
        itemId: mapping.reviewItemId ?? sample.reviewItemId ?? sample.itemId,
        score: Number(normalized.toFixed(6)),
        rationale: sample.judgment?.rationale ?? "",
        ...(atomicComplete ? { atomicCriteria: ATOMIC_CAPTION_AXES.map((axis) => ({ rubricId: axis, ...atomic[axis] })) } : {}),
        ...(atomicComplete ? { atomicDecisionCoverage: decidedAtomic.length / ATOMIC_CAPTION_AXES.length } : {}),
      })
    }
    const preferred = sample.judgment?.preferred
    assert(preferred === "tie" || sampleMappings.some((mapping) => mapping.alias === preferred), `Invalid preference for ${sample.sampleId}`)
    comparisons.push({
      reviewerId: reviewerId.trim(),
      blinded: true,
      sampleId: sample.sampleId,
      candidateIds: sampleMappings.map((mapping) => mapping.candidateId),
      winnerCandidateId: preferred === "tie" ? null : sampleMappings.find((mapping) => mapping.alias === preferred).candidateId,
      rationale: sample.judgment?.rationale ?? "",
    })
  }
  return {
    schemaVersion: 1,
    suiteId: pack.suiteId,
    reviews: [...itemsByCandidate.entries()].map(([candidateId, items]) => ({
      reviewerId: reviewerId.trim(),
      blinded: true,
      candidateId,
      dimension: "captionFidelity",
      items,
    })),
    comparisons,
  }
}

export function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}
