/**
 * Extract report: a read-only account of what the Extract stage produced for
 * a book and what it cost.
 *
 * Reports, per book, the text layer the PDF gave us, the images extraction
 * produced (and how many are byte-identical copies), what the deterministic
 * filter and the meaningfulness model pruned, and every Extract LLM task's
 * calls, cache hits (with each miss attributed to its cause), failures,
 * tokens, latency and estimated cost. It opens the database read-only,
 * writes nothing, migrates nothing and calls no model. Two reports of the
 * same PDF can be diffed to see what a change did.
 */
import { openBookDbReadOnly, readCurrentNodeRow } from "@adt/storage"
import { estimateCost, type LlmLogEntry, type LlmLogImagePlaceholder } from "@adt/llm"
import { SCHEMA_VERSION, STAGE_BY_NAME, ImageClassificationOutput } from "@adt/types"
import { loadBookConfig } from "./config.js"
import { inspectBookFile, listBookLabels, type SchemaStatus } from "./book-inspection.js"

type BookDb = ReturnType<typeof openBookDbReadOnly>

/** Pages with fewer non-whitespace characters than this count as having no text layer. */
export const MIN_TEXT_LAYER_CHARS = 20
/** A book-summary call above this many input characters is reported. */
export const SUMMARY_INPUT_CHARS_LIMIT = 60_000

export type TextProfile = "image-only" | "weak" | "text-rich"
export type MissCause = "firstRun" | "promptChanged" | "imagesChanged" | "modelChanged" | "retry" | "unknown"

export interface PageRow {
  pageId: string
  pageNumber: number
  textChars: number
  /** Images extraction produced on this page (page render excluded). */
  extractedImages: number
  /** Extracted images whose bytes already appeared on an earlier page. */
  duplicateImages: number
  pruned: number
  /** Images the meaningfulness model was asked about, from its last successful call. */
  sentToLlm: number
  meaningful: number
  notMeaningful: number
  meaningfulnessInputTokens: number
  meaningfulnessMs: number
}

export interface TaskStats {
  task: string
  model: string
  calls: number
  cacheHits: number
  misses: Record<MissCause, number>
  failures: number
  validationErrorRows: number
  inputTokens: number
  outputTokens: number
  avgDurationMs: number
  maxDurationMs: number
  /** Null when the model has no entry in the price table. */
  estimatedCostUsd: number | null
}

export interface ExtractReport {
  label: string
  schemaVersion: number | null
  schemaStatus: SchemaStatus
  staleLockDir: boolean
  /** Effective settings that shape Extract, from the global and book config. */
  settings: { defaultModel: string; taskModels: Record<string, string>; imageFilters: Record<string, unknown>; figureExtractionMode: string | null; removeWatermarks: boolean | null } | null
  settingsError?: string
  pages: { count: number; withoutText: number; textProfile: TextProfile; charsMedian: number; charsP10: number; totalChars: number }
  images: { bySource: Record<string, number>; extracted: number; distinctHashes: number; duplicates: number; perPageMean: number; perPageMax: number; debug: Record<string, number> | null }
  filtering: { classified: number; pruned: number; byReason: Record<string, number>; sentToLlm: number; meaningful: number; notMeaningful: number; maxImagesPerCall: number; unreadablePages: number }
  /** Final verdict per image id from the meaningfulness model, for `--compare`. */
  verdicts: Record<string, boolean>
  steps: Array<{ step: string; status: string; message: string | null; error: string | null }>
  tasks: TaskStats[]
  pageRows: PageRow[]
  findings: string[]
  /** Set when the book could not be opened or read; deeper checks were skipped. */
  error?: string
}

const EXTRACT_STEPS: string[] = STAGE_BY_NAME.extract.steps.map((step) => step.name)
const EXTRACT_TASKS: string[] = STAGE_BY_NAME.extract.steps.filter((step) => step.modelDefault).map((step) => step.name)
const MISS_CAUSES: MissCause[] = ["firstRun", "promptChanged", "imagesChanged", "modelChanged", "retry", "unknown"]

