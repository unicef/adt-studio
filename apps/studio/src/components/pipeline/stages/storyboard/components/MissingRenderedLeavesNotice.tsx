import { useLingui } from "@lingui/react/macro"
import { AlertTriangle, RefreshCw } from "lucide-react"
import type { MissingRenderedLeaf } from "@/api/client"

const MAX_LISTED = 3
const SNIPPET_LENGTH = 60

/**
 * Explains a gap the user can't otherwise see (#596): text the tree shows as
 * visible but the rendered page leaves out. Purely informational: the server
 * computes the list from saved data, so the caller hides it while edits are
 * pending or a task is running.
 */
export function MissingRenderedLeavesNotice({
  leaves,
  onRerender,
  onSelectLeaf,
}: {
  leaves: MissingRenderedLeaf[]
  /** Omitted when this section can't be re-rendered (no provider, custom activity). */
  onRerender?: () => void
  /** Shows a listed leaf in the tree editor, where it can be hidden or inspected. */
  onSelectLeaf?: (nodeId: string) => void
}) {
  const { t } = useLingui()
  if (leaves.length === 0) return null

  const count = leaves.length
  const listed = leaves.slice(0, MAX_LISTED)
  const more = count - listed.length

  return (
    <div role="status" className="px-4 py-2 border-b shrink-0 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 text-xs">
          <p className="font-medium">
            {t`${count} visible {count, plural, one {element is} other {elements are}} missing from the rendered page`}
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {listed.map((leaf) => {
              const snippet = `“${leaf.text.length > SNIPPET_LENGTH ? `${leaf.text.slice(0, SNIPPET_LENGTH)}…` : leaf.text}”`
              return (
                <li key={leaf.nodeId} className="truncate" title={leaf.text}>
                  {onSelectLeaf ? (
                    <button
                      type="button"
                      onClick={() => onSelectLeaf(leaf.nodeId)}
                      className="max-w-full truncate text-left underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer"
                    >
                      {snippet}
                    </button>
                  ) : (
                    snippet
                  )}
                </li>
              )
            })}
            {more > 0 && <li>{t`and ${more} more`}</li>}
          </ul>
          <p className="mt-1 opacity-80">
            {t`Re-render the section to bring them back, or hide them in the tree if they were removed on purpose.`}
          </p>
        </div>
        {onRerender && (
          <button
            type="button"
            onClick={onRerender}
            className="shrink-0 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            {t`Re-render section`}
          </button>
        )}
      </div>
    </div>
  )
}
