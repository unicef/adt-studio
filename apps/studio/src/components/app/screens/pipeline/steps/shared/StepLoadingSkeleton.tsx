import { useLingui } from "@lingui/react/macro"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"

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

function Heading() {
  return (
    <>
      <div className={`h-6 w-48 ${BAR}`} />
      <div className={`h-3 w-72 ${LINE}`} />
    </>
  )
}

function GridSkeleton({ aspect }: { aspect: PageAspect }) {
  return (
    <div aria-hidden className="mx-auto flex container flex-col gap-4 px-4 py-7 motion-safe:animate-pulse">
      <Heading />
      <div className={aspect.gridClass}>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex flex-col overflow-hidden rounded-xl border bg-card">
            <div className="bg-muted" style={{ aspectRatio: aspect.ratio }} />
            <div className="flex flex-col gap-1.5 px-2.5 py-2">
              <div className={`h-2.5 w-16 ${BAR}`} />
              <div className={`h-2 w-full ${LINE}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-hidden className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-4 py-7 motion-safe:animate-pulse">
      <Heading />
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

function ReportSkeleton() {
  return (
    <div aria-hidden className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-4 py-7 motion-safe:animate-pulse">
      <Heading />
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

export function StepBodySkeleton({ shape, aspect }: { shape: StepLoadingShape; aspect: PageAspect }) {
  if (shape === "list") return <ListSkeleton />
  if (shape === "report") return <ReportSkeleton />
  return <GridSkeleton aspect={aspect} />
}
