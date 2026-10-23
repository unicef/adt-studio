import { Trans } from "@lingui/react/macro"
import { STAGES } from "@/components/pipeline/stage-config"

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-muted-foreground/12 ${className}`} />
}

export function AppBootSkeleton() {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/pipeline/")) {
    return <PipelineBootSkeleton />
  }
  return (
    <div role="status" aria-busy className="flex h-full w-full bg-background motion-safe:animate-pulse">
      <span className="sr-only">
        <Trans>Loading ADT Studio…</Trans>
      </span>
      <aside className="flex w-64 shrink-0 flex-col gap-3 border-r p-4">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-brand-500/20" />
          <Bar className="h-3 w-24" />
        </div>
        <div className="h-9 rounded-lg bg-brand-500/15" />
        <div className="h-8 rounded-lg bg-muted" />
        {[0, 1, 2].map((row) => (
          <Bar key={row} className="h-3 w-32" />
        ))}
      </aside>
      <main className="flex flex-1 flex-col gap-5 p-10">
        <Bar className="h-6 w-56" />
        <Bar className="h-3 w-80" />
        <div className="h-60 rounded-2xl border bg-card" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((card) => (
            <div key={card} className="aspect-[3/4] rounded-xl border bg-card" />
          ))}
        </div>
      </main>
    </div>
  )
}

function stageFromPath(): { slug: string; hex: string } | null {
  if (typeof window === "undefined") return null
  const segment = window.location.pathname.split("/")[3]
  const stage = STAGES.find((candidate) => candidate.slug === segment)
  return stage && stage.slug !== "storyboard" ? { slug: stage.slug, hex: stage.hex } : null
}

const LIST_STAGES = new Set(["quizzes", "glossary", "toc", "translate", "speech", "easy-read", "validation", "sign-language"])

function StageBootSkeleton({ hex, slug }: { hex: string; slug: string }) {
  const list = LIST_STAGES.has(slug)
  return (
    <div role="status" aria-busy className="flex h-full w-full flex-col bg-background">
      <span className="sr-only">
        <Trans>Opening the book…</Trans>
      </span>
      <header className="flex h-12.5 shrink-0 items-center gap-3 border-b px-3.5">
        <div className="size-7 rounded-lg bg-muted" />
        <div className="size-6 rounded-md bg-muted" />
        <Bar className="h-3 w-40" />
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="size-5 rounded-full opacity-70" style={{ background: hex }} />
          <Bar className="h-3 w-20" />
        </div>
        <div className="flex-1" />
        <div className="h-8 w-20 rounded-lg border" />
        <div className="h-8 w-18 rounded-lg bg-muted" />
      </header>
      <div className="flex min-h-0 flex-1 motion-safe:animate-pulse">
        <aside className="flex w-56 shrink-0 flex-col gap-2 border-r p-3">
          <Bar className="mb-2 h-2.5 w-16" />
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="flex gap-2.5 rounded-lg p-1.5">
              <div className="h-[52px] w-[38px] shrink-0 rounded bg-muted" />
              <div className="flex flex-1 flex-col gap-1.5 pt-1">
                <Bar className="h-2.5 w-14" />
                <Bar className="h-2 w-full" />
              </div>
            </div>
          ))}
        </aside>
        <div className="flex flex-1 justify-center px-6 pt-7">
          <div className="flex w-full max-w-[860px] flex-col gap-4">
            <Bar className="h-6 w-48" />
            {list ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="flex flex-col gap-2.5 rounded-xl border bg-card p-4">
                    <Bar className="h-3 w-2/5" />
                    <Bar className="h-2.5 w-full" />
                    <Bar className="h-2.5 w-4/5" />
                  </div>
                ))}
              </div>
            ) : (
            <div className="grid grid-cols-4 gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((card) => (
                <div key={card} className="flex flex-col overflow-hidden rounded-xl border bg-card">
                  <div className="aspect-[3/4] bg-muted" />
                  <div className="flex flex-col gap-1.5 p-3">
                    <Bar className="h-2.5 w-16" />
                    <Bar className="h-2 w-full" />
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PipelineBootSkeleton() {
  const stage = stageFromPath()
  if (stage) return <StageBootSkeleton hex={stage.hex} slug={stage.slug} />
  return (
    <div role="status" aria-busy className="flex h-full w-full flex-col bg-background">
      <span className="sr-only">
        <Trans>Opening the book…</Trans>
      </span>
      <header className="flex h-13 shrink-0 items-center gap-3 border-b px-4 motion-safe:animate-pulse">
        <Bar className="h-3 w-16" />
        <div className="h-5 w-px bg-border" />
        <Bar className="h-3 w-28" />
        <div className="flex-1" />
        <div className="h-8 w-20 rounded-lg border" />
        <div className="size-8 rounded-lg border" />
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col gap-2 border-r p-3 motion-safe:animate-pulse">
          <Bar className="mb-2 h-2.5 w-14" />
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex gap-2.5 rounded-lg p-2">
              <div className="h-[70px] w-[52px] shrink-0 rounded bg-muted" />
              <div className="flex flex-1 flex-col gap-2 pt-1">
                <Bar className="h-2.5 w-14" />
                <Bar className="h-2 w-full" />
              </div>
            </div>
          ))}
        </aside>
        <div className="flex flex-1 justify-center bg-accent px-6 pt-6">
          <div className="flex h-[70%] w-full max-w-[820px] gap-8 rounded-lg bg-card p-10 motion-safe:animate-pulse">
            <div className="flex flex-1 flex-col gap-2.5">
              <Bar className="h-4 w-2/5" />
              {[0, 1, 2, 3, 4, 5, 6].map((line) => (
                <Bar key={line} className="h-2.5 w-full" />
              ))}
            </div>
            <div className="w-2/5 rounded-md bg-muted" />
          </div>
        </div>
        <aside className="w-[326px] shrink-0 border-l p-4 motion-safe:animate-pulse">
          <Bar className="h-3 w-24" />
        </aside>
      </div>
    </div>
  )
}

export function BootSplash() {
  const onBook = typeof window !== "undefined" && window.location.pathname.startsWith("/pipeline/")
  return (
    <div role="status" aria-busy className="grid h-full w-full place-items-center bg-background animate-in fade-in duration-500">
      <div className="flex flex-col items-center gap-4">
        <div className="relative grid size-16 place-items-center rounded-2xl bg-brand-600 text-white shadow-[0_18px_40px_-18px_var(--brand-600)]">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
          </svg>
          <span className="absolute inset-0 rounded-2xl ring-4 ring-brand-500/20 motion-safe:animate-ping [animation-duration:2s]" />
        </div>
        <span className="text-[13px] font-medium text-muted-foreground">
          {onBook ? <Trans>Opening the book…</Trans> : <Trans>Starting ADT Studio…</Trans>}
        </span>
        <div className="relative h-1 w-40 overflow-hidden rounded-full bg-muted">
          <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-brand-500 motion-safe:animate-indeterminate" />
        </div>
      </div>
    </div>
  )
}
