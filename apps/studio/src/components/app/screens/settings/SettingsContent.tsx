import { Outlet } from "@tanstack/react-router"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function SettingsContent({ fullWidth, wide }: { fullWidth: boolean; wide: boolean }) {
  if (fullWidth) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-[34px] pb-6 pt-6">
        <Outlet />
      </div>
    )
  }

  return (
    <ScrollArea className="flex min-h-0 flex-1 flex-col">
      <ScrollBar className="z-10" />
      <div className={cn("mx-auto w-full px-[34px] pb-14 pt-10", wide ? "max-w-[1240px]" : "max-w-[860px]")}>
        <Outlet />
      </div>
    </ScrollArea>
  )
}
