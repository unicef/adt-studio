import type { ReactNode } from "react"
import { Outlet } from "@tanstack/react-router"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

export function SettingsContent({
  fullWidth,
  children,
}: {
  fullWidth: boolean
  children?: ReactNode
}) {
  const body = children ?? <Outlet />

  if (fullWidth) {
    return <div className="flex min-h-0 flex-1 flex-col px-[34px] pb-6 pt-6">{body}</div>
  }

  return (
    <ScrollArea className="flex min-h-0 flex-1 flex-col">
      <ScrollBar className="z-10" />
      <div className="mx-auto w-full max-w-[860px] px-[34px] pb-14 pt-10">{body}</div>
    </ScrollArea>
  )
}
