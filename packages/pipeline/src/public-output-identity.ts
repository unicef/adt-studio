import type { Storage } from "@adt/storage"
import { PageSectioningOutput, QuizIdentityError, resolveQuizId } from "@adt/types"
import type { Quiz, QuizGenerationOutput } from "@adt/types"

/** A public identity is one URL/file member, never a path or the reader root.
 * Keep readable legacy names; do not reinterpret URL escapes as ownership. */
export function isPublicOutputId(id: string): boolean {
  return !!id && !id.endsWith(".") && id.toLowerCase() !== "index" &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(id) &&
    !/[\s/\\%?#:<>"|*\u0000-\u001f\u007f]/u.test(id)
}

// Books move between case-sensitive and case-insensitive filesystems. Distinct
// public IDs must not resolve to the same member on either supported platform.
export const publicOutputMemberKey = (id: string) => id.normalize("NFC").toLowerCase()

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
    // Identity readers do not require document timestamps, reasoning or the
    // deprecated quizIndex. Reserve their public IDs independently of those
    // unused fields, including a valid entry beside an unreadable one. Corrupt quiz
    // JSON must not prevent reading the independent saved section tree.
    const data = storage.getLatestNodeData("quiz-generation", "book")?.data as Partial<QuizGenerationOutput> | undefined
    if (Array.isArray(data?.quizzes)) data.quizzes.forEach((quiz, index) => {
      if (!quiz || typeof quiz !== "object" || Array.isArray(quiz)) return
      // Match the shared reader's validation and nullish legacy fallback;
      // a stricter write schema would miss identities that it still exposes.
      try { reserve(resolveQuizId(quiz as Pick<Quiz, "quizId">, index), "\0quiz:" + index) }
      catch (error) { if (!(error instanceof QuizIdentityError)) throw error }
    })
  } catch (error) { if (!(error instanceof SyntaxError)) throw error }
  return owners
}

export function ambiguousPublicOutputIds(storage: Storage): Set<string> {
  const owners = publicOutputOwners(storage)
  const members = new Map<string, string[]>()
  for (const id of owners.keys()) members.set(publicOutputMemberKey(id), [...(members.get(publicOutputMemberKey(id)) ?? []), id])
  return new Set([...owners].filter(([id, pages]) => !isPublicOutputId(id) || pages.size !== 1 || members.get(publicOutputMemberKey(id))!.length !== 1).map(([id]) => id))
}

/** Validate the complete proposed list before an editable source/render write. */
export function invalidPublicOutputIdentity(storage: Storage, pageId: string, ids: readonly string[]): string | undefined {
  const owners = publicOutputOwners(storage)
  const seen = new Set<string>()
  for (const id of ids) {
    const key = publicOutputMemberKey(id)
    if (!isPublicOutputId(id) || seen.has(key) || [...owners].some(([current, pages]) =>
      publicOutputMemberKey(current) === key && [...pages].some(owner => owner !== pageId && owner !== "\0duplicate:" + pageId))) return id
    seen.add(key)
  }
  return undefined
}
