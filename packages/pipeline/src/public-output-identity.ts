import type { Storage } from "@adt/storage"
import { PageSectioningOutput, QuizGenerationOutput, resolveQuizId } from "@adt/types"

/** A public identity is one URL/file member, never a path or the reader root.
 * Keep readable legacy names; do not reinterpret URL escapes as ownership. */
export function isPublicOutputId(id: string): boolean {
  return !!id && !id.endsWith(".") && id.toLowerCase() !== "index" &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(id) &&
    !/[\s/\\%?#:<>"|*\u0000-\u001f\u007f]/u.test(id)
}

// Books move between case-sensitive and case-insensitive filesystems. Distinct
// public IDs must not resolve to the same member on either supported platform.
const memberKey = (id: string) => id.normalize("NFC").toLowerCase()

/** Reserve both active source representations. The same page can own an ID in
 * its semantic and positioned trees, but two pages (or a quiz) cannot. */
export function publicOutputOwners(storage: Storage): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>()
  const reserve = (id: string, owner: string) => {
    const set = owners.get(id) ?? new Set<string>()
    set.add(owner)
    owners.set(id, set)
  }
  for (const { pageId } of storage.getPages()) {
    for (const node of ["page-sectioning", "fixed-layout-sectioning"]) {
      let data: unknown
      try { data = storage.getLatestNodeData(node, pageId)?.data }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; continue }
      const parsed = PageSectioningOutput.safeParse(data)
      if (parsed.success) {
        const seen = new Set<string>()
        for (const section of parsed.data.sections) {
          reserve(section.sectionId, seen.has(section.sectionId) ? "\0duplicate:" + pageId : pageId)
          seen.add(section.sectionId)
        }
      }
    }
  }
  try {
    // Legacy readers accept quiz arrays without document-level timestamps or
    // language metadata. Their public IDs are still reserved. Corrupt quiz
    // JSON must not prevent reading the independent saved section tree.
    const quizzes = QuizGenerationOutput.pick({ quizzes: true }).safeParse(storage.getLatestNodeData("quiz-generation", "book")?.data)
    if (quizzes.success) quizzes.data.quizzes.forEach((quiz, index) => reserve(resolveQuizId(quiz, index), "\0quiz:" + index))
  } catch (error) { if (!(error instanceof SyntaxError)) throw error }
  return owners
}

export function ambiguousPublicOutputIds(storage: Storage): Set<string> {
  const owners = publicOutputOwners(storage)
  const members = new Map<string, string[]>()
  for (const id of owners.keys()) members.set(memberKey(id), [...(members.get(memberKey(id)) ?? []), id])
  return new Set([...owners].filter(([id, pages]) => !isPublicOutputId(id) || pages.size !== 1 || members.get(memberKey(id))!.length !== 1).map(([id]) => id))
}

/** Validate the complete proposed list before an editable source/render write. */
export function invalidPublicOutputIdentity(storage: Storage, pageId: string, ids: readonly string[]): string | undefined {
  const owners = publicOutputOwners(storage)
  const seen = new Set<string>()
  for (const id of ids) {
    const key = memberKey(id)
    if (!isPublicOutputId(id) || seen.has(key) || [...owners].some(([current, pages]) =>
      memberKey(current) === key && [...pages].some(owner => owner !== pageId && owner !== "\0duplicate:" + pageId))) return id
    seen.add(key)
  }
  return undefined
}
