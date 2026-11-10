import { useLingui } from "@lingui/react/macro"
import type { GlossaryFilter } from "./glossaryList"

export function GlossaryFilterEmpty({
  search,
  filter,
  mineOnly,
  onClearSearch,
  onClearFilters,
}: {
  search: string
  filter: GlossaryFilter
  mineOnly: boolean
  onClearSearch: () => void
  onClearFilters: () => void
}) {
  const { t } = useLingui()
  const query = search.trim()
  const filtered = mineOnly || filter === "pruned"
  const message = query
    ? t`No terms match “${query}”.`
    : mineOnly
      ? t`You haven't added any terms. Add term adds your own.`
      : filter === "pruned"
        ? t`No pruned terms. Terms you prune stay out of the book and show up here.`
        : t`No terms to show.`
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center text-[12.5px] text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
      <span className="text-pretty">{message}</span>
      {(query || filtered) && (
        <button
          type="button"
          onClick={query ? onClearSearch : onClearFilters}
          className="rounded-md font-medium text-foreground underline-offset-4 transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {query ? t`Clear search` : t`Clear filters`}
        </button>
      )}
    </div>
  )
}
