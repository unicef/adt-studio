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
  /** Keep the sheet open after activating — for in-place toggles (sign language)
   *  where the user should see the state flip. Panels close the sheet so their
   *  own bottom sheet can take over. */
  keepOpen?: boolean
  onSelect: () => void
}

/** Mobile replacement for the dock's feature-icon row: a single launcher that
 *  opens a bottom sheet grid of every feature, keeping full-size touch targets
 *  on phones where five inline icons wouldn't fit alongside nav + contents. */
export function DockMobileTools({
  tools,
  label,
}: {
  tools: DockTool[]
  label: string
}) {
  const [open, setOpen] = useState(false)

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
          <div className="grid grid-cols-4 gap-2">
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
                    "flex flex-col items-center justify-center gap-1.5 rounded-xl p-3 text-center transition-colors",
                    "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    tool.active && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon className="size-6" />
                  <span className="text-xs font-medium leading-tight">
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
