import { useLingui } from "@lingui/react/macro"
import { Check, Minus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatElapsed } from "@/lib/elapsed"
import { isSettled, STATE_WORD, type RailBodyProps } from "./rail-shared"

/** Bloom — the highlight is a circle, concentric with the station it belongs to, and the icon
 *  grows into it. Nothing rectangular is introduced: the rail is made of discs, so the thing
 *  that marks the live one is a disc too.
 *
 *  The circle is a fixed-size element that scales, and the disc sits in a fixed-height slot,
 *  so neither the growth nor the icon change moves a sibling. */
export function RailBloom({
  steps,
  status,
  stepStates,
  testIdPrefix,
  focused,
  finished,
  failedAt,
  durations,
}: RailBodyProps) {
  const { i18n, t } = useLingui()
  const total = steps.length
  /** Only a step in flight gets narrated. The step that stopped never did its work, so
   *  describing it in the active voice would claim something that did not happen. */
  const narrated = status === "running" && focused >= 0 ? steps[focused] : undefined

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[39px] flex"
          style={{ paddingInline: `${50 / Math.max(total, 1)}%` }}
        >
          {steps.slice(0, -1).map((step, index) => {
            const cut = failedAt >= 0 && index === failedAt
            const beyond = failedAt >= 0 && index > failedAt
            return (
              <span
                key={step.id}
                className={cn(
                  "h-0.5 flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none",
                  cut && "bg-transparent",
                  beyond &&
                    "bg-[repeating-linear-gradient(90deg,var(--color-border)_0_4px,transparent_4px_8px)]",
                  !cut && !beyond && "bg-border/70",
                )}
              >
                <span
                  style={{ width: isSettled(stepStates[index] ?? "pending") ? "100%" : "0%" }}
                  className={cn(
                    "block h-full rounded-full transition-[width] duration-700 ease-out",
                    "motion-reduce:transition-none",
                    finished ? "bg-emerald-500" : "bg-brand-500",
                  )}
                />
              </span>
            )
          })}
        </div>

        <ol
          aria-label={t`Setup steps`}
          className="relative grid min-h-[9rem]"
          style={{ gridTemplateColumns: `repeat(${Math.max(total, 1)}, minmax(0, 1fr))` }}
        >
          {steps.map((step, index) => {
            const state = stepStates[index] ?? "pending"
            const stalled = failedAt >= 0 && index > failedAt
            const front = focused === index
            const took = durations[index]
            const Icon = step.icon

            return (
              <li
                key={step.id}
                data-testid={`${testIdPrefix}-${step.number}`}
                data-step-id={step.id}
                data-state={state}
                className="flex flex-col items-center"
              >
                <span className="relative flex h-20 w-full items-center justify-center">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full",
                      "transition-[transform,opacity,background-color] duration-[600ms]",
                      "ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
                      front ? "scale-100 opacity-100" : "scale-90 opacity-0",
                      state === "error"
                        ? "bg-destructive/10 ring-1 ring-destructive/20"
                        : "bg-brand-500/10 ring-1 ring-brand-500/15",
                    )}
                  />

                  {status === "running" && state === "running" && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2",
                        "rounded-full border-2 border-brand-500/20 border-t-brand-500",
                        "motion-safe:animate-spin motion-reduce:opacity-50",
                      )}
                    />
                  )}

                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative flex items-center justify-center rounded-full",
                      "transition-all duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
                      "motion-reduce:transition-none",
                      front ? "size-11" : "size-7",
                      state === "pending" && "bg-card text-muted-foreground/60 ring-1 ring-border",
                      state === "skipped" &&
                        "border border-dashed border-border bg-card text-muted-foreground",
                      state === "done" &&
                        (finished ? "bg-emerald-500 text-white" : "bg-brand-500 text-white"),
                      state === "running" && "bg-brand-500 text-white",
                      state === "error" && "bg-destructive text-white",
                      stalled && "opacity-40",
                    )}
                  >
                    {state === "done" ? (
                      <Check className={front ? "size-5" : "size-3.5"} aria-hidden="true" />
                    ) : state === "error" ? (
                      <X className={front ? "size-5" : "size-4"} aria-hidden="true" />
                    ) : state === "skipped" ? (
                      <Minus className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Icon
                        className={cn(
                          "transition-[width,height] duration-[600ms] motion-reduce:transition-none",
                          front ? "size-5" : "size-3.5",
                        )}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </span>

                <span
                  className={cn(
                    "mt-1 line-clamp-2 min-h-8 px-1.5 text-center text-[11px] leading-4",
                    "transition-colors duration-[600ms] motion-reduce:transition-none",
                    front && "text-foreground",
                    state === "error" && "text-destructive",
                    !front && state === "done" && "text-foreground/80",
                    !front && state !== "done" && state !== "error" && "text-muted-foreground",
                    stalled && "opacity-40",
                  )}
                >
                  {i18n._(step.title)}
                </span>

                <span
                  aria-hidden="true"
                  className="h-3 text-[10px] leading-3 tabular-nums text-muted-foreground/70"
                >
                  {took !== null ? formatElapsed(took) : ""}
                </span>

                <span className="sr-only">{i18n._(STATE_WORD[state])}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <p
        key={narrated?.id ?? status}
        {...(status === "running"
          ? { role: "status" as const, "aria-live": "polite" as const }
          : {})}
        className={cn(
          "mt-3 flex min-h-[1.25rem] items-center justify-center text-center",
          "text-[12px] leading-5 text-muted-foreground",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500",
        )}
      >
        {narrated ? i18n._(narrated.detail) : ""}
      </p>
    </div>
  )
}
