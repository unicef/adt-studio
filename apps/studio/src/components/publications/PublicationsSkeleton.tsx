import { Trans } from "@lingui/react/macro"

/** One placeholder row, shaped like the real one: cover block, title line, address line, four
 *  meta pairs, action column. Matching the real geometry is the whole point — a skeleton that
 *  sits somewhere else just makes the arrival of the data look like a jump. */
function RowSkeleton({ index }: { index: number }) {
  return (
    <li
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
      className="rounded-xl border bg-card motion-safe:animate-wizard-enter"
    >
      <div className="flex flex-col gap-3 p-4 mh:gap-2 mh:p-3 lg:flex-row lg:items-start lg:gap-4">
        <div className="h-20 w-[54px] shrink-0 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <div className="h-4 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-4 w-14 animate-pulse rounded-full bg-muted/70 motion-reduce:animate-none" />
          </div>
          <div className="h-5 w-72 max-w-full animate-pulse rounded bg-muted/60 motion-reduce:animate-none" />
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {[16, 12, 10, 14].map((width, meta) => (
              <div
                key={meta}
                style={{ width: `${width * 6}px` }}
                className="h-3 animate-pulse rounded bg-muted/60 motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5 lg:w-44 lg:border-l lg:pl-4">
          {[0, 1, 2].map((action) => (
            <div
              key={action}
              className="h-8 w-full animate-pulse rounded-md bg-muted/60 motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    </li>
  )
}

/** What the shelf shows while the account is being read. Four tiles and three rows: enough to
 *  claim the space the real screen will need, few enough not to promise a number of books. */
export function PublicationsSkeleton() {
  return (
    <div
      data-testid="publications-skeleton"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-4 mh:gap-3"
    >
      <span className="sr-only">
        <Trans>Looking up your published books…</Trans>
      </span>

      {/* The placeholders are shape, not content: a screen reader gets the line above instead
          of four empty tiles and three empty list items. */}
      <div aria-hidden="true" className="flex flex-col gap-4 mh:gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className="flex flex-col gap-2 rounded-xl border bg-card p-4 mh:p-3">
            <div className="h-3 w-24 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
            <div className="h-7 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted/50 motion-reduce:animate-none" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-9 w-full max-w-xs animate-pulse rounded-md bg-muted/60 motion-reduce:animate-none" />
        <div className="h-9 w-40 animate-pulse rounded-md bg-muted/60 motion-reduce:animate-none" />
      </div>

      <ul className="flex list-none flex-col gap-3 p-0 mh:gap-2">
        {[0, 1, 2].map((row) => (
          <RowSkeleton key={row} index={row} />
        ))}
      </ul>
      </div>
    </div>
  )
}
