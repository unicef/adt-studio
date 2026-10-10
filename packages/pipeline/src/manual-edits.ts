import type { AuthoredContent } from "@adt/types"

/** Only explicitly AI-authored content may be replaced by an ordinary run. */
export function isProtectedContent(content: AuthoredContent): boolean {
  return content.source !== "ai"
}

function indexByKey<T>(entries: readonly T[], keyOf: (entry: T) => string): Map<string, T> {
  const indexed = new Map<string, T>()
  for (const entry of entries) {
    const key = keyOf(entry)
    if (!key) throw new Error("Preservation requires a stable, non-empty identity")
    if (indexed.has(key)) throw new Error(`Duplicate preservation identity: ${key}`)
    indexed.set(key, entry)
  }
  return indexed
}

/**
 * Server-side comparison after admission has established that `previous` is the
 * editor's current base version. Client-supplied source is never authoritative.
 * `isEqual` compares authored content, excluding bookkeeping such as quizIndex.
 * Source is removed before comparison so even an exact comparator ignores it.
 * This helper does not supply version checks, locks, identity allocation or IO.
 */
export function stampManualEdits<T extends AuthoredContent>(
  previous: readonly T[],
  next: readonly T[],
  keyOf: (entry: T) => string,
  isEqual: (previous: Omit<T, "source">, next: Omit<T, "source">) => boolean,
): Array<Omit<T, "source"> & AuthoredContent> {
  const priorByKey = indexByKey(previous, keyOf)
  indexByKey(next, keyOf)
  const withoutSource = (entry: T): Omit<T, "source"> => {
    const { source: _source, ...content } = entry
    return content
  }
  return next.map((entry) => {
    const prior = priorByKey.get(keyOf(entry))
    const content = withoutSource(entry)
    if (!prior || !isEqual(withoutSource(prior), content)) {
      return { ...content, source: "manual" }
    }
    // Keep absence as absence: a no-op save must not invent known authorship.
    return prior.source === undefined ? content : { ...content, source: prior.source }
  })
}

/**
 * Merge trusted generated output, preserving manual AND unknown existing items
 * wholesale, including IDs and metadata. Adapted from the glossary preservation
 * pattern; no normalized-word matching or regenerated identity substitution.
 *
 * The caller must filter retired source IDs before passing `existing`, retain
 * unselected/current AI output separately, and call only after successful
 * generation and publication checks. This is not an execution/publication plan.
 * Generated order is retained; protected items absent from generation append in
 * their existing order. Entity-specific placement (e.g. quizzes) stays with the
 * caller. Ambiguous identities fail rather than silently losing an edit.
 */
export function mergePreservingManual<T extends AuthoredContent>(
  generated: readonly T[],
  existing: readonly T[],
  keyOf: (entry: T) => string,
): Array<Omit<T, "source"> & AuthoredContent> {
  const generatedByKey = indexByKey(generated, keyOf)
  const existingByKey = indexByKey(existing, keyOf)
  return [
    ...generated.map((entry): Omit<T, "source"> & AuthoredContent => {
      const prior = existingByKey.get(keyOf(entry))
      return prior && isProtectedContent(prior) ? prior : { ...entry, source: "ai" }
    }),
    ...existing.filter((entry) => isProtectedContent(entry) && !generatedByKey.has(keyOf(entry))),
  ]
}
