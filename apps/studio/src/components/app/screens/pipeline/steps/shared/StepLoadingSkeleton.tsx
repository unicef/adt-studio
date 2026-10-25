import { useLingui } from "@lingui/react/macro"
import { isLandscapeRatio, pageGridClass, type PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"

export type StepLoadingShape = "grid" | "list" | "report"

const BAR = "rounded bg-muted-foreground/15"
const LINE = "rounded bg-muted-foreground/10"

export function StepRailSkeleton({ thumbClassName }: { thumbClassName: string }) {
  const { t } = useLingui()
  return (
    <div role="status" aria-busy className="flex flex-col gap-2 motion-safe:animate-pulse">
      <span className="sr-only">{t`Loading…`}</span>
      <div className={`mb-1 h-2.5 w-20 ${BAR}`} />
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-2.5 rounded-lg p-1.5">
          <div className={`${thumbClassName} shrink-0 rounded bg-muted`} />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className={`h-2.5 w-14 ${BAR}`} />
            <div className={`h-2 w-full ${LINE}`} />
          </div>
        </div>
      ))}
    </div>
  )
}

const HEADER_ACTIONS: Record<string, number[]> = {
  extract: [131, 145],
}

function Heading({ slug }: { slug?: string }) {
  return (
    <div className="flex h-9 items-center gap-3">
      <div className={`h-5 w-28 ${BAR}`} />
      <div className={`h-2.5 w-14 ${LINE}`} />
      <div className="ml-auto flex items-center gap-2">
        {(HEADER_ACTIONS[slug ?? ""] ?? []).map((width, index) => (
          <div key={index} className="h-9 rounded-[10px] border bg-card shadow-sm" style={{ width }} />
        ))}
      </div>
    </div>
  )
}

function GridSkeleton({ ratio, slug }: { ratio: number; slug?: string }) {
  return (
    <div aria-hidden className="mx-auto flex container flex-col gap-4 px-4 py-7 motion-safe:animate-pulse">
      <Heading slug={slug} />
      <div className={pageGridClass(isLandscapeRatio(ratio))}>
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="flex flex-col overflow-hidden rounded-xl border bg-card">
            <div className="border-b bg-muted" style={{ aspectRatio: ratio }} />
            <div className="flex flex-col gap-0.5 px-2.5 py-2">
              <div className="flex h-[18px] items-center justify-between gap-2">
                <div className={`h-2.5 w-12 ${BAR}`} />
                <div className={`h-2 w-8 ${LINE}`} />
              </div>
              <div className="flex h-9 flex-col justify-center gap-2.5">
                <div className={`h-2 w-full ${LINE}`} />
                <div className={`h-2 w-3/4 ${LINE}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ListSkeleton({ slug }: { slug?: string }) {
  return (
    <div aria-hidden className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-4 py-7 motion-safe:animate-pulse">
      <Heading slug={slug} />
      <div className="flex items-center gap-2 py-2">
        {[64, 72, 52].map((width, index) => (
          <div key={index} className="h-7 rounded-md bg-muted" style={{ width }} />
        ))}
        <div className="ml-auto h-8 w-[260px] rounded-lg bg-muted" />
      </div>
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 9 }, (_, index) => (
          <div key={index} className="flex min-h-10 items-center gap-3 rounded-xl border bg-card px-3 py-2">
            <div className={`h-3 w-28 ${BAR}`} />
            <div className={`h-2.5 flex-1 ${LINE}`} />
            <div className={`h-2.5 w-12 ${LINE}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportSkeleton({ slug }: { slug?: string }) {
  return (
    <div aria-hidden className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-4 py-7 motion-safe:animate-pulse">
      <Heading slug={slug} />
      <div className="grid grid-cols-3 divide-x rounded-xl border bg-card">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 p-4">
            <div className={`h-6 w-10 ${BAR}`} />
            <div className={`h-2.5 w-24 ${LINE}`} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-7 w-20 rounded-md bg-muted" />
        ))}
      </div>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-xl border bg-card p-3.5">
          <div className={`h-3 w-1/3 ${BAR}`} />
          <div className={`h-2.5 w-full ${LINE}`} />
          <div className={`h-2.5 w-2/3 ${LINE}`} />
        </div>
      ))}
    </div>
  )
}

export function StageContentSkeleton({ shape = "grid", ratio, slug }: { shape?: StepLoadingShape; ratio: number; slug?: string }) {
  if (shape === "list") return <ListSkeleton slug={slug} />
  if (shape === "report") return <ReportSkeleton slug={slug} />
  return <GridSkeleton ratio={ratio} slug={slug} />
}

export function StepBodySkeleton({ shape, aspect, slug }: { shape: StepLoadingShape; aspect: PageAspect; slug?: string }) {
  return <StageContentSkeleton shape={shape} ratio={aspect.ratio} slug={slug} />
}
