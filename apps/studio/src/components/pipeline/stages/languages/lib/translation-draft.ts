import type { TextCatalogEntry, TextCatalogResponse } from "@/api/client"
import { normalizeLocale } from "@/lib/languages"
import { rebaseDraft } from "@/lib/rebase-draft"

/** Read and recovery must select the same document, including valid absence.
 * An unreadable canonical document is present: never resurrect its legacy alias. */
export function translationEditState(catalog: TextCatalogResponse | null | undefined, language: string | null | undefined) {
  if (!catalog || !language) return null
  const canonical = normalizeLocale(language)
  const legacy = canonical.replace("-", "_")
  const exists = (id: string) => Object.hasOwn(catalog.translations, id) || catalog.unavailableTranslations?.includes(id)
  const itemId = exists(canonical) ? canonical : exists(legacy) ? legacy : canonical
  if (catalog.unavailableTranslations?.includes(itemId)) return null
  const saved = catalog.translations[itemId]
  const sourceSignature = saved?.sourceSignature ?? catalog.translationSourceSignatures?.[canonical]
  if (!sourceSignature) return null
  return {
    itemId,
    entries: saved?.entries ?? [],
    baseVersion: saved?.version ?? 0,
    sourceVersion: catalog.version,
    sourceSignature,
  }
}

/** The editor and output projection display the first copy of a legacy ID. */
export function visibleTranslations(entries: TextCatalogEntry[]): TextCatalogEntry[] {
  const seen = new Set<string>()
  return entries.filter(entry => !seen.has(entry.id) && !!seen.add(entry.id))
}

/** Legacy IDs can have multiple stored copies. Match ordered groups, never a
 * single last-wins Map entry. An ambiguous overlapping edit requires a choice
 * for the complete group; unrelated groups remain exactly as saved. */
export function rebaseTranslationDraft(base: TextCatalogEntry[], draft: TextCatalogEntry[], latest: TextCatalogEntry[], prefer: "draft" | "latest" = "draft") {
  const group = (entries: TextCatalogEntry[]) => {
    const groups = new Map<string, TextCatalogEntry[]>()
    for (const entry of entries) {
      const copies = groups.get(entry.id)
      if (copies) copies.push(entry)
      else groups.set(entry.id, [entry])
    }
    return groups
  }
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const before = group(base), mine = group(draft), current = group(latest)
  const merged = new Map<string, TextCatalogEntry[]>()
  const conflicts: string[] = []
  for (const id of new Set([...before.keys(), ...mine.keys(), ...current.keys()])) {
    const a = before.get(id) ?? [], b = mine.get(id) ?? [], c = current.get(id) ?? []
    // Only the visible first text is authored here. A -> B -> A can leave
    // synchronized draft copies; that is not consent to change hidden copies.
    if (a[0]?.text === b[0]?.text) merged.set(id, c)
    else if (equal(a, c) || equal(b, c)) merged.set(id, b)
    else if (Math.max(a.length, b.length, c.length) <= 1) {
      const result = rebaseDraft(a[0], b[0], c[0], prefer)
      conflicts.push(...result.conflicts.map(path => `/${id}${path}`))
      merged.set(id, result.value ? [result.value] : [])
    } else {
      conflicts.push(`/${id}`)
      // The editor authors one visible text, applying it to all copies. If
      // another writer changed their count, Keep reapplies that authored text
      // to the current collection, never resubmits obsolete duplicate slots.
      const authoredText = b[0]?.text
      const textEdit = b.length > 0 && authoredText !== a[0]?.text && b.every(entry => entry.text === authoredText)
      const kept = textEdit ? (c.length ? c : [b[0]]).map(entry => ({ ...entry, text: b[0].text })) : b
      merged.set(id, prefer === "draft" ? kept : c)
    }
  }
  // Keep the server's interleaving, not just each group's internal order.
  // Copies added only in the draft follow their draft order after saved slots.
  const offsets = new Map<string, number>()
  const value: TextCatalogEntry[] = []
  for (const entry of [...latest, ...draft]) {
    const index = offsets.get(entry.id) ?? 0
    const next = merged.get(entry.id)?.[index]
    if (next) { value.push(next); offsets.set(entry.id, index + 1) }
  }
  return { value, conflicts }
}
