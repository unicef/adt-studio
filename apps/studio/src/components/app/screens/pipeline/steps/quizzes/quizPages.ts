export interface BookPage {
  pageId: string
  pageNumber: number
}

export interface PageIndex {
  numberOf: ReadonlyMap<string, number>
  orderOf: ReadonlyMap<string, number>
}

export function buildPageIndex(pages: readonly BookPage[]): PageIndex {
  return {
    numberOf: new Map(pages.map((page) => [page.pageId, page.pageNumber])),
    orderOf: new Map(pages.map((page, index) => [page.pageId, index])),
  }
}

export function formatSourcePages(pageIds: readonly string[], index: PageIndex): string {
  const known = [...new Set(pageIds)]
    .flatMap((pageId) => {
      const number = index.numberOf.get(pageId)
      const order = index.orderOf.get(pageId)
      return number != null && order != null ? [{ number, order }] : []
    })
    .sort((a, b) => a.order - b.order)
  if (known.length === 0) return ""
  if (known.length === 1) return String(known[0].number)
  const runs: { first: number; last: number; lastOrder: number }[] = []
  for (const page of known) {
    const run = runs[runs.length - 1]
    if (run && page.order === run.lastOrder + 1) {
      run.last = page.number
      run.lastOrder = page.order
    } else runs.push({ first: page.number, last: page.number, lastOrder: page.order })
  }
  return runs.map((run) => (run.first === run.last ? String(run.first) : `${run.first}–${run.last}`)).join(", ")
}

export function inDocOrder<T extends { quizId: string }>(base: readonly { quizId: string }[], items: readonly T[]): T[] {
  const rank = new Map(base.map((quiz, index) => [quiz.quizId, index]))
  return items
    .map((item, index) => ({ item, index, rank: rank.get(item.quizId) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item)
}
