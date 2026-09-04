import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { PackagingWarning } from "@adt/types"

/**
 * Pull the packaging warnings out of a task result.
 *
 * Packaging and export both report what they had to leave out of the bundle
 * through the task result. Reading it defensively (rather than asserting the
 * shape) keeps an older task record — or a task kind that carries no warnings —
 * from throwing here.
 */
export function readPackagingWarnings(result: unknown): PackagingWarning[] {
  if (typeof result !== "object" || result === null) return []
  const parsed = PackagingWarning.array().safeParse(
    (result as { warnings?: unknown }).warnings,
  )
  return parsed.success ? parsed.data : []
}

/**
 * A single sentence naming what was omitted and how to fix it, or null when
 * nothing was.
 *
 * The warnings arrive as data because they are produced in `@adt/pipeline`,
 * which has no access to these catalogs — the wording belongs here.
 */
export function describePackagingWarnings(
  warnings: PackagingWarning[],
  i18n: I18n,
): string | null {
  if (warnings.length === 0) return null

  const pages = [...new Set(warnings.map((w) => w.pageId))].sort()
  const pageList = pages.join(", ")
  return i18n._(
    msg`Some content was left out of the bundle: ${warnings.length} rendered section(s) on ${pageList} have no sectioning row, so they could not be included. Re-run the storyboard render for those pages, then package again.`,
  )
}
