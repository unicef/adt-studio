import fs from "node:fs"
import path from "node:path"
import { PIPELINE, type ExtractRerunAction, type ExtractRerunBlockedReason, type ExtractRerunRequest, type ExtractRerunStatus } from "@adt/types"
import { ExtractionAdmissionError, getStorageBookDir, readExtractionManifest, type ExtractOnlyInspection, type Storage } from "@adt/storage"

/** `none`: no extraction.json (a book never extracted, or extracted before the
 * record existed). `unreadable`: the file exists and does not parse. */
export type ExtractionRecordState = "none" | "complete" | "failed" | "extracting" | "unreadable"

export interface ExtractRerunInput {
  inspection: ExtractOnlyInspection
  record: ExtractionRecordState
  /** The record's attempt; null when there is none or it is unreadable. */
  attemptId: string | null
  /** Digest of the content a retry or replace discards; null when the book is
   * not Extract-only or the content could not be read. */
  contentToken: string | null
  pageCount: number
  /** Rows of step_runs; steps of other stages are ignored. */
  stepRuns: ReadonlyArray<{ step: string; status: string }>
  isPart: boolean
  /** A stage run is active or queued for this book. */
  runActive: boolean
}

const EXTRACT_STEPS = PIPELINE.find((stage) => stage.name === "extract")!.steps.map((step) => step.name)

/** SPEC-0003 RAC-21–24: which of resume, retry and replace a Studio/API Extract
 * run may perform on this book, and the reason when none. Pure; the run request
 * that acts on the answer re-checks it under the writer lease. */
export function decideExtractRerun(input: ExtractRerunInput): ExtractRerunStatus {
  const { attemptId, contentToken } = input
  const none = (blockedReason: ExtractRerunBlockedReason | null): ExtractRerunStatus => ({ actions: [], attemptId, contentToken: null, blockedReason })
  /** Retry and replace discard content, so each is offered only with the token
   * its request must carry; resume discards nothing and needs none. */
  const offer = (wanted: ExtractRerunAction[], whenNone: ExtractRerunBlockedReason): ExtractRerunStatus => {
    const actions = wanted.filter((action) => action === "resume" || contentToken !== null)
    if (!actions.length) return none(wanted.length ? "unrecognized-content" : whenNone)
    return { actions, attemptId, contentToken: actions.some((action) => action !== "resume") ? contentToken : null, blockedReason: null }
  }
  if (input.runActive) return none("run-active")
  if (!input.inspection.extractOnly) return none(input.inspection.reason)
  // A failed, cancelled, interrupted or unreadable extraction keeps nothing usable.
  if (input.record !== "complete" && input.record !== "none") return offer(["retry"], "unrecognized-content")
  // No pages and no record is a first extraction, which needs no re-run action.
  if (input.pageCount === 0) return none(input.record === "complete" ? "extraction-inconsistent" : null)
  const statuses = new Map(input.stepRuns.map((run) => [run.step, run.status]))
  const pending = EXTRACT_STEPS.some((step) => !["done", "skipped"].includes(statuses.get(step) ?? "idle"))
  // A part's page window is fixed and its extraction must stay mergeable.
  return offer([...(pending ? ["resume" as const] : []), ...(input.isPart ? [] : ["replace" as const])], "part-book")
}

/** Gather the inputs from an open book and decide. Reads only: no writer lease,
 * no migration beyond what opening the storage already did. */
export function readExtractRerunStatus(storage: Storage, runActive: boolean): ExtractRerunStatus {
  const bookDir = getStorageBookDir(storage)
  let record: ExtractionRecordState = "unreadable"
  let attemptId: string | null = null
  try {
    const manifest = readExtractionManifest(bookDir)
    record = manifest?.status ?? "none"
    attemptId = manifest?.attemptId ?? null
  } catch (error) {
    if (!(error instanceof ExtractionAdmissionError)) throw error
  }
  // Status is polled throughout a run, when the answer cannot change: skip
  // the directory and table scan. decideExtractRerun applies the same rule.
  if (runActive) return { actions: [], attemptId, contentToken: null, blockedReason: "run-active" }
  const inspection = storage.inspectExtractOnly?.() ?? { extractOnly: false as const, reason: "unrecognized-content" as const, detail: "storage:uninspectable" }
  return decideExtractRerun({
    inspection, record, attemptId, runActive,
    contentToken: inspection.extractOnly ? storage.readExtractContentToken?.() ?? null : null,
    pageCount: storage.getPages().length,
    stepRuns: storage.getStepRuns(),
    isPart: fs.existsSync(path.join(bookDir, "part.json")),
  })
}

/** Blocked reasons of a book that is Extract-only and offers no action. Every
 * other reason, including one added later, means the book is not Extract-only. */
const EXTRACT_ONLY_REASONS: ReadonlySet<ExtractRerunBlockedReason | null> = new Set([null, "part-book", "extraction-inconsistent"])

/** SPEC-0003 RAC-21 admission of a resume request, re-checked under the writer
 * lease by every caller. False: the book is not Extract-only, and the caller
 * keeps today's refusal. Throws before any write when the book is Extract-only
 * and the request no longer matches it. */
export function admitExtractResume(storage: Storage, request: ExtractRerunRequest): boolean {
  const status = readExtractRerunStatus(storage, false)
  if (!status.actions.length && !EXTRACT_ONLY_REASONS.has(status.blockedReason)) return false
  if (!status.actions.includes("resume") || status.attemptId !== request.attemptId) throw new ExtractionAdmissionError("EXTRACTION_RERUN_STALE")
  return true
}
