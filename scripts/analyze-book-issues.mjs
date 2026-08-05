#!/usr/bin/env node
// Analyze a book's LLM issue log and produce a downloadable, itemized report.
//
// Reads the per-book SQLite DB (`llm_log` + `step_runs`) and classifies every
// failed / partially-failed LLM call by **task type**, **pipeline stage**, and
// **error category**. It also works out whether each failure was ultimately
// recovered on a retry (so you can tell wasted-retry noise apart from failures
// that actually blocked output).
//
// Outputs (into <book-dir>/issues-report/ by default):
//   <label>-issues-report.md    human-readable itemized report + remediation notes
//   <label>-issues.csv          one row per issue (matches the count you saw)
//   <label>-error-messages.csv  one row per individual error message (for pivoting)
//   <label>-issues.json         full structured data for tooling
//
// Usage:
//   node scripts/analyze-book-issues.mjs <book-dir | db-file | book-label> [--out <dir>]
//
// Examples:
//   node scripts/analyze-book-issues.mjs books/KISWAHILI-STD-5-MAB-DEC
//   node scripts/analyze-book-issues.mjs KISWAHILI-STD-5-MAB-DEC --out ./reports

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import path from "node:path"
import fs from "node:fs"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// ── Resolve workspace deps (node-sqlite3-wasm, @adt/types) from the monorepo ──
const requireFromApi = createRequire(path.join(REPO_ROOT, "apps/api/"))
const requireFromStorage = createRequire(path.join(REPO_ROOT, "packages/storage/"))

