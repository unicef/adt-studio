/**
 * Effective spread leads for a page range: 1-indexed leading page numbers that
 * form a valid, non-overlapping spread within [startPage, endPage], sorted.
 * Mirrors the greedy grouping the extractor applies (`computeGroups` in
 * @adt/pdf), so it doubles as both the write-time normalizer and the source of
 * truth for how many spreads a config will actually produce.
 */
export function normalizeLeads(leads: number[], startPage: number, endPage: number): number[] {
  const sorted = [...new Set(leads)].sort((a, b) => a - b)
  const out: number[] = []
  let consumedUpTo = startPage - 1
  for (const lead of sorted) {
    if (lead < startPage || lead + 1 > endPage) continue
    if (lead <= consumedUpTo) continue
    out.push(lead)
    consumedUpTo = lead + 1
  }
  return out
}
