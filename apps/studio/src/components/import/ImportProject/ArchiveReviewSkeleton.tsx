export function ArchiveReviewSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid min-h-0 w-full flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm md:grid-cols-[minmax(0,1fr)_240px]"
    >
      <div className="motion-safe:animate-pulse">
        <div className="border-b border-border px-5 py-4">
          <div className="h-5 w-28 rounded-full bg-muted" />
          <div className="mt-3 h-6 w-56 rounded bg-muted-foreground/15" />
        </div>
        <div className="p-5 pt-3">
          <div className="grid h-10 grid-cols-3 gap-1 rounded-md bg-muted p-1">
            <div className="rounded-sm bg-background shadow-sm" />
            <div className="rounded-sm bg-muted" />
            <div className="rounded-sm bg-muted" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="h-16 rounded-lg bg-muted" />
            <div className="h-16 rounded-lg bg-muted" />
            <div className="h-16 rounded-lg bg-muted" />
          </div>
          <div className="mt-4 h-24 rounded-lg bg-muted" />
        </div>
      </div>
      <div className="hidden items-center justify-center border-l border-border bg-muted/40 p-6 md:flex">
        <div className="aspect-[3/4] w-40 rounded-md bg-muted-foreground/15 motion-safe:animate-pulse" />
      </div>
    </div>
  )
}