function loadSqlite() {
  for (const req of [requireFromStorage, requireFromApi, createRequire(import.meta.url)]) {
    try {
      return req("node-sqlite3-wasm")
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not resolve 'node-sqlite3-wasm'. Run `pnpm install` first.")
}

// Canonical step→stage map from the pipeline single-source-of-truth.
let STEP_TO_STAGE = {}
try {
  ;({ STEP_TO_STAGE } = requireFromApi("@adt/types"))
} catch {
  console.warn("[warn] @adt/types not resolvable; falling back to sub-task map only")
}

// LLM `taskType` labels that are sub-tasks of a step and don't appear in the
// StepName enum. These map back to their parent stage manually.
const SUBTASK_TO_STAGE = {
  "page-sectioning-refinement": "sectioning",
  "activity-rendering": "storyboard",
  "activity-answers": "storyboard",
  "visual-review": "storyboard",
  "font-assignment": "storyboard",
  "styleguide-generation": "storyboard",
}

function stageForTask(taskType) {
  return STEP_TO_STAGE[taskType] ?? SUBTASK_TO_STAGE[taskType] ?? "unknown"
}

// ── Error taxonomy — first match wins ─────────────────────────────────────────
// group: "infra" = transient (a retry usually fixes it); "output" = deterministic
// model-output problem that needs a prompt / validator / schema fix.
const CATEGORIES = [
  {
    id: "api-connectivity",
    group: "infra",
    transient: true,
    label: "API connection dropped / timed out",
    test: (m) =>
      /Cannot connect to API|EPIPE|ECONNRESET|other side closed|Connect Timeout|ERANGE|operation was aborted due to timeout|\bETIMEDOUT\b|socket hang up/i.test(
        m,
      ),
    remediation:
      "Transient network drops to the model provider. Tune retry backoff/jitter and attempt count, lower per-request concurrency, or enable HTTP keep-alive/pooling in packages/llm/src/client.ts. No content fix needed.",
  },
  {
    id: "text-missing-dataid",
    group: "output",
    transient: false,
    label: "Sectioning dropped required source text (missing data-id)",
    test: (m) => /Missing required text data-id/i.test(m),
    remediation:
      "The sectioning model omitted a required source text node. Strengthen the fidelity constraint in the page-sectioning prompt / refinement pass so every data-id from the skeleton is emitted verbatim.",
  },
  {
    id: "text-node-outside-dataid",
    group: "output",
    transient: false,
    label: "Text placed outside any data-id element",
    test: (m) => /Text node outside any data-id element/i.test(m),
    remediation:
      "Model emitted stray text not wrapped in a data-id element (often list markers, page headers/footers, punctuation). Tighten the sectioning prompt to attach every glyph to a node, or drop known boilerplate before validation.",
  },
  {
    id: "text-mismatch",
    group: "output",
    transient: false,
    label: "Text differs from source for a data-id",
    test: (m) => /Text mismatch for data-id/i.test(m),
    remediation:
      "Rendered text doesn't match the source for a data-id (truncation, dropped words, reordered prefixes). Reinforce verbatim-text rules; consider tolerating safe normalizations (whitespace, leading list numbers) in the validator.",
  },
  {
    id: "schema-invalid-value",
    group: "output",
    transient: false,
    label: "Structured output used a value outside the allowed enum",
    test: (m) => /invalid value|Must be one of/i.test(m),
    remediation:
      'Model produced a structure/role value not in the schema (e.g. "boxed_text"). Either add the value/synonym to the allowed enum + renderer, or constrain the prompt to the permitted set.',
  },
  {
    id: "schema-leaf-missing-text",
    group: "output",
    transient: false,
    label: "Leaf node missing required text",
    test: (m) => /leaf node with role .* must have/i.test(m),
    remediation:
      "A leaf/text node was emitted without its text payload. Tighten the structured-output schema/prompt so text leaves always carry content.",
  },
  {
    id: "schema-section-count",
    group: "output",
    transient: false,
    label: "Wrong number of <section> tags",
    test: (m) => /Expected exactly one <section> tag/i.test(m),
    remediation:
      "Render returned zero or multiple <section> roots. Constrain the render prompt to exactly one section, or merge/split in post-processing.",
  },
  {
    id: "activity-fitb-class",
    group: "output",
    transient: false,
    label: 'Fill-in-the-blank markup missing "fitb-sentence" class',
    test: (m) => /fitb-sentence/i.test(m),
    remediation:
      'Activity contains [[blank:…]] markers but the element/ancestor lacks the required "fitb-sentence" class. Add the class in the activity-rendering prompt or inject it in post-processing.',
  },
  {
    id: "activity-duplicate-item",
    group: "output",
    transient: false,
    label: "Duplicate data-activity-item id",
    test: (m) => /data-activity-item=.*appears/i.test(m),
    remediation:
      "Activity re-used an item id (item-1, item-2, …). Enforce unique item ids in the activity-rendering prompt or renumber duplicates in post-processing.",
  },
]

function classify(message) {
  if (!message) return { id: "empty", group: "other", transient: false, label: "(no message)" }
  const hit = CATEGORIES.find((c) => c.test(message))
  return hit ?? { id: "other", group: "other", transient: false, label: "Uncategorized" }
}

// ── CSV helper ────────────────────────────────────────────────────────────────
function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v)
  // Neutralize spreadsheet formula injection: a cell that opens with = + - @ (or
  // tab/CR) is executed as a formula by Excel/Sheets. Error-message columns carry
  // model/validator text derived from book content, so prefix such cells with a
  // quote to force text. Numeric columns are non-negative, so this never touches
  // legitimate values.
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}
function csvRow(cells) {
  return cells.map(csvCell).join(",")
}

// ── Arg parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { target: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--out" || a === "-o") args.out = argv[++i]
    else if (!args.target) args.target = a
  }
  return args
}

