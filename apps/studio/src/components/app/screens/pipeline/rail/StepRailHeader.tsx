import { RailCollapseButton } from "./SideRail"

export function StepRailHeader({ children }: { children: React.ReactNode }) {
  return (
    <div data-chrome="railhead" className="-mx-3 -mt-3 flex h-11 shrink-0 items-center gap-1.5 border-b px-2.5">
      <RailCollapseButton className="size-7 rounded-md" />
      <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{children}</h2>
    </div>
  )
}
