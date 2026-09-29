import { Trans } from "@lingui/react/macro"

const PULSE = "animate-pulse motion-reduce:animate-none"

/** The same two columns the answer will fill, so it arrives in place instead of as a jump. */
export function SetupSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
      <span className="sr-only"><Trans>Checking whether this book is shared…</Trans></span>
      <div aria-hidden="true" className="flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-1 flex-col gap-7 p-5">
          {[2, 4, 4].map((tiles, field) => (
            <div key={field} className="flex flex-col gap-2.5">
              <div className={`h-4 w-28 rounded bg-muted ${PULSE}`} />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: tiles }, (_, tile) => (
                  <div key={tile} className={`h-10 rounded-lg bg-muted/60 ${PULSE}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t bg-muted/20 p-5">
          <div className={`h-11 rounded-md bg-muted ${PULSE}`} />
        </div>
      </div>
      <div aria-hidden="true" className="flex min-h-[460px] flex-col overflow-hidden rounded-2xl border bg-[#f6f7f9] shadow-sm">
        <div className="h-12 border-b bg-white" />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="flex w-full max-w-[22rem] flex-col items-center gap-4 rounded-2xl bg-white px-8 py-8 ring-1 ring-black/5">
            <div className={`h-36 w-28 rounded-md bg-muted ${PULSE}`} />
            <div className={`h-4 w-32 rounded bg-muted ${PULSE}`} />
            <div className={`h-10 w-full rounded-lg bg-muted/70 ${PULSE}`} />
          </div>
        </div>
        <div className="h-11 border-t bg-white" />
      </div>
    </div>
  )
}
