import { Trans } from "@lingui/react/macro"

/** Small page pictures that show where a fact or a pick comes from. */
export function PagesStrip({ pages, images }: { pages: number[]; images: Record<number, string> }) {
  if (pages.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {pages.map((n) => (
        <figure key={n} className="flex w-[72px] flex-col items-center gap-1">
          <div className="flex h-[96px] w-[72px] items-center justify-center overflow-hidden rounded border border-border bg-muted">
            {images[n] ? (
              <img src={images[n]} alt="" className="max-h-full max-w-full object-contain" />
            ) : null}
          </div>
          <figcaption className="text-[11px] text-muted-foreground">
            <Trans>Page {n}</Trans>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
