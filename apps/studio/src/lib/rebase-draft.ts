/** Three-way editor merge. Unchanged fields follow the refreshed server; local
 * changes follow the draft. Concurrent changes to the same field need a choice.
 * Stable IDs, never array positions, match authored entries across versions. */
export function rebaseDraft<T>(base: T, draft: T, latest: T, prefer: "draft" | "latest" = "draft"): { value: T; conflicts: string[] } {
  const conflicts: string[] = []
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
  const merge = (a: unknown, b: unknown, c: unknown, path: string): unknown => {
    if (equal(a, b)) return c
    if (equal(a, c) || equal(b, c)) return b
    if (object(a) && object(b) && object(c)) {
      return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)])].flatMap((key) => {
        // Bookkeeping is authoritative on the server and never a draft edit.
        const value = ["source", "input", "review", "generatedAt", "quizIndex"].includes(key) ? c[key] : merge(a[key], b[key], c[key], `${path}/${key}`)
        return value === undefined ? [] : [[key, value]]
      }))
    }
    if (Array.isArray(a) && Array.isArray(b) && Array.isArray(c)) {
      // Schema field names used only to match identities, never display labels.
      // eslint-disable-next-line lingui/no-unlocalized-strings
      const key = ["id", "quizId", "sectionId", "nodeId", "optionId"].find((k) => [...a, ...b, ...c].every((v) => object(v) && typeof v[k] === "string"))
      if (key && [...a, ...b, ...c].length) {
        const indexed = (values: Record<string, unknown>[]) => new Map(values.map((v) => [v[key], v]))
        const ai = indexed(a), bi = indexed(b), ci = indexed(c)
        const aOrder = [...ai.keys()], bOrder = [...bi.keys()], cOrder = [...ci.keys()]
        let order = cOrder
        if (!equal(aOrder, bOrder)) {
          if (!equal(aOrder, cOrder) && !equal(bOrder, cOrder)) conflicts.push(`${path}/order`)
          if (equal(aOrder, cOrder) || prefer === "draft") order = bOrder
        }
        const ids = [...new Set([...order, ...ci.keys(), ...bi.keys(), ...ai.keys()])]
        return ids.flatMap((id) => {
          const value = merge(ai.get(id), bi.get(id), ci.get(id), `${path}/${id}`)
          return value === undefined ? [] : [value]
        })
      }
    }
    conflicts.push(path || "/")
    return prefer === "draft" ? b : c
  }
  return { value: merge(base, draft, latest, "") as T, conflicts }
}