function resolveDbPath(target) {
  if (!target) {
    // Auto-pick: a single book dir under books/ with a matching .db
    const booksDir = path.join(REPO_ROOT, "books")
    if (fs.existsSync(booksDir)) {
      const candidates = fs
        .readdirSync(booksDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(booksDir, d.name, `${d.name}.db`))
        .filter((p) => fs.existsSync(p))
      if (candidates.length === 1) return candidates[0]
    }
    throw new Error(
      "No target given. Pass a book directory, a .db file, or a book label.\n" +
        "  node scripts/analyze-book-issues.mjs books/<label>",
    )
  }
  const asPath = path.resolve(target)
  if (fs.existsSync(asPath)) {
    const stat = fs.statSync(asPath)
    if (stat.isFile()) return asPath
    if (stat.isDirectory()) {
      const label = path.basename(asPath)
      const db = path.join(asPath, `${label}.db`)
      if (fs.existsSync(db)) return db
      const anyDb = fs.readdirSync(asPath).find((f) => f.endsWith(".db"))
      if (anyDb) return path.join(asPath, anyDb)
      throw new Error(`No .db file found in directory: ${asPath}`)
    }
  }
  // Treat as a bare label
  const byLabel = path.join(REPO_ROOT, "books", target, `${target}.db`)
  if (fs.existsSync(byLabel)) return byLabel
  throw new Error(`Could not resolve a DB from: ${target}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const { target, out } = parseArgs(process.argv.slice(2))
  const dbPath = resolveDbPath(target)
  const label = path.basename(dbPath).replace(/\.db$/, "")
  const bookDir = path.dirname(dbPath)
  const outDir = out ? path.resolve(out) : path.join(bookDir, "issues-report")

  const sqlite = loadSqlite()
  const db = new sqlite.Database(dbPath, { readOnly: true })

  const tableExists = (name) =>
    db.all("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]).length > 0
  if (!tableExists("llm_log")) {
    throw new Error(`DB ${dbPath} has no llm_log table — is this a book DB?`)
  }

  const allRows = db.all(
    "SELECT id, request_id, timestamp, step, item_id, success, error_count, data FROM llm_log ORDER BY id",
  )
  const stepRuns = tableExists("step_runs")
    ? db.all(
        "SELECT step, status, started_at, completed_at, error, message FROM step_runs ORDER BY started_at",
      )
    : []
  db.close()

  const totalCalls = allRows.length

  // Which (step,item) pairs eventually succeeded — used to flag recoveries.
  const succeeded = new Set()
  for (const r of allRows) if (r.success === 1) succeeded.add(`${r.step} ${r.item_id}`)

  // Build the issue list: every call that logged at least one error.
  const issues = []
  const messageRows = []
  for (const r of allRows) {
    if (!(r.error_count > 0)) continue
    let data = {}
    try {
      data = JSON.parse(r.data)
    } catch {
      /* leave empty */
    }
    const itemId = r.item_id || data.pageId || ""
    const stage = stageForTask(r.step)
    const recovered = succeeded.has(`${r.step} ${itemId}`)
    const messages = Array.isArray(data.validationErrors) && data.validationErrors.length
      ? data.validationErrors
      : [`(no message; errorCount=${r.error_count})`]

    const cats = messages.map(classify)
    const catIds = [...new Set(cats.map((c) => c.id))]
    const primary = cats[0]

    const issue = {
      id: r.id,
      requestId: r.request_id,
      timestamp: r.timestamp || data.timestamp || "",
      taskType: r.step,
      stage,
      itemId,
      model: data.modelId || "",
      attempt: data.attempt ?? "",
      durationMs: data.durationMs ?? "",
      // success=0 → the attempt hard-failed; success=1 → errors were tolerated
      // (e.g. some items in a batch failed but the call still returned).
      kind: r.success === 0 ? "hard-fail" : "tolerated",
      recovered,
      errorCount: r.error_count,
      primaryCategory: primary.id,
      categories: catIds,
      messages,
    }
    issues.push(issue)

    for (const m of messages) {
      const c = classify(m)
      messageRows.push({
        issueId: r.id,
        taskType: r.step,
        stage,
        itemId,
        kind: issue.kind,
        recovered,
        category: c.id,
        group: c.group,
        transient: c.transient,
        message: m,
      })
    }
  }

  // ── Aggregations ──────────────────────────────────────────────────────────
  const tally = (arr, keyFn) => {
    const m = new Map()
    for (const x of arr) {
      const k = keyFn(x)
      m.set(k, (m.get(k) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }

  const byTask = new Map()
  for (const it of issues) {
    const e = byTask.get(it.taskType) || { stage: it.stage, total: 0, hard: 0, tolerated: 0 }
    e.total++
    if (it.kind === "hard-fail") e.hard++
    else e.tolerated++
    byTask.set(it.taskType, e)
  }
  const byTaskSorted = [...byTask.entries()].sort((a, b) => b[1].total - a[1].total)

  // Category breakdown counts individual messages (a truer "what is failing").
  const catAgg = new Map()
  for (const mr of messageRows) {
    const e = catAgg.get(mr.category) || {
      group: mr.group,
      transient: mr.transient,
      count: 0,
      example: mr.message,
    }
    e.count++
    catAgg.set(mr.category, e)
  }
  const catSorted = [...catAgg.entries()].sort((a, b) => b[1].count - a[1].count)

  const catMeta = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))
  const groupCount = { infra: 0, output: 0, other: 0 }
  for (const mr of messageRows) groupCount[mr.group] = (groupCount[mr.group] || 0) + 1

  const stageAgg = tally(issues, (it) => it.stage)

  const hardFail = issues.filter((i) => i.kind === "hard-fail").length
  const tolerated = issues.filter((i) => i.kind === "tolerated").length
  const unrecovered = issues.filter((i) => !i.recovered)
  const unrecoveredUnits = new Set(unrecovered.map((i) => `${i.taskType} ${i.itemId}`))

  // ── Write outputs ───────────────────────────────────────────────────────────
  fs.mkdirSync(outDir, { recursive: true })
  const generatedAt = new Date().toISOString()

  // 1) per-issue CSV
  const issuesCsv = [
    csvRow([
      "id",
      "stage",
      "task_type",
      "item",
      "kind",
      "recovered",
      "primary_category",
      "all_categories",
      "error_count",
      "attempt",
      "model",
      "duration_ms",
      "timestamp",
      "request_id",
      "error_messages",
    ]),
    ...issues.map((it) =>
      csvRow([
        it.id,
        it.stage,
        it.taskType,
        it.itemId,
        it.kind,
        it.recovered ? "yes" : "no",
        it.primaryCategory,
        it.categories.join("; "),
        it.errorCount,
        it.attempt,
        it.model,
        it.durationMs,
        it.timestamp,
        it.requestId,
        it.messages.join(" | "),
      ]),
    ),
  ].join("\n")

  // 2) per-message CSV
  const messagesCsv = [
    csvRow([
      "issue_id",
      "stage",
      "task_type",
      "item",
      "kind",
      "recovered",
      "category",
      "group",
      "transient",
      "message",
    ]),
    ...messageRows.map((m) =>
      csvRow([
        m.issueId,
        m.stage,
        m.taskType,
        m.itemId,
        m.kind,
        m.recovered ? "yes" : "no",
        m.category,
        m.group,
        m.transient ? "yes" : "no",
        m.message,
      ]),
    ),
  ].join("\n")

  // 3) Markdown report
  const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "0%")
  const md = []
  md.push(`# Issue report — ${label}`)
  md.push("")
  md.push(`- **Generated:** ${generatedAt}`)
  md.push(`- **Database:** \`${dbPath}\``)
  md.push(`- **Total LLM calls logged:** ${totalCalls}`)
  md.push(
    `- **Issues (calls with ≥1 error):** ${issues.length}  ·  ${messageRows.length} individual error messages`,
  )
  md.push(
    `- **Hard failures (attempt failed):** ${hardFail}  ·  **Tolerated (partial errors, call still returned):** ${tolerated}`,
  )
  md.push(
    `- **Recovered on retry:** ${issues.length - unrecovered.length} / ${issues.length}  ·  **Unrecovered (no later success for that task+item):** ${unrecovered.length}` +
      (unrecovered.length ? ` (${unrecoveredUnits.size} distinct task+item units)` : ""),
  )
  md.push("")
  if (unrecovered.length === 0 && issues.length > 0) {
    md.push(
      "> ✅ **Every issue was recovered on a later attempt** — none blocked output. These are wasted-retry noise: they cost time/tokens but the run still completed. Prioritise fixes by _volume_ and _category_ below to cut retry cost and latency.",
    )
    md.push("")
  }

  md.push("## Issues by task type")
  md.push("")
  md.push("| Task type | Stage | Issues | Hard-fail | Tolerated |")
  md.push("|---|---|--:|--:|--:|")
  for (const [task, e] of byTaskSorted) {
    md.push(`| \`${task}\` | ${e.stage} | ${e.total} | ${e.hard} | ${e.tolerated} |`)
  }
  md.push("")

  md.push("## Issues by stage")
  md.push("")
  md.push("| Stage | Issues |")
  md.push("|---|--:|")
  for (const [stage, n] of stageAgg) md.push(`| ${stage} | ${n} |`)
  md.push("")

  md.push("## What is failing — by error category")
  md.push("")
  md.push(
    `Infrastructure/transient: **${groupCount.infra || 0}** messages · Model-output/deterministic: **${groupCount.output || 0}** · Other: **${groupCount.other || 0}** (of ${messageRows.length}).`,
  )
  md.push("")
  md.push("| Category | Group | Transient | Messages | % | Example |")
  md.push("|---|---|:-:|--:|--:|---|")
  for (const [id, e] of catSorted) {
    const meta = catMeta[id]
    const cLabel = meta?.label ?? id
    const ex = e.example.replace(/\|/g, "\\|").slice(0, 90)
    md.push(
      `| **${id}**<br/>${cLabel} | ${e.group} | ${e.transient ? "yes" : "no"} | ${e.count} | ${pct(e.count, messageRows.length)} | ${ex} |`,
    )
  }
  md.push("")

  md.push("## Suggested remediation")
  md.push("")
  for (const [id, e] of catSorted) {
    const meta = catMeta[id]
    if (!meta?.remediation) continue
    md.push(`### \`${id}\` — ${meta.label}  (${e.count} messages, ${meta.group})`)
    md.push("")
    md.push(meta.remediation)
    md.push("")
  }

  md.push("## Pipeline step status (`step_runs`)")
  md.push("")
  if (stepRuns.length) {
    md.push("| Step | Status | Error | Message |")
    md.push("|---|---|---|---|")
    for (const s of stepRuns) {
      const err = (s.error || "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 80)
      const msg = (s.message || "").replace(/\|/g, "\\|").slice(0, 40)
      md.push(`| \`${s.step}\` | ${s.status} | ${err} | ${msg} |`)
    }
  } else {
    md.push("_No step_runs table._")
  }
  md.push("")

  md.push("## Files")
  md.push("")
  md.push(`- \`${label}-issues.csv\` — one row per issue (${issues.length})`)
  md.push(`- \`${label}-error-messages.csv\` — one row per error message (${messageRows.length})`)
  md.push(`- \`${label}-issues.json\` — full structured data`)
  md.push("")

  const json = {
    label,
    dbPath,
    generatedAt,
    totals: {
      totalCalls,
      issues: issues.length,
      errorMessages: messageRows.length,
      hardFail,
      tolerated,
      recovered: issues.length - unrecovered.length,
      unrecovered: unrecovered.length,
      byGroup: groupCount,
    },
    byTaskType: Object.fromEntries(byTaskSorted.map(([k, v]) => [k, v])),
    byStage: Object.fromEntries(stageAgg),
    byCategory: Object.fromEntries(
      catSorted.map(([k, v]) => [k, { group: v.group, transient: v.transient, count: v.count }]),
    ),
    stepRuns,
    issues,
  }

  const files = {
    md: path.join(outDir, `${label}-issues-report.md`),
    issuesCsv: path.join(outDir, `${label}-issues.csv`),
    messagesCsv: path.join(outDir, `${label}-error-messages.csv`),
    json: path.join(outDir, `${label}-issues.json`),
  }
  fs.writeFileSync(files.md, md.join("\n"))
  fs.writeFileSync(files.issuesCsv, issuesCsv)
  fs.writeFileSync(files.messagesCsv, messagesCsv)
  fs.writeFileSync(files.json, JSON.stringify(json, null, 2))

  // ── Console summary ─────────────────────────────────────────────────────────
  console.log(`\n📕 ${label}`)
  console.log(`   ${totalCalls} LLM calls · ${issues.length} issues · ${messageRows.length} error messages`)
  console.log(`   ${hardFail} hard-fail · ${tolerated} tolerated · ${unrecovered.length} unrecovered`)
  console.log(
    `   infra/transient: ${groupCount.infra || 0} · model-output: ${groupCount.output || 0} · other: ${groupCount.other || 0}`,
  )
  console.log("\n   Top categories:")
  for (const [id, e] of catSorted.slice(0, 8)) console.log(`     ${String(e.count).padStart(4)}  ${id}`)
  console.log("\n   Wrote:")
  for (const f of Object.values(files)) console.log(`     ${f}`)
  console.log("")
}

main()
