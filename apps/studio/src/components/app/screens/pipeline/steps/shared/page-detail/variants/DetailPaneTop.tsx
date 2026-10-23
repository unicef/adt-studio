import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function DetailPaneTop({ image, children }: { image: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <span className="flex-1">{open ? <Trans>Hide the page</Trans> : <Trans>Show the page</Trans>}</span>
          <ChevronDown className={cn("size-3.5 transition-transform duration-300 motion-reduce:transition-none", open && "rotate-180")} />
        </button>
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
          inert={!open}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mx-auto max-h-[360px] w-full max-w-[560px] overflow-hidden p-3 [&_img]:max-h-[336px] [&_img]:w-auto [&_img]:mx-auto">
              {image}
            </div>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  )
}
