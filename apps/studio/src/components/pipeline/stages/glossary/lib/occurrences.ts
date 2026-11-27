import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { GlossaryItem } from "@/api/client"
import { usePages } from "@/hooks/use-pages"

export interface TermOccurrence {
  count: number
  pages: number[]
}

// Built from regex literals (not string literals) so each fragment stays a
// regex source, never a translation target.
const BOUNDARY_BEFORE = /(?<![\p{L}\p{M}])/u.source
const BOUNDARY_AFTER = /(?![\p{L}\p{M}])/u.source

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function termStrings(item: GlossaryItem): string[] {
  return [item.word, ...item.variations].map((s) => s.trim()).filter(Boolean)
}

function itemKey(item: GlossaryItem): string {
  return item.id ?? item.word
}

/**
 * Count how often each glossary term (its word plus variations) appears in the
 * book's body text, and on which pages. Reads the single text-catalog fetch and
 * resolves each entry's page id to a real page number via the page list (so it
 * stays correct for two-page-spread extraction, where a page id like `pg002003`
 * is not itself a page number). Glossary and quiz entries carry non-page ids, so
 * they are ignored. Matching is case-insensitive with Unicode word boundaries,
 * and a single combined regex pass per page keeps it cheap regardless of how
 * many terms there are.
 */
export function useGlossaryOccurrences(
  bookLabel: string,
  items: GlossaryItem[],
): { byItem: Map<string, TermOccurrence>; isLoading: boolean } {
  const { data, isLoading: catalogLoading } = useQuery({
    queryKey: ["books", bookLabel, "text-catalog"],
    queryFn: () => api.getTextCatalog(bookLabel),
  })
  const { data: pages, isLoading: pagesLoading } = usePages(bookLabel)

  // Catalog entry ids are `<pageId>_<…>`, so the segment before the first
  // underscore is the page id. Map it to the human page number.
  const pageNumberByPageId = useMemo(() => {
    const map = new Map<string, number>()
    for (const page of pages ?? []) map.set(page.pageId, page.pageNumber)
    return map
  }, [pages])

  const pageText = useMemo(() => {
    const grouped = new Map<number, string[]>()
    for (const entry of data?.entries ?? []) {
      if (!entry.text) continue
      // Authored element audio is speech-only: its synthetic catalog entry is
      // not page text and must not inflate glossary occurrences (SPEC-0014).
      if (entry.locations?.some((location) => location.role === "element-audio")) continue
      const pageId = entry.id.split("_", 1)[0]
      const pageNumber = pageNumberByPageId.get(pageId)
      if (pageNumber == null) continue
      const bucket = grouped.get(pageNumber)
      if (bucket) bucket.push(entry.text)
      else grouped.set(pageNumber, [entry.text])
    }
    const joined = new Map<number, string>()
    for (const [pageNumber, texts] of grouped) {
      joined.set(pageNumber, texts.join(" "))
    }
    return joined
  }, [data, pageNumberByPageId])

  // Signature over only the fields that affect matching (key + word +
  // variations). Editing a definition or emoji, or pruning, changes the `items`
  // array identity but not this string, so the expensive scan below is skipped.
  const termSignature = useMemo(
    () =>
      items
        .map((item) => [itemKey(item), ...termStrings(item)].join(""))
        .join(""),
    [items],
  )

  // Derived from `items` but keyed by termSignature, so it only rebuilds when a
  // word or variation actually changes — not on every definition keystroke.
  const terms = useMemo(
    () =>
      items.map((item) => ({
        key: itemKey(item),
        variants: termStrings(item).map((s) => s.toLocaleLowerCase()),
      })),
    [termSignature],
  )

  const byItem = useMemo(() => {
    const result = new Map<string, TermOccurrence>()
    for (const { key } of terms) result.set(key, { count: 0, pages: [] })
    if (pageText.size === 0) return result

    const variantToItem = new Map<string, string>()
    const variants: string[] = []
    for (const { key, variants: itemVariants } of terms) {
      for (const lower of itemVariants) {
        if (!variantToItem.has(lower)) {
          variantToItem.set(lower, key)
          variants.push(lower)
        }
      }
    }
    if (variants.length === 0) return result

    variants.sort((a, b) => b.length - a.length)
    const pattern =
      BOUNDARY_BEFORE + "(" + variants.map(escapeRegExp).join("|") + ")" + BOUNDARY_AFTER
    let re: RegExp
    try {
      re = new RegExp(pattern, "giu")
    } catch {
      return result
    }

    const pageSets = new Map<string, Set<number>>()
    for (const [pageNumber, text] of pageText) {
      for (const match of text.matchAll(re)) {
        const key = variantToItem.get(match[0].toLocaleLowerCase())
        if (!key) continue
        const occ = result.get(key)
        if (!occ) continue
        occ.count += 1
        let set = pageSets.get(key)
        if (!set) {
          set = new Set<number>()
          pageSets.set(key, set)
        }
        set.add(pageNumber)
      }
    }
    for (const [key, set] of pageSets) {
      const occ = result.get(key)
      if (occ) occ.pages = Array.from(set).sort((a, b) => a - b)
    }
    return result
  }, [pageText, terms])

  return { byItem, isLoading: catalogLoading || pagesLoading }
}
