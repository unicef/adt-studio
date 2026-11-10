import { Trans } from "@lingui/react/macro"
import { STAGES } from "@/components/pipeline/stage-config"
import { StageContentSkeleton, stepLoadingShape } from "@/components/app/screens/pipeline/steps/shared/StepLoadingSkeleton"
import { useChromeRoot } from "@/components/app/lab/chrome"
import { rememberedPageRatio } from "@/components/app/screens/pipeline/shared/usePageAspect"

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

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function stageFromPath(): { slug: string; hex: string; label: string } | null {
  if (typeof window === "undefined") return null
  const [, , label = "", segment] = window.location.pathname.split("/")
  const stage = STAGES.find((candidate) => candidate.slug === segment)
  return stage && stage.slug !== "storyboard" ? { slug: stage.slug, hex: stage.hex, label: decodeSegment(label) } : null
}

function StageBootSkeleton({ hex, slug, label }: { hex: string; slug: string; label: string }) {
  const chrome = useChromeRoot(hex)
  return (
    <div role="status" aria-busy {...chrome} className="flex h-full w-full flex-col">
      <span className="sr-only">
        <Trans>Opening the book…</Trans>
      </span>
      <header className="flex h-13 shrink-0 items-center gap-3 px-3.5">
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
      <div className="min-h-0 flex-1 p-2">
        <div data-chrome="center" className="h-full overflow-hidden rounded-xl">
          <StageContentSkeleton shape={stepLoadingShape(slug)} ratio={rememberedPageRatio(label)} slug={slug} />
        </div>
      </div>
    </div>
  )
}

export function PipelineBootSkeleton() {
  const stage = stageFromPath()
  if (stage) return <StageBootSkeleton {...stage} />
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
