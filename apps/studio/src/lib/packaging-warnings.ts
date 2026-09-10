import type { I18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { toast } from "sonner"
import { PackagingWarning } from "@adt/types"

/**
 * Pull the packaging warnings out of a task result or a synchronous response.
 *
 * Packaging and export report what they had to leave out of the bundle through
 * whichever channel the caller used — `task.result` when the work was queued,
 * the response body when a cache hit answered inline — and both carry the same
 * `warnings` field. Reading it defensively (rather than asserting the shape)
 * keeps an older task record, or a task kind that carries no warnings, from
 * throwing here.
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

/**
 * Warn the user about anything packaging omitted, from any completion channel.
 *
 * Every path that packages has to call this. A short bundle is not an error —
 * the run succeeds and the download starts — so an unread `warnings` field is
 * indistinguishable to the user from a clean build.
 */
export function toastPackagingWarnings(source: unknown, i18n: I18n): void {
  const omitted = describePackagingWarnings(readPackagingWarnings(source), i18n)
  if (omitted) toast.warning(omitted)
}