const REASON_BUCKETS: Array<[RegExp, string]> = [
  [/^full-page render/, "full-page render"], [/shortest side/, "min_side"], [/longest side/, "max_side"], [/stddev/, "min_stddev"],
  [/^not meaningful/, "not meaningful"], [/^auto figure filter/, "auto figure filter"], [/^duplicate artwork/, "duplicate artwork"], [/^segmented/, "segmented"],
]

function nonWhitespace(text: string): number {
  return text.replace(/\s+/g, "").length
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function emptyMisses(): Record<MissCause, number> {
  return Object.fromEntries(MISS_CAUSES.map((cause) => [cause, 0])) as Record<MissCause, number>
}

function get(object: unknown, ...keys: string[]): unknown {
  let current = object
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function readSettings(label: string, booksDir: string, configPath: string | undefined, report: ExtractReport): void {
  try {
    const config: unknown = loadBookConfig(label, booksDir, configPath)
    const taskModels: Record<string, string> = {}
    for (const [task, key] of [["metadata", "metadata"], ["book-summary", "book_summary"], ["book-outline", "book_outline"], ["image-meaningfulness", "image_meaningfulness"], ["image-segmentation", "image_segmentation"], ["image-cropping", "image_cropping"]]) {
      const model = get(config, key, "model")
      if (typeof model === "string") taskModels[task] = model
    }
    const mode = get(config, "figure_extraction_mode")
    const watermarks = get(config, "remove_watermarks")
    report.settings = {
      defaultModel: String(get(config, "default_model") ?? ""), taskModels,
      imageFilters: (get(config, "image_filters") as Record<string, unknown> | undefined) ?? {},
      figureExtractionMode: typeof mode === "string" ? mode : null, removeWatermarks: typeof watermarks === "boolean" ? watermarks : null,
    }
  } catch (error) {
    report.settingsError = error instanceof Error ? error.message : String(error)
  }
}

interface ImageRow { image_id: string; page_id: string; hash: string; width: number; height: number; source: string; render_method: string | null }
interface LogRow { timestamp: string; step: string; item_id: string; success: number; data: string }

function imageParts(entry: LlmLogEntry): LlmLogImagePlaceholder[] {
  return entry.messages.flatMap((message) => message.content.filter((part): part is LlmLogImagePlaceholder => part.type === "image"))
}

function systemText(entry: LlmLogEntry): string {
  return entry.messages.filter((message) => message.role === "system").flatMap((message) => message.content.map((part) => (part.type === "text" ? part.text : ""))).join("\n")
}

function assistantVerdicts(entry: LlmLogEntry): Array<{ image_id: string; is_meaningful: boolean }> {
  const text = entry.messages.filter((message) => message.role === "assistant").flatMap((message) => message.content.map((part) => (part.type === "text" ? part.text : ""))).join("")
  try {
    const parsed = JSON.parse(text) as { images?: Array<{ image_id?: unknown; is_meaningful?: unknown }> }
    return (parsed.images ?? []).filter((image) => typeof image.image_id === "string" && typeof image.is_meaningful === "boolean") as Array<{ image_id: string; is_meaningful: boolean }>
  } catch {
    return []
  }
}

function attributeMiss(entry: LlmLogEntry, previous: LlmLogEntry | undefined): MissCause {
  if (entry.attempt > 0) return "retry"
  if (!previous) return "firstRun"
  if (previous.modelId !== entry.modelId) return "modelChanged"
  if (systemText(previous) !== systemText(entry)) return "promptChanged"
  const hashes = (log: LlmLogEntry) => imageParts(log).map((part) => part.hash).sort().join(",")
  if (hashes(previous) !== hashes(entry)) return "imagesChanged"
  return "unknown"
}

function readTasks(rows: LogRow[], report: ExtractReport): void {
  const byTask = new Map<string, { stats: TaskStats; durations: number[] }>()
  const previousByItem = new Map<string, LlmLogEntry>()
  for (const row of rows) {
    let entry: LlmLogEntry
    try { entry = JSON.parse(row.data) as LlmLogEntry } catch { continue }
    if (entry.skippedReason) continue
    const key = `${row.step}\u0000${entry.modelId}`
    let bucket = byTask.get(key)
    if (!bucket) {
      bucket = { stats: { task: row.step, model: entry.modelId, calls: 0, cacheHits: 0, misses: emptyMisses(), failures: 0, validationErrorRows: 0, inputTokens: 0, outputTokens: 0, avgDurationMs: 0, maxDurationMs: 0, estimatedCostUsd: null }, durations: [] }
      byTask.set(key, bucket)
    }
    const { stats } = bucket
    stats.calls++
    const itemKey = `${row.step}\u0000${row.item_id}`
    if (entry.cacheHit) stats.cacheHits++
    else stats.misses[attributeMiss(entry, previousByItem.get(itemKey))]++
    previousByItem.set(itemKey, entry)
    if (!entry.success || entry.error) stats.failures++
    if (entry.validationErrors?.length) stats.validationErrorRows++
    stats.inputTokens += entry.usage?.inputTokens ?? 0
    stats.outputTokens += entry.usage?.outputTokens ?? 0
    bucket.durations.push(entry.durationMs ?? 0)
    stats.maxDurationMs = Math.max(stats.maxDurationMs, entry.durationMs ?? 0)
  }
  report.tasks = [...byTask.values()].map(({ stats, durations }) => {
    stats.avgDurationMs = Math.round(durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length))
    stats.estimatedCostUsd = estimateCost(stats.model, { inputTokens: stats.inputTokens, outputTokens: stats.outputTokens })
    return stats
  }).sort((a, b) => EXTRACT_TASKS.indexOf(a.task) - EXTRACT_TASKS.indexOf(b.task) || a.model.localeCompare(b.model))
}

function reportOpenBook(db: BookDb, report: ExtractReport): void {
  const pages = db.all("SELECT page_id, page_number, text FROM pages ORDER BY page_number") as unknown as Array<{ page_id: string; page_number: number; text: string }>
  const images = db.all("SELECT image_id, page_id, hash, width, height, source, render_method FROM images ORDER BY page_id, image_id") as unknown as ImageRow[]
  const stepRuns = db.all("SELECT step, status, error, message FROM step_runs") as unknown as Array<{ step: string; status: string; error: string | null; message: string | null }>
  const placeholders = EXTRACT_TASKS.map(() => "?").join(", ")
  const logRows = db.all(`SELECT timestamp, step, item_id, success, data FROM llm_log WHERE step IN (${placeholders}) ORDER BY timestamp, id`, EXTRACT_TASKS) as unknown as LogRow[]

  report.steps = EXTRACT_STEPS.map((step) => {
    const run = stepRuns.find((candidate) => candidate.step === step)
    return { step, status: run?.status ?? "idle", message: run?.message ?? null, error: run?.error ?? null }
  })

  // Pages and text layer.
  const chars = pages.map((page) => nonWhitespace(page.text))
  const sortedChars = [...chars].sort((a, b) => a - b)
  const withoutText = chars.filter((count) => count < MIN_TEXT_LAYER_CHARS).length
  const emptyRatio = pages.length ? withoutText / pages.length : 0
  report.pages = {
    count: pages.length, withoutText, textProfile: emptyRatio >= 0.8 ? "image-only" : emptyRatio >= 0.3 ? "weak" : "text-rich",
    charsMedian: percentile(sortedChars, 0.5), charsP10: percentile(sortedChars, 0.1), totalChars: chars.reduce((sum, value) => sum + value, 0),
  }

  // Images: what extraction produced, and how much of it repeats.
  const seenHashes = new Set<string>()
  const perPage = new Map<string, { extracted: number; duplicates: number }>(pages.map((page) => [page.page_id, { extracted: 0, duplicates: 0 }]))
  for (const image of images) {
    if (image.source === "page" || image.image_id.endsWith("_page")) continue
    const key = image.render_method ? `${image.source}/${image.render_method}` : image.source
    report.images.bySource[key] = (report.images.bySource[key] ?? 0) + 1
    if (image.source !== "extract") continue
    report.images.extracted++
    const counts = perPage.get(image.page_id) ?? { extracted: 0, duplicates: 0 }
    perPage.set(image.page_id, counts)
    counts.extracted++
    if (image.hash && seenHashes.has(image.hash)) { counts.duplicates++; report.images.duplicates++ }
    if (image.hash) seenHashes.add(image.hash)
  }
  report.images.distinctHashes = seenHashes.size
  const extractedCounts = [...perPage.values()].map((counts) => counts.extracted)
  report.images.perPageMean = pages.length ? Math.round((report.images.extracted / pages.length) * 10) / 10 : 0
  report.images.perPageMax = Math.max(0, ...extractedCounts)

  // Deterministic and model pruning, from the image-filtering node per page.
  const verdictByPage = new Map<string, { verdicts: Array<{ image_id: string; is_meaningful: boolean }>; sent: number; tokens: number; ms: number }>()
  for (const row of logRows) {
    if (row.step !== "image-meaningfulness" || !row.success) continue
    let entry: LlmLogEntry
    try { entry = JSON.parse(row.data) as LlmLogEntry } catch { continue }
    if (entry.skippedReason) continue
    // The bundled prompt sends the page render first, then one part per candidate.
    const sent = Math.max(0, imageParts(entry).length - 1)
    verdictByPage.set(row.item_id, { verdicts: assistantVerdicts(entry), sent, tokens: entry.usage?.inputTokens ?? 0, ms: entry.durationMs ?? 0 })
    report.filtering.maxImagesPerCall = Math.max(report.filtering.maxImagesPerCall, sent)
  }
  const debugSums: Record<string, number> = {}
  let debugPages = 0
  for (const page of pages) {
    const counts = perPage.get(page.page_id) ?? { extracted: 0, duplicates: 0 }
    const row: PageRow = { pageId: page.page_id, pageNumber: page.page_number, textChars: nonWhitespace(page.text), extractedImages: counts.extracted, duplicateImages: counts.duplicates, pruned: 0, sentToLlm: 0, meaningful: 0, notMeaningful: 0, meaningfulnessInputTokens: 0, meaningfulnessMs: 0 }
    const filtering = readCurrentNodeRow(db, "image-filtering", page.page_id)
    let parsed: ReturnType<typeof ImageClassificationOutput.safeParse> | null = null
    try { parsed = filtering ? ImageClassificationOutput.safeParse(JSON.parse(filtering.data)) : null } catch { /* counted below, not fatal */ }
    if (filtering && !parsed?.success) report.filtering.unreadablePages++
    if (parsed?.success) {
      for (const image of parsed.data.images) {
        report.filtering.classified++
        if (!image.isPruned) continue
        report.filtering.pruned++
        row.pruned++
        const bucket = REASON_BUCKETS.find(([pattern]) => pattern.test(image.reason ?? ""))?.[1] ?? "other"
        report.filtering.byReason[bucket] = (report.filtering.byReason[bucket] ?? 0) + 1
      }
    }
    const verdict = verdictByPage.get(page.page_id)
    if (verdict) {
      row.sentToLlm = verdict.sent
      row.meaningfulnessInputTokens = verdict.tokens
      row.meaningfulnessMs = verdict.ms
      for (const image of verdict.verdicts) {
        report.verdicts[image.image_id] = image.is_meaningful
        if (image.is_meaningful) row.meaningful++
        else row.notMeaningful++
      }
    }
    report.filtering.sentToLlm += row.sentToLlm
    report.filtering.meaningful += row.meaningful
    report.filtering.notMeaningful += row.notMeaningful
    report.pageRows.push(row)
    const debug = readCurrentNodeRow(db, "extraction-debug", page.page_id)
    if (debug) {
      try {
        const data = JSON.parse(debug.data) as Record<string, unknown>
        debugPages++
        for (const key of ["totalShapes", "backgroundsFiltered", "groupsBeforeMerge", "groupsAfterMerge", "textOnlyGroupsSkipped", "tooSmallGroupsSkipped"]) {
          if (typeof data[key] === "number") debugSums[key] = (debugSums[key] ?? 0) + (data[key] as number)
        }
      } catch { /* a malformed debug row is not a report finding */ }
    }
  }
  report.images.debug = debugPages ? debugSums : null

  readTasks(logRows, report)
  collectFindings(report)
}

function collectFindings(report: ExtractReport): void {
  const { pages, images, filtering, tasks, steps } = report
  if (pages.count && pages.textProfile !== "text-rich") {
    report.findings.push(`${pages.textProfile} source: ${pages.withoutText}/${pages.count} pages have no text layer, so metadata, book summary and book outline run without text`)
  }
  if (images.extracted && images.duplicates / images.extracted >= 0.1) {
    report.findings.push(`${images.duplicates} of ${images.extracted} extracted images are byte-identical copies of an image on another page`)
  }
  if (pages.totalChars > SUMMARY_INPUT_CHARS_LIMIT) {
    report.findings.push(`book-summary input is about ${pages.totalChars} characters in one call (limit ${SUMMARY_INPUT_CHARS_LIMIT})`)
  }
  for (const task of tasks) {
    const step = steps.find((candidate) => candidate.step === task.task)
    if (task.failures && step?.status === "done") report.findings.push(`${task.task} completed but ${task.failures} call(s) failed in the log`)
    if (task.misses.promptChanged) report.findings.push(`${task.misses.promptChanged} ${task.task} call(s) missed the cache because the prompt changed since the previous run`)
    if (task.misses.modelChanged) report.findings.push(`${task.misses.modelChanged} ${task.task} call(s) missed the cache because the model changed since the previous run`)
  }
  if (filtering.unreadablePages) report.findings.push(`${filtering.unreadablePages} page(s) have an image-filtering row that cannot be read; their pruning is not counted`)
  if (filtering.sentToLlm && filtering.notMeaningful / Math.max(1, filtering.meaningful + filtering.notMeaningful) >= 0.5) {
    report.findings.push(`the meaningfulness model rejected ${filtering.notMeaningful} of ${filtering.meaningful + filtering.notMeaningful} images it was sent`)
  }
}

function emptyReport(label: string): ExtractReport {
  return {
    label, schemaVersion: null, schemaStatus: "unreadable", staleLockDir: false, settings: null,
    pages: { count: 0, withoutText: 0, textProfile: "text-rich", charsMedian: 0, charsP10: 0, totalChars: 0 },
    images: { bySource: {}, extracted: 0, distinctHashes: 0, duplicates: 0, perPageMean: 0, perPageMax: 0, debug: null },
    filtering: { classified: 0, pruned: 0, byReason: {}, sentToLlm: 0, meaningful: 0, notMeaningful: 0, maxImagesPerCall: 0, unreadablePages: 0 },
    verdicts: {}, steps: [], tasks: [], pageRows: [], findings: [],
  }
}

/** Report one book. Never throws for a book problem; see `error`. */
export function reportExtract(booksDir: string, label: string, configPath?: string): ExtractReport {
  const { dbPath, schemaVersion, schemaStatus, staleLockDir, error } = inspectBookFile(booksDir, label)
  const report = { ...emptyReport(label), schemaVersion, schemaStatus, staleLockDir }
  if (error) report.error = error
  // An older book's tables may lack columns this report reads, and opening it
  // for real would migrate it; stay read-only and stop at the schema line.
  if (error || schemaStatus !== "current") return report
  readSettings(label, booksDir, configPath, report)
  let db: BookDb | undefined
  try {
    db = openBookDbReadOnly(dbPath)
    reportOpenBook(db, report)
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error)
  } finally {
    try { db?.close() } catch { /* best-effort */ }
  }
  return report
}

