export interface FitItem {
  key: string
  width: number
  group: string
  priority: number
}

export interface FitMetrics {
  padding: number
  gap: number
  separator: number
  more: number
}

export function toolbarWidth(items: readonly FitItem[], metrics: FitMetrics): number {
  let width = metrics.padding * 2 + metrics.more
  let separators = 0
  items.forEach((item, index) => {
    width += item.width + metrics.gap
    if (index > 0 && items[index - 1].group !== item.group) separators++
  })
  if (items.length > 0 && metrics.more > 0) separators++
  return width + separators * metrics.separator
}

export function fitToolbar<T extends FitItem>(
  items: readonly T[],
  available: number,
  metrics: FitMetrics,
): { visible: T[]; folded: T[] } {
  const foldOrder = [...items].sort((a, b) => b.priority - a.priority)
  const folded = new Set<string>()
  let visible = [...items]
  for (const candidate of foldOrder) {
    if (toolbarWidth(visible, metrics) <= available) break
    folded.add(candidate.key)
    visible = visible.filter((item) => item.key !== candidate.key)
  }
  return { visible, folded: items.filter((item) => folded.has(item.key)) }
}


