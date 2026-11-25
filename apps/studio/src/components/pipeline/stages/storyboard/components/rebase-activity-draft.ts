import type { EditableActivity } from "@adt/types"
import { rebaseDraft } from "@/lib/rebase-draft"

/** Rebuilt activities are whole values, not a bag of fields that can be
 * grafted onto a different structure. Neighbors still merge independently. */
export function rebaseActivityDraft(base: Record<string, EditableActivity>, draft: Record<string, EditableActivity>, latest: Record<string, EditableActivity>, prefer: "draft" | "latest" = "draft") {
  const merged = rebaseDraft(base, draft, latest, prefer)
  const result = { ...merged, value: { ...merged.value } }
  for (const key of Object.keys(draft)) {
    const before = base[key], mine = draft[key], current = latest[key]
    if (JSON.stringify(before) === JSON.stringify(mine)) continue
    if (!before || !current || before.kind !== current.kind || before.sectionType !== current.sectionType || before.sourceRenderingVersion !== current.sourceRenderingVersion) {
      result.conflicts = result.conflicts.filter(item => item !== `/${key}` && !item.startsWith(`/${key}/`))
      result.conflicts.push(`/${key}`)
      if (prefer === "draft") result.value[key] = mine
      else if (current) result.value[key] = current
      else delete result.value[key]
    }
  }
  return result
}
