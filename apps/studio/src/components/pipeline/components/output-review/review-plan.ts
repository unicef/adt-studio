import { OUTPUT_KIND_TO_STAGE, STAGE_ORDER, type OutputIdentity, type OutputStatus } from "@adt/types"

export const identityKey = (identity: OutputIdentity) =>
  JSON.stringify([identity.kind, identity.id, identity.language, identity.voiceSlot])

export const needsAttention = (output: OutputStatus) =>
  !output.excluded && (output.updateNeeded || output.missing || output.warnings.length > 0)

export const hasFallback = (output: OutputStatus) => output.identity.kind === "preparation" &&
  output.warnings.some((warning) => !warning.source && warning.reason.startsWith("preparation-"))

export const outputLocationCount = (output: OutputStatus) =>
  new Set(output.locations?.map((location) => JSON.stringify([location.pageId, location.sectionId]))).size ||
  Math.max(output.pageIds.length, output.sectionIds.length)

export const hasOutputConflict = (output: OutputStatus) =>
  output.warnings.some((warning) => warning.reason === "output-conflict")

export const reviewGuard = (output: OutputStatus) => ({
  identity: output.identity, signature: output.signature, contentHash: output.contentHash,
})

/** Resolve inherited warnings at their source, once even when many rows share it.
 * Dependents remain selected so the runner can recheck them after a source update.
 * This plans explicit UI actions; the server remains authoritative about freshness. */
export function buildReviewPlan(selected: OutputStatus[], catalog: OutputStatus[]) {
  const index = new Map(catalog.map((output) => [identityKey(output.identity), output]))
  const closure = new Map<string, OutputStatus>()
  function visit(output: OutputStatus) {
    const key = identityKey(output.identity)
    if (output.excluded || closure.has(key)) return
    closure.set(key, output)
    for (const warning of output.warnings) {
      const source = warning.source && index.get(identityKey(warning.source))
      if (source) visit(source)
    }
  }
  selected.filter(needsAttention).forEach(visit)
  const outputs = [...closure.values()]
  const keep = outputs.filter((output) => output.usable && !hasOutputConflict(output) && (
    output.protected && output.warnings.some((warning) => !warning.source && warning.reason !== "source-conflict" && warning.reason !== "output-conflict") || hasFallback(output)
  ))
  const replace = outputs.filter((output) => output.protected && needsAttention(output))

  function generationTargets(replacing: boolean) {
    const targets = new Set(outputs.filter((output) => replacing && output.protected && needsAttention(output) ||
      !output.protected && (output.updateNeeded || output.missing || hasFallback(output)))
      .map((output) => identityKey(output.identity)))
    // A warning can cross multiple stages; add consumers only when a source in
    // this plan can change. An unresolved protected source alone isn't fixable
    // by an ordinary update of its consumers.
    let changed = true
    while (changed) {
      changed = false
      for (const output of outputs) {
        const key = identityKey(output.identity)
        if (!output.protected && !targets.has(key) && output.warnings.some((warning) =>
          warning.source && targets.has(identityKey(warning.source)))) {
          targets.add(key)
          changed = true
        }
      }
    }
    return outputs.filter((output) => targets.has(identityKey(output.identity)))
  }
  const update = generationTargets(false)
  const replacement = generationTargets(true)
  const selectedKeys = new Set(selected.map((output) => identityKey(output.identity)))
  const sourceStages = STAGE_ORDER.filter((stage) => outputs.some((output) =>
    !selectedKeys.has(identityKey(output.identity)) && OUTPUT_KIND_TO_STAGE[output.identity.kind] === stage))
  return { keep, replace, update, replacement, sourceStages }
}
