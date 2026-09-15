import { Trans } from "@lingui/react/macro"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The way out of a run, and the question it has to ask first.
 *
 * Two stages rather than one, because the click is cheap and the consequence is not: the button
 * sits under a screen somebody has been watching for two minutes, and a single tap that throws
 * that away is a trap. Armed, it says what stopping costs and offers the other answer first.
 *
 * The wording is about *this run*, not about the book: stopping abandons an upload, it does not
 * unshare anything already live.
 */
export function CancelControl({
  onCancel,
  align = "start",
  emphasis = "quiet",
  className,
}: {
  onCancel: () => void
  align?: "start" | "center" | "end"
  /** `primary` after two minutes of a silent step: the run is untouched and nothing about it has
   *  gone wrong, but by then the useful thing to make obvious is the way out. */
  emphasis?: "quiet" | "primary"
  className?: string
}) {
  const [armed, setArmed] = useState(false)

  return (
    <div
      data-testid="publish-cancel"
      data-armed={armed}
      className={cn(
        "flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1",
        align === "center" && "justify-center",
        align === "end" && "justify-end",
        className,
      )}
    >
      {armed ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2 motion-safe:duration-200">
          <span className="text-sm text-muted-foreground">
            <Trans>Stop publishing? Nothing sent so far is kept.</Trans>
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setArmed(false)}>
            <Trans>Keep going</Trans>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={() => {
              setArmed(false)
              onCancel()
            }}
          >
            <Trans>Stop</Trans>
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant={emphasis === "primary" ? "outline" : "ghost"}
          size="sm"
          className={cn(
            "h-8 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
            emphasis === "primary"
              ? "border-foreground/25 font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setArmed(true)}
        >
          <Trans>Stop</Trans>
        </Button>
      )}
    </div>
  )
}
