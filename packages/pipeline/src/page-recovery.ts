import { OUTPUT_KIND_STEP, STEP_TO_STAGE, getStageDependents, type OutputStatus, type PageRecoverySummary, type StepName } from "@adt/types"

/** Apply durable unresolved page failures to the existing freshness read model.
 * It never invents filtering, removes a source identity or certifies old output. */
export function qualifyPageRecovery(statuses: OutputStatus[], errors: PageRecoverySummary[]): OutputStatus[] {
  return statuses.map((status) => {
    const stage = STEP_TO_STAGE[OUTPUT_KIND_STEP[status.identity.kind]]
    const pageErrors = errors.filter((error) => {
      const source = STEP_TO_STAGE[error.step as StepName]
      return source && (source === stage || getStageDependents(source).includes(stage)) &&
        (status.identity.id === "book" || status.pageIds?.includes(error.pageId))
    })
    return pageErrors.length ? { ...status, current: false, pageErrors,
      warnings: [...status.warnings, { reason: "upstream" as const }] } : status
  })
}
