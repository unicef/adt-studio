import { Trans } from "@lingui/react/macro"

const PULSE = "animate-pulse motion-reduce:animate-none"

/** One placeholder card, on the real card's geometry: the padded cover stage with its chip band,
 *  a two-line title and the badge row. Matching the real shape is the whole point — a skeleton
 *  that sits somewhere else just makes the arrival of the data look like a jump. */
function CardSkeleton({ index }: { index: number }) {
  return (
    <li
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
      className="flex flex-col overflow-hidden rounded-2xl border bg-card motion-safe:animate-wizard-enter"
    >
      <div className="relative flex h-56 w-full items-center justify-center bg-muted/40 px-4 pb-4 pt-11">
        <div className={`h-full w-[105px] rounded-md bg-muted ${PULSE}`} />
        <div className={`absolute left-3 top-3 h-6 w-14 rounded-full bg-muted ${PULSE}`} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex min-h-8 flex-col gap-1.5">
          <div className={`h-3 w-4/5 rounded bg-muted ${PULSE}`} />
          <div className={`h-3 w-1/2 rounded bg-muted/70 ${PULSE}`} />
        </div>
        <div className="mt-auto flex items-center gap-1.5">
          <div className={`h-5 w-14 rounded-md bg-muted/60 ${PULSE}`} />
          <div className={`h-5 w-9 rounded-md bg-muted/60 ${PULSE}`} />
          <div className={`ml-auto h-7 w-7 rounded-md bg-muted/60 ${PULSE}`} />
        </div>
      </div>
    </li>
  )
}

/** What the shelf shows while the account is being read. Four tiles and four cards: enough to
 *  claim the space the real screen will need, few enough not to promise a number of books. */
export function PublicationsSkeleton() {
  return (
    <div
      data-testid="publications-skeleton"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-4"
    >
      <span className="sr-only">
        <Trans>Looking up your shared books…</Trans>
      </span>

      {/* The placeholders are shape, not content: a screen reader gets the line above instead
          of four empty tiles and four empty cards. */}
      <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className="flex flex-col gap-2 rounded-xl border bg-card p-3.5">
            <div className="h-3 w-24 animate-pulse rounded bg-muted/70 motion-reduce:animate-none" />
            <div className="h-7 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted/50 motion-reduce:animate-none" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className={`h-9 min-w-48 flex-1 rounded-md bg-muted/60 ${PULSE}`} />
        <div className={`h-9 w-44 rounded-md bg-muted/60 ${PULSE}`} />
        <div className={`h-9 w-48 rounded-md bg-muted/60 ${PULSE}`} />
      </div>

      <ul className="grid list-none content-start gap-4 p-0 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
        {[0, 1, 2, 3].map((card) => (
          <CardSkeleton key={card} index={card} />
        ))}
      </ul>
      </div>
    </div>
  )
}
