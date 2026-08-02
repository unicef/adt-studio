import { useState } from "react"
import { LayoutGrid, type LucideIcon } from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "@/shared/ui/sheet"
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

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          container={getChromePortalContainer() ?? undefined}
          overlayClassName="z-[60]"
          className="z-[60] gap-3 rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div
            aria-hidden
            className="mx-auto h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25"
          />
          <SheetTitle className="text-base">{label}</SheetTitle>
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
        </SheetContent>
      </Sheet>
    </>
  )
}
