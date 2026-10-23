import { useState, type ReactNode } from "react"
import { FileImage, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function DetailPanePeek({ image, children }: { image: ReactNode; children: ReactNode }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex flex-col gap-4">
      {children}
      <div className="pointer-events-none sticky bottom-32 z-20 flex justify-end">
        <div
          className={cn(
            "pointer-events-auto w-[320px] origin-bottom-right overflow-hidden rounded-xl border bg-card shadow-lg transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
            open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
          )}
          inert={!open}
        >
          <div className="flex items-center justify-between border-b px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground">
            <Trans>Page</Trans>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t`Hide the page`}
              className="grid size-6 place-items-center rounded transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="p-2">{image}</div>
        </div>
      </div>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-32 right-10 z-20 flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-[12.5px] font-medium shadow-md transition-colors hover:bg-muted animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
        >
          <FileImage className="size-3.5" />
          <Trans>Show page</Trans>
        </button>
      )}
    </div>
  )
}
