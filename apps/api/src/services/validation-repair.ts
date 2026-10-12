import path from "node:path"
import { HTTPException } from "hono/http-exception"
import { AccessibilityAssessmentOutput, ReviewerValidationSession, ReviewerPageValidationRecord,
  type ValidationRepairAvailability, type ValidationRepairTarget, type ValidationRepairRequest,
  type ValidationArtifactSnapshot, type AppConfig } from "@adt/types"
import { type Storage } from "@adt/storage"
import { assertSectioningCurrent, inputSignature, readValidationArtifact } from "@adt/pipeline"
import { storedSynchronization, synchronizationLayout } from "./storyboard-save.js"
import { assertEditVersion } from "./catalog-output-service.js"

/** Resolve persisted evidence first. Text matching and client-origin flags
 * cannot authorize replacement; common generated proof is checked separately. */
export function validationRepairAvailability(storage: Storage, pageId: string, target: ValidationRepairTarget, config: AppConfig): ValidationRepairAvailability {
  const finding = target.finding
  let artifact: ValidationArtifactSnapshot | undefined
  if (finding.kind === "reviewer") {
    const row = storage.getLatestNodeData("reviewer-page-validation", finding.recordItemId)
    if (row?.version !== finding.recordVersion) return { available: false, reason: "historical" }
    const record = ReviewerPageValidationRecord.safeParse(row.data)
    const session = ReviewerValidationSession.safeParse(storage.getLatestNodeData("reviewer-validation-session", finding.sessionId)?.data)
    if (!record.success || !session.success || record.data.session_id !== finding.sessionId
      || !record.data.results.some((result) => result.criterion_id === finding.criterionId && result.status === "needs-changes")) return { available: false, reason: "unproven" }
    artifact = record.data.artifact
    const sections = artifact?.sections.filter((section) => section.sectionId === target.sectionId && section.href === record.data.href)
    if (sections?.length !== 1 || (record.data.section_id && record.data.section_id !== target.sectionId)) return { available: false, reason: "unproven" }
  } else {
    const row = storage.getLatestNodeData("accessibility-assessment", "book")
    if (row?.version !== finding.assessmentVersion) return { available: false, reason: "historical" }
    const assessment = AccessibilityAssessmentOutput.safeParse(row.data)
    if (!assessment.success || !assessment.data.pages.some((page) => page.sectionId === target.sectionId
      && page[finding.kind === "violation" ? "violations" : "incomplete"].some((rule) => rule.id === finding.ruleId))) return { available: false, reason: "unproven" }
    artifact = assessment.data.artifact
  }
  if (artifact?.id && readValidationArtifact(path.join(storage.bookDir!, "adt"))?.id !== artifact.id) return { available: false, reason: "historical" }
  const matches = artifact?.sections.filter((section) => section.sectionId === target.sectionId && section.pageId === pageId)
  if (matches?.length !== 1) return { available: false, reason: "unproven" }
  const snapshot = matches[0]
  const source = storage.getLatestNodeData("page-sectioning", pageId), rendering = storage.getLatestNodeData("web-rendering", pageId)
  if (source?.version !== snapshot.sourceVersion || rendering?.version !== snapshot.renderingVersion
    || inputSignature(source.data) !== snapshot.sourceHash || inputSignature(rendering.data) !== snapshot.renderingHash) return { available: false, reason: "historical" }
  if (!storage.getPages().some((page) => page.pageId === pageId)) return { available: false, reason: "unavailable" }
  const layout = synchronizationLayout(storage, pageId, config)
  if (layout !== "reflowable") return { available: false, reason: "unsupported" }
  const sync = storedSynchronization(storage, pageId, layout, undefined, "validation")
  if (sync.sections.filter((section) => section.sectionId === target.sectionId && section.action === "repair").length !== 1) return { available: false, reason: "protected" }
  try { assertSectioningCurrent(storage, config, storage.bookDir!) }
  catch { return { available: false, reason: "unavailable" } }
  return { available: true, reason: "ready", pageId, baseVersion: source.version, renderingVersion: rendering.version }
}

export function assertValidationRepair(storage: Storage, pageId: string, request: ValidationRepairRequest, config: AppConfig): void {
  assertEditVersion(storage.getLatestNodeData("page-sectioning", pageId)?.version, request.baseVersion)
  assertEditVersion(storage.getLatestNodeData("web-rendering", pageId)?.version, request.renderingVersion)
  if (storage.getStepRuns().some((run) => run.status === "running")) throw new HTTPException(409, { message: "Wait for active work before rerendering. The finding and previous output are retained." })
  const state = validationRepairAvailability(storage, pageId, request, config)
  if (!state.available) throw new HTTPException(409, { message: `Rerender unavailable (${state.reason}). Refresh current evidence or open the editor. No finding was resolved.` })
}
