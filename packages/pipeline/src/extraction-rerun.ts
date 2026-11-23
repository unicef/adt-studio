import fs from "node:fs"
import path from "node:path"
import { PIPELINE, type ExtractRerunAction, type ExtractRerunBlockedReason, type ExtractRerunStatus } from "@adt/types"
import { ExtractionAdmissionError, getStorageBookDir, readExtractionManifest, type ExtractOnlyInspection, type Storage } from "@adt/storage"

/** `none`: no extraction.json (a book never extracted, or extracted before the
 * record existed). `unreadable`: the file exists and does not parse. */
export type ExtractionRecordState = "none" | "complete" | "failed" | "extracting" | "unreadable"

export interface ExtractRerunInput {
  inspection: ExtractOnlyInspection
  record: ExtractionRecordState
  /** The record's attempt; null when there is none or it is unreadable. */
  attemptId: string | null
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
  const { attemptId } = input
  const none = (blockedReason: ExtractRerunBlockedReason | null): ExtractRerunStatus => ({ actions: [], attemptId, blockedReason })
  if (input.runActive) return none("run-active")
  if (!input.inspection.extractOnly) return none(input.inspection.reason)
  // A failed, cancelled, interrupted or unreadable extraction keeps nothing usable.
  if (input.record !== "complete" && input.record !== "none") return { actions: ["retry"], attemptId, blockedReason: null }
  // No pages and no record is a first extraction, which needs no re-run action.
  if (input.pageCount === 0) return none(input.record === "complete" ? "extraction-inconsistent" : null)
  const statuses = new Map(input.stepRuns.map((run) => [run.step, run.status]))
  const pending = EXTRACT_STEPS.some((step) => !["done", "skipped"].includes(statuses.get(step) ?? "idle"))
  // A part's page window is fixed and its extraction must stay mergeable.
  const actions: ExtractRerunAction[] = [...(pending ? ["resume" as const] : []), ...(input.isPart ? [] : ["replace" as const])]
  return actions.length ? { actions, attemptId, blockedReason: null } : none("part-book")
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
  if (runActive) return { actions: [], attemptId, blockedReason: "run-active" }
  return decideExtractRerun({
    inspection: storage.inspectExtractOnly?.() ?? { extractOnly: false, reason: "unrecognized-content", detail: "storage:uninspectable" },
    record, attemptId, runActive,
    pageCount: storage.getPages().length,
    stepRuns: storage.getStepRuns(),
    isPart: fs.existsSync(path.join(bookDir, "part.json")),
  })
}
