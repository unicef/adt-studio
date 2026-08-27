import { Trans } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type PublishPhase = "connect" | "configure" | "running" | "live"

const ORDER: readonly PublishPhase[] = ["connect", "configure", "running", "live"]

/**
 * Three beads and the line between them: connect an account, decide how to share, publish.
 *
 * The stepper is the answer to "how much is left", which a single button cannot give. It stays
 * on screen through the run — the loader replaces the *body*, not the map — so the author can
 * see where the machine has got to without reading the step list.
 *
 * Once the link is live the page swaps to a dashboard and drops the stepper: a map of a journey
 * already finished is just noise above the thing it led to. It comes back, with the beads it had
 * before, if sharing is ever stopped — `live` is still handled here for that reason.
 */
export function PublishingStepper({ phase }: { phase: PublishPhase }) {
  const current = ORDER.indexOf(phase)

  const steps = [
    { key: "connect", label: <Trans>Connect an account</Trans> },
    { key: "configure", label: <Trans>Decide how to share</Trans> },
    { key: "publish", label: <Trans>Publish</Trans> },
  ]

  return (
    <ol className="flex list-none items-center gap-1 p-0">
      {steps.map((step, index) => {
        /** The running phase is *inside* step three, so it counts as reached, not passed. */
        const reached = current >= index || phase === "live"
        const done = phase === "live" ? true : current > index
        const active = !done && reached

        return (
          <li key={step.key} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                "transition-colors duration-300 motion-reduce:transition-none",
                done
                  ? "bg-emerald-500 text-white"
                  : active
                    ? "bg-indigo-600 text-white"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {done ? (
                <Check
                  className="size-3.5 motion-safe:animate-in motion-safe:zoom-in-50"
                  aria-hidden="true"
                />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn(
                "shrink-0 text-xs font-medium transition-colors duration-300 motion-reduce:transition-none",
                done || active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "h-px min-w-4 flex-1 transition-colors duration-500 motion-reduce:transition-none",
                  done ? "bg-emerald-300" : "bg-border",
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