/** Report every `<label>/<label>.db` under a books directory, in name order. */
export function reportExtracts(booksDir: string, configPath?: string): ExtractReport[] {
  return listBookLabels(booksDir).map((label) => reportExtract(booksDir, label, configPath))
}

export function hasExtractFindings(report: ExtractReport): boolean {
  return !!report.error || report.staleLockDir || report.schemaStatus !== "current" || report.findings.length > 0
}

const usd = (value: number | null) => (value === null ? "unpriced" : `$${value.toFixed(2)}`)
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–")

export function formatExtractReport(report: ExtractReport): string {
  const head: string[] = []
  if (report.schemaVersion === null) head.push("schema unknown")
  else if (report.schemaStatus === "current") head.push(`schema ${report.schemaVersion}`)
  else head.push(`schema ${report.schemaVersion} (${report.schemaStatus} than this version's ${SCHEMA_VERSION}; skipped)`)
  if (!report.error && report.schemaStatus === "current") head.push(`${report.pages.count} pages`, report.pages.textProfile)
  if (report.error) head.push(`ERROR ${report.error}`)
  const lines = [`${report.label}: ${head.join(" · ")}`]
  if (report.error || report.schemaStatus !== "current") return lines.join("\n")
  const { settings, pages, images, filtering, tasks } = report
  if (settings) {
    const models = Object.entries(settings.taskModels).map(([task, model]) => `${task}=${model}`).join(", ")
    lines.push(`  settings: default_model ${settings.defaultModel}${models ? `; ${models}` : ""}; image_filters ${JSON.stringify(settings.imageFilters)}${settings.figureExtractionMode ? `; figures ${settings.figureExtractionMode}` : ""}${settings.removeWatermarks ? "; watermark removal on" : ""}`)
  } else if (report.settingsError) lines.push(`  settings: not loaded (${report.settingsError})`)
  lines.push(`  text layer: ${pages.count - pages.withoutText}/${pages.count} pages with text; chars/page median ${pages.charsMedian}, p10 ${pages.charsP10}; total ${pages.totalChars}`)
  const sources = Object.entries(images.bySource).sort().map(([key, count]) => `${key} ${count}`).join(", ")
  lines.push(`  images: ${images.extracted} extracted (${images.distinctHashes} distinct, ${images.duplicates} duplicates); per page mean ${images.perPageMean}, max ${images.perPageMax}${sources ? `; ${sources}` : ""}`)
  if (images.debug) lines.push(`  vector grouping: ${Object.entries(images.debug).map(([key, value]) => `${key} ${value}`).join(", ")}`)
  const reasons = Object.entries(filtering.byReason).sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key} ${count}`).join(", ")
  lines.push(`  filtering: ${filtering.pruned}/${filtering.classified} pruned${reasons ? ` (${reasons})` : ""}; sent to model ${filtering.sentToLlm} (max ${filtering.maxImagesPerCall} per call); meaningful ${filtering.meaningful}, not ${filtering.notMeaningful}`)
  for (const step of report.steps) {
    if (step.status === "idle" && !step.error) continue
    lines.push(`  step ${step.step}: ${step.status}${step.message ? ` — ${step.message}` : ""}${step.error ? ` — ${step.error}` : ""}`)
  }
  for (const task of tasks) {
    const misses = MISS_CAUSES.filter((cause) => task.misses[cause]).map((cause) => `${cause} ${task.misses[cause]}`).join(", ")
    lines.push(`  ${task.task} (${task.model}): ${task.calls} calls, ${task.cacheHits} cached (${pct(task.cacheHits, task.calls)})${misses ? `, misses: ${misses}` : ""}; ${task.failures} failed, ${task.validationErrorRows} with validation errors; ${task.inputTokens} in / ${task.outputTokens} out tokens; avg ${(task.avgDurationMs / 1000).toFixed(1)}s, max ${(task.maxDurationMs / 1000).toFixed(1)}s; ${usd(task.estimatedCostUsd)}`)
  }
  const priced = tasks.filter((task) => task.estimatedCostUsd !== null)
  if (priced.length) lines.push(`  estimated Extract cost: ${usd(priced.reduce((sum, task) => sum + (task.estimatedCostUsd ?? 0), 0))}${priced.length < tasks.length ? ` (+ ${tasks.length - priced.length} unpriced task(s))` : ""}`)
  for (const finding of report.findings) lines.push(`  ! ${finding}`)
  if (!hasExtractFindings(report)) lines[0] += " · no findings"
  return lines.join("\n")
}

export interface ExtractReportDiff {
  labels: [string, string]
  /** Numeric metrics that differ, as dotted paths. */
  deltas: Array<{ metric: string; a: number; b: number; delta: number }>
  /** Images whose meaningfulness verdict changed between the two reports. */
  verdictFlips: Array<{ imageId: string; a: boolean; b: boolean }>
}

function numericLeaves(value: unknown, prefix: string, into: Map<string, number>): void {
  if (typeof value === "number") { into.set(prefix, value); return }
  if (!value || typeof value !== "object") return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) numericLeaves(child, prefix ? `${prefix}.${key}` : key, into)
}

/** Compare two reports of the same PDF: every numeric metric that moved, and every verdict that flipped. */
export function diffExtractReports(a: ExtractReport, b: ExtractReport): ExtractReportDiff {
  const leaves = (report: ExtractReport) => {
    const into = new Map<string, number>()
    numericLeaves({ pages: report.pages, images: report.images, filtering: report.filtering }, "", into)
    for (const task of report.tasks) numericLeaves(task, `tasks.${task.task}[${task.model}]`, into)
    return into
  }
  const left = leaves(a)
  const right = leaves(b)
  const deltas: ExtractReportDiff["deltas"] = []
  for (const metric of new Set([...left.keys(), ...right.keys()])) {
    const valueA = left.get(metric) ?? 0
    const valueB = right.get(metric) ?? 0
    if (valueA !== valueB) deltas.push({ metric, a: valueA, b: valueB, delta: valueB - valueA })
  }
  const verdictFlips: ExtractReportDiff["verdictFlips"] = []
  for (const [imageId, verdictA] of Object.entries(a.verdicts)) {
    const verdictB = b.verdicts[imageId]
    if (verdictB !== undefined && verdictB !== verdictA) verdictFlips.push({ imageId, a: verdictA, b: verdictB })
  }
  return { labels: [a.label, b.label], deltas: deltas.sort((x, y) => x.metric.localeCompare(y.metric)), verdictFlips: verdictFlips.sort((x, y) => x.imageId.localeCompare(y.imageId)) }
}

export function formatExtractReportDiff(diff: ExtractReportDiff): string {
  const lines = [`${diff.labels[0]} → ${diff.labels[1]}: ${diff.deltas.length} metric(s) changed, ${diff.verdictFlips.length} verdict flip(s)`]
  for (const delta of diff.deltas) lines.push(`  ${delta.metric}: ${delta.a} → ${delta.b} (${delta.delta > 0 ? "+" : ""}${Math.round(delta.delta * 100) / 100})`)
  for (const flip of diff.verdictFlips.slice(0, 50)) lines.push(`  verdict ${flip.imageId}: ${flip.a ? "meaningful" : "not meaningful"} → ${flip.b ? "meaningful" : "not meaningful"}`)
  if (diff.verdictFlips.length > 50) lines.push(`  … ${diff.verdictFlips.length - 50} more flips`)
  return lines.join("\n")
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per page (`pages`) or per task and model (`tasks`), with a header. */
export function extractReportCsv(reports: ExtractReport[], kind: "pages" | "tasks"): string {
  const rows: unknown[][] = []
  if (kind === "pages") {
    rows.push(["label", "pageId", "pageNumber", "textChars", "extractedImages", "duplicateImages", "pruned", "sentToLlm", "meaningful", "notMeaningful", "meaningfulnessInputTokens", "meaningfulnessMs"])
    for (const report of reports) for (const page of report.pageRows) rows.push([report.label, page.pageId, page.pageNumber, page.textChars, page.extractedImages, page.duplicateImages, page.pruned, page.sentToLlm, page.meaningful, page.notMeaningful, page.meaningfulnessInputTokens, page.meaningfulnessMs])
  } else {
    rows.push(["label", "task", "model", "calls", "cacheHits", ...MISS_CAUSES.map((cause) => `miss_${cause}`), "failures", "validationErrorRows", "inputTokens", "outputTokens", "avgDurationMs", "maxDurationMs", "estimatedCostUsd"])
    for (const report of reports) for (const task of report.tasks) rows.push([report.label, task.task, task.model, task.calls, task.cacheHits, ...MISS_CAUSES.map((cause) => task.misses[cause]), task.failures, task.validationErrorRows, task.inputTokens, task.outputTokens, task.avgDurationMs, task.maxDurationMs, task.estimatedCostUsd])
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n"
}
