import { createHash } from "node:crypto"
import type {
  OutputIdentity, OutputInputEvidence, OutputMetadata, OutputSelection,
  OutputStatus, OutputSummary, OutputWarning, OutputRunScope, TextCatalogEntry,
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

export function outputSkipped(scope: OutputRunScope | undefined, identity: OutputIdentity): boolean {
  return scope?.skip?.some((item) => outputIdentityKey(item) === outputIdentityKey(identity)) === true
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
  const protectedContent = (options.content !== undefined || metadata !== undefined) && (metadata?.source !== "ai" || !input || !evidenceValid)
  const ownCurrent = usable && ((evidenceValid && input.signature === signature) || (reviewed && review.action === "keep"))
  const warnings: OutputWarning[] = []
  if (usable && !ownCurrent && protectedContent) warnings.push({ reason: input || review ? "source-changed" : "legacy" })
  if (fallback && !(reviewed && review.action === "checked")) warnings.push({ reason: `preparation-${fallback}` })
  const upstream = (options.upstream ?? []).filter((status) => !status.excluded && (!status.current || status.warnings.length > 0))
  for (const status of upstream) warnings.push({ reason: "upstream", source: status.identity })
  const excluded = options.excluded === true
  return {
    identity, signature, contentHash, usable,
    text: typeof options.content === "string" && !["audio", "timestamps", "image-translation"].includes(identity.kind) ? options.content : undefined,
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
  if (selection.identities && !selection.identities.some((item) => outputIdentityKey(item) === outputIdentityKey(status.identity))) return false
  if (selection.kinds && !selection.kinds.includes(status.identity.kind)) return false
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
export function needsOutputGeneration(status: OutputStatus, _metadata?: OutputMetadata): boolean {
  if (status.excluded || status.protected) return false
  return !status.usable || status.updateNeeded
}

export function withOutputLocations(status: OutputStatus, entry: TextCatalogEntry): OutputStatus {
  const locations = entry.locations ?? []
  return { ...status, sourceText: entry.text,
    pageIds: [...new Set(locations.flatMap((location) => location.pageId ? [location.pageId] : []))],
    sectionIds: [...new Set(locations.flatMap((location) => location.sectionId ? [location.sectionId] : []))],
    group: locations.find((location) => location.group)?.group,
  }
}

/** The same selector is used by page, section, group and whole-stage runs. */
export function selectedForGeneration(status: OutputStatus, metadata?: OutputMetadata, scope?: OutputRunScope): boolean {
  if (!selectedOutput(status, scope?.selection) || status.excluded) return false
  const key = outputIdentityKey(status.identity)
  if (outputSkipped(scope, status.identity)) return false
  const replacement = scope?.replace?.find((item) => outputIdentityKey(item.identity) === key)
  if (replacement) {
    if (replacement.signature !== status.signature || replacement.contentHash !== status.contentHash) {
      throw new Error("Output changed since review. Refresh before replacing it.")
    }
    return true
  }
  if (status.protected) return false
  return scope?.retry?.some((identity) => outputIdentityKey(identity) === key) || needsOutputGeneration(status, metadata)
}

/** Check the captured inputs, selected membership and target content immediately
 * before publication. A warning already present at planning is not a conflict. */
export function assertOutputPublication(before: OutputStatus[], after: OutputStatus[], identities: OutputIdentity[]): void {
  const previous = new Map(before.map((item) => [outputIdentityKey(item.identity), item]))
  const current = new Map(after.map((item) => [outputIdentityKey(item.identity), item]))
  for (const identity of identities) {
    const key = outputIdentityKey(identity)
    const captured = previous.get(key)
    const latest = current.get(key)
    if (!captured || !latest || captured.signature !== latest.signature || captured.contentHash !== latest.contentHash ||
      captured.protected !== latest.protected || captured.excluded !== latest.excluded) {
      throw new Error("Output or its inputs changed during generation. Previous output has been preserved.")
    }
  }
}
