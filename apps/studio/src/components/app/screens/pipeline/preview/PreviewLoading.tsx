import { Trans } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type PreviewLoadingPhase = "building" | "loading"

export interface PreviewLoadingProps {
  phase: PreviewLoadingPhase | null
}

const BAR_CLASS = "rounded-md bg-foreground/[0.06] animate-pulse motion-reduce:animate-none"

export function PreviewLoading({ phase }: PreviewLoadingProps) {
  return (
    <div
      aria-hidden={!phase}
      className={cn(
        "absolute inset-0 flex flex-col overflow-hidden bg-white transition-opacity duration-300 ease-out",
        phase ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="flex flex-1 flex-col gap-5 p-8">
        <div className={cn(BAR_CLASS, "h-3 w-1/4")} />
        <div className={cn(BAR_CLASS, "h-6 w-3/4")} />
        <div className="flex flex-col gap-2.5">
          <div className={cn(BAR_CLASS, "h-2.5 w-full")} />
          <div className={cn(BAR_CLASS, "h-2.5 w-11/12")} />
          <div className={cn(BAR_CLASS, "h-2.5 w-4/6")} />
        </div>
        <div className={cn(BAR_CLASS, "min-h-8 flex-1 rounded-xl")} />
      </div>

      <div className="absolute inset-0 grid place-items-center p-4">
        <div
          role="status"
          className="flex max-w-xs items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
        >
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">
              {phase === "building" ? <Trans>Building the preview</Trans> : <Trans>Loading the page</Trans>}
            </p>
            {phase === "building" && (
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                <Trans>Packaging the book so the preview shows exactly what the reader gets.</Trans>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
