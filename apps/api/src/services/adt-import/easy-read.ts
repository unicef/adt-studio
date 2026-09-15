export const EASY_READ_ID_SUFFIX = "_easy_read"

/** Easy Read texts in the archive whose source element the recovered catalog
 * still carries, so the runtime swap they were published for can be rebuilt. */
export function recoverableEasyReadIds(
  sourceTexts: Record<string, string>,
  catalogIds: ReadonlySet<string>,
): string[] {
  return Object.entries(sourceTexts)
    .filter(([id, text]) => (
      id.endsWith(EASY_READ_ID_SUFFIX)
      && text.trim().length > 0
      && catalogIds.has(id.slice(0, -EASY_READ_ID_SUFFIX.length))
    ))
    .map(([id]) => id)
}
