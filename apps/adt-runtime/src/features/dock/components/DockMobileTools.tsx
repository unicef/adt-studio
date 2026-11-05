import { useState } from "react"
import { LayoutGrid, type LucideIcon } from "lucide-react"
import { Drawer, DrawerContent, DrawerTitle } from "@/shared/ui/drawer"
import { DockIconButton } from "@/features/dock/components/DockIconButton"
import { getChromePortalContainer } from "@/shared/lib/chrome-portal"
import { cn } from "@/shared/lib/utils"

export interface DockTool {
  key: string
  label: string
  icon: LucideIcon
  active?: boolean
  keepOpen?: boolean
  onSelect: () => void
}

export function DockMobileTools({
  tools,
  label,
}: {
  tools: DockTool[]
  label: string
}) {
  const [open, setOpen] = useState(false)
  const tileWidth =
    tools.length === 3 ? "w-[calc(33.333%-0.4rem)]" : "w-[calc(50%-0.25rem)]"

  return (
    <>
      <DockIconButton
        ariaLabel={label}
        pressed={open}
        onClick={() => setOpen(true)}
      >
        <LayoutGrid />
      </DockIconButton>

      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
        <DrawerContent
          container={getChromePortalContainer() ?? undefined}
          overlayClassName="z-[60] bg-transparent supports-backdrop-filter:backdrop-blur-none"
          viewportClassName="z-[60]"
          className="rounded-t-2xl shadow-lg"
        >
          <div className="flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DrawerTitle className="text-base">{label}</DrawerTitle>
            <div className="flex flex-wrap justify-center gap-2">
              {tools.map((tool) => {
                const Icon = tool.icon
                return (
                  <button
                    key={tool.key}
                    type="button"
                    aria-pressed={tool.active}
                    onClick={() => {
                      tool.onSelect()
                      if (!tool.keepOpen) setOpen(false)
                    }}
                    className={cn(
                      "flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl p-3 text-center transition-colors",
                      tileWidth,
                      "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      tool.active && "bg-accent text-accent-foreground",
                    )}
                  >
                    <Icon className="size-6" />
                    <span className="text-sm font-medium leading-tight">
                      {tool.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
