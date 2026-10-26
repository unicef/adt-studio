import type { TocGenerationOutput } from "@/api/client"
import { rebaseDraft } from "./rebase-draft"

type TocData = Omit<TocGenerationOutput, "version">

/** TOC IDs are generated positions, not stable chapter identities. If the
 * document shape or a target changes, retain the entire draft for an explicit
 * choice. In particular, never apply Chapter A's indentation to Chapter B.
 * Ordinary edits to independent entries still use the shared three-way merge. */
export function rebaseTocDraft<T extends TocData>(base: T, draft: T, latest: T, prefer: "draft" | "latest" = "draft"): { value: T; conflicts: string[] } {
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  if (equal(base.entries, draft.entries)) return { value: latest, conflicts: [] }
  if (base.generatedAt === latest.generatedAt && equal(base.entries, latest.entries)) return { value: { ...latest, entries: draft.entries }, conflicts: [] }
  const identities = (value: T) => value.entries.map(({ id, chapterId, sectionId, href }) => ({ id, chapterId, sectionId, href }))
  const unique = (value: T) => new Set(value.entries.map((entry) => entry.id)).size === value.entries.length
  const editedChapterRenamed = base.entries.some((entry, index) => {
    const mine = draft.entries.find((candidate) => candidate.id === entry.id)
    return mine && !equal(entry, mine) && latest.entries[index]?.title !== entry.title
  })
  if (base.generatedAt !== latest.generatedAt || ![base, draft, latest].every(unique) || !equal(identities(base), identities(latest)) || editedChapterRenamed) {
    return { value: prefer === "draft" ? draft : latest, conflicts: ["/entries"] }
  }
  return rebaseDraft(base, draft, latest, prefer)
}
