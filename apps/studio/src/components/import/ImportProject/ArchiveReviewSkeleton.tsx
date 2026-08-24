import { cn } from "@/lib/utils"

export function ArchiveReviewSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid min-h-0 w-full flex-1 grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-[minmax(0,1fr)_240px]"
    >
      <div className="motion-safe:animate-pulse">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="h-5 w-28 rounded-full bg-slate-100" />
          <div className="mt-3 h-6 w-56 rounded bg-slate-200" />
        </div>
        <div className="p-5 pt-3">
          <div className="grid h-10 grid-cols-3 gap-1 rounded-md bg-slate-100 p-1">
            <div className="rounded bg-white shadow-sm" />
            <div className="rounded bg-slate-100" />
            <div className="rounded bg-slate-100" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="h-16 rounded-lg bg-slate-100" />
            <div className="h-16 rounded-lg bg-slate-100" />
            <div className="h-16 rounded-lg bg-slate-100" />
          </div>
          <div className="mt-4 h-24 rounded-lg bg-slate-100" />
        </div>
      </div>
      <div className="hidden items-center justify-center border-l border-slate-200 bg-slate-50/80 p-6 md:flex">
        <div className="aspect-[3/4] w-40 rounded-md bg-slate-200 motion-safe:animate-pulse" />
      </div>
    </div>
  )
}

