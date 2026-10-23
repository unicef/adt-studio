export interface StableSelection<T> {
  items: T[]
  stale: ReadonlySet<string>
}

const NONE: ReadonlySet<string> = new Set()

export function stableSelect<T>(
  current: readonly T[],
  server: readonly T[],
  keyOf: (item: T) => string,
  select: (list: readonly T[]) => T[],
): StableSelection<T> {
  if (current === server) return { items: select(current), stale: NONE }
  const now = new Map(current.map((item) => [keyOf(item), item]))
  const known = new Set(server.map(keyOf))
  const items = select(server)
    .map((item) => now.get(keyOf(item)))
    .filter((item): item is T => item !== undefined)
  const placed = new Set(items.map(keyOf))
  current.forEach((item, index) => {
    const key = keyOf(item)
    if (known.has(key) || placed.has(key)) return
    let at = 0
    for (let back = index - 1; back >= 0; back -= 1) {
      const position = items.findIndex((entry) => keyOf(entry) === keyOf(current[back]))
      if (position >= 0) {
        at = position + 1
        break
      }
    }
    items.splice(at, 0, item)
    placed.add(key)
  })
  const matching = new Set(select(current).map(keyOf))
  const stale = new Set(items.map(keyOf).filter((key) => known.has(key) && !matching.has(key)))
  return { items, stale }
}
