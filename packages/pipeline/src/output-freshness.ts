import { createHash } from "node:crypto"
import type {
  OutputIdentity, OutputInputEvidence, OutputMetadata, OutputSelection,
  OutputStatus, OutputSummary, OutputWarning,
} from "@adt/types"

/** Object-key order is incidental; array order is semantic. Callers select
 * relevant inputs explicitly instead of hashing whole config/source records. */
export function inputSignature(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(canonical)
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(Object.entries(input).filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, item]) => [key, canonical(item)]))
    }
    if (typeof input === "number" && !Number.isFinite(input)) throw new Error("Invalid signature input")
    return input
  }
  return createHash("sha256").update(JSON.stringify(canonical(value)) ?? "null").digest("hex")
}

export function outputEvidence(signature: string, content: unknown, references: OutputInputEvidence["references"] = []): OutputInputEvidence {
  return { signature, contentHash: inputSignature(content), references }
}

export function outputIdentityKey(identity: OutputIdentity): string {
  return JSON.stringify([identity.kind, identity.id, identity.language ?? "", identity.voiceSlot ?? ""])
}

export function deriveOutputStatus(options: {
  identity: OutputIdentity
  signature: string
  content: unknown
  metadata?: OutputMetadata
  usable: boolean
  excluded?: boolean
  fallback?: "failed" | "missing" | "outdated"
  upstream?: OutputStatus[]
}): OutputStatus {
  const { identity, signature, usable, metadata, fallback } = options
  const contentHash = inputSignature(options.content)
  const input = metadata?.input
  const evidenceValid = input?.contentHash === contentHash
  const review = metadata?.review
  const reviewed = review?.signature === signature && review.contentHash === contentHash
  // An old caller changing content without updating evidence must not leave it
  // eligible for an ordinary generated replacement.
  const protectedContent = metadata?.source !== "ai" || (!!input && !evidenceValid)
  const ownCurrent = usable && ((evidenceValid && input.signature === signature) || (reviewed && review.action === "keep"))
  const warnings: OutputWarning[] = []
  if (usable && !ownCurrent && protectedContent) warnings.push({ reason: input ? "source-changed" : "legacy" })
  if (fallback && !(reviewed && review.action === "checked")) warnings.push({ reason: `preparation-${fallback}` })
  const upstream = (options.upstream ?? []).filter((status) => !status.excluded && (!status.current || status.warnings.length > 0))
  for (const status of upstream) warnings.push({ reason: "upstream", source: status.identity })
  const excluded = options.excluded === true
  return {
    identity, signature, contentHash, usable,
    current: !excluded && ownCurrent && upstream.every((status) => status.current),
    protected: protectedContent, manual: metadata?.source === "manual", excluded,
    missing: !excluded && !usable,
    updateNeeded: !excluded && usable && !ownCurrent && !protectedContent,
    warnings: excluded ? [] : warnings,
    pageIds: [], sectionIds: [],
  }
}

export function selectedOutput(status: OutputStatus, selection?: OutputSelection): boolean {
  if (!selection) return true
  if (selection.languages && !selection.languages.includes(status.identity.language ?? "")) return false
  if (selection.voiceSlots && !selection.voiceSlots.includes(status.identity.voiceSlot ?? "primary")) return false
  const hasScope = selection.ids !== undefined || selection.pageIds !== undefined || selection.sectionIds !== undefined || selection.groups !== undefined
  return !hasScope || !!(
    selection.ids?.includes(status.identity.id) ||
    selection.pageIds?.some((id) => status.pageIds.includes(id)) ||
    selection.sectionIds?.some((id) => status.sectionIds.includes(id)) ||
    (status.group && selection.groups?.includes(status.group))
  )
}

export function summarizeOutputs(outputs: OutputStatus[]): OutputSummary {
  const unique = new Map(outputs.map((output) => [outputIdentityKey(output.identity), output]))
  return [...unique.values()].reduce((total, output) => ({
    updates: total.updates + Number(output.updateNeeded && !output.excluded),
    warnings: total.warnings + Number(output.warnings.length > 0 && !output.excluded),
    missing: total.missing + Number(output.missing && !output.excluded),
  }), { updates: 0, warnings: 0, missing: 0 })
}

/** A warning is not a reason to repeat identical successful work. */
export function needsOutputGeneration(status: OutputStatus, metadata?: OutputMetadata): boolean {
  if (status.excluded || (status.usable && status.protected)) return false
  return !status.usable || metadata?.input?.signature !== status.signature || metadata.input.contentHash !== status.contentHash
}
