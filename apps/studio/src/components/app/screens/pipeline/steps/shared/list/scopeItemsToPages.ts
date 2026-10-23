export interface PageRef {
  pageId: string
}

export interface PageScopedItems<P, T> {
  navPages: P[]
  itemsOn: (pageId: string) => T[]
  countOn: (pageId: string) => number
}

export function scopeItemsToPages<P extends PageRef, T>(
  pages: readonly P[],
  items: readonly T[],
  pagesOf: (item: T) => readonly string[],
): PageScopedItems<P, T> {
  const byPage = new Map<string, T[]>()
  for (const item of items) {
    for (const pageId of new Set(pagesOf(item))) {
      const bucket = byPage.get(pageId)
      if (bucket) bucket.push(item)
      else byPage.set(pageId, [item])
    }
  }
  return {
    navPages: pages.filter((page) => byPage.has(page.pageId)),
    itemsOn: (pageId) => byPage.get(pageId) ?? [],
    countOn: (pageId) => byPage.get(pageId)?.length ?? 0,
  }
}
