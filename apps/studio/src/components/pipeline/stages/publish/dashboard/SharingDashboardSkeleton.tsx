import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

/**
 * The dashboard's own shape while a shared book's status is on its way: the hero with its cover,
 * title and hand-out, the tabs, and the overview's panels — so nothing jumps when it lands.
 */
export function SharingDashboardSkeleton() {
  const { t } = useLingui()
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t`Loading the shared link`}
      className="flex min-h-0 flex-1 flex-col gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 [@media(max-height:820px)]:gap-3"
    >
      <section className="shrink-0 overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
          <div className="flex items-start gap-5 px-6 py-5 [@media(max-height:820px)]:py-4">
            <Bone className="h-[92px] w-[70px] shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">
              <Bone className="h-5 w-14 rounded-full" />
              <Bone className="h-7 w-3/5" />
              <Bone className="h-3.5 w-48" />
              <Bone className="h-3.5 w-64" />
            </div>
          </div>
          <div className="flex flex-col gap-3 border-l bg-muted/30 px-6 py-5 [@media(max-height:820px)]:py-4">
            <Bone className="h-3 w-24" />
            <Bone className="h-9 w-44" />
            <div className="flex gap-2">
              <Bone className="h-10 flex-1 rounded-md" />
              <Bone className="h-10 w-28 rounded-md" />
              <Bone className="h-10 w-10 rounded-md" />
            </div>
            <Bone className="h-3 w-56" />
          </div>
        </div>
      </section>

      <div className="flex h-10 shrink-0 items-center gap-6 border-b px-3">
        <Bone className="h-3.5 w-20" />
        <Bone className="h-3.5 w-24" />
        <Bone className="h-3.5 w-20" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
          <PanelBones rows={4} />
          <div className="grid min-h-0 grid-rows-2 gap-4">
            <PanelBones rows={2} />
            <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card">
              <header className="flex h-12 shrink-0 items-center border-b px-4">
                <Bone className="h-3.5 w-24" />
              </header>
              <div className="flex flex-1 flex-col justify-center gap-3 px-5 py-4">
                <div className="flex items-end justify-between gap-3">
                  <Bone className="h-10 w-28" />
                  <Bone className="h-8 w-24 rounded-md" />
                </div>
                <Bone className="h-1.5 w-full rounded-full" />
              </div>
            </section>
          </div>
        </div>
        <div className="flex h-10 shrink-0 items-center gap-3 rounded-xl border bg-card px-4">
          <Bone className="size-4 rounded-full" />
          <Bone className="h-3 w-20" />
          <Bone className="h-3 w-28" />
          <Bone className="h-3 w-32" />
        </div>
      </div>
    </div>
  )
}

function PanelBones({ rows }: { rows: number }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <Bone className="h-3.5 w-28" />
      </header>
      <ul className="flex list-none flex-col divide-y overflow-hidden p-0">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-start gap-3 px-4 py-3">
            <Bone className="size-7 shrink-0 rounded-full" />
            <span className="flex flex-1 flex-col gap-2 pt-0.5">
              <Bone className="h-3 w-1/3" />
              <Bone className="h-3 w-4/5" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Bone({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block rounded bg-muted motion-safe:animate-pulse", className)} />
}
