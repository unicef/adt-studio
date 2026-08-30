/**
 * Hard caps on what a read tool may return. A real book is far larger than any
 * context window, so every tool truncates explicitly and says how to page for
 * the rest rather than silently returning a prefix.
 */
export const TOOL_RESULT_CHAR_BUDGET = 12_000
export const TEXT_FIELD_CHAR_BUDGET = 2_000
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export interface ClampedText {
  text: string
  truncated: boolean
}

export function clampText(value: string, maxChars = TEXT_FIELD_CHAR_BUDGET): ClampedText {
  if (value.length <= maxChars) return { text: value, truncated: false }
  return { text: `${value.slice(0, maxChars)}…`, truncated: true }
}

export interface BudgetedPage<T> {
  items: T[]
  total: number
  offset: number
  returned: number
  truncated: boolean
  /** Offset to pass back for the next call; null when the list is exhausted. */
  nextOffset: number | null
}

/**
 * Page a list under both a row limit and a serialized-size budget, whichever
 * bites first.
 */
export function budgetedPage<Source, Item>(
  source: Source[],
  map: (item: Source, index: number) => Item,
  {
    offset = 0,
    limit = DEFAULT_PAGE_SIZE,
    charBudget = TOOL_RESULT_CHAR_BUDGET,
  }: { offset?: number; limit?: number; charBudget?: number } = {},
): BudgetedPage<Item> {
  const start = Math.max(0, Math.min(offset, source.length))
  const end = Math.min(source.length, start + Math.max(1, Math.min(limit, MAX_PAGE_SIZE)))

  const items: Item[] = []
  let used = 0
  let index = start

  for (; index < end; index++) {
    const mapped = map(source[index], index)
    const size = JSON.stringify(mapped).length
    if (items.length > 0 && used + size > charBudget) break
    items.push(mapped)
    used += size
  }

  const nextOffset = index < source.length ? index : null
  return {
    items,
    total: source.length,
    offset: start,
    returned: items.length,
    truncated: nextOffset !== null,
    nextOffset,
  }
}
