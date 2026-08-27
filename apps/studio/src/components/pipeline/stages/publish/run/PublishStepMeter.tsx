import { PUBLISH_STEP_COPY } from "@/components/pipeline/stages/publish/publish-steps"
import type { PublishChecklistState } from "@/hooks/use-book-publication"
import { cn } from "@/lib/utils"

/**
 * Four steps as four dots.
 *
 * The vertical rail it replaces cost about 180px and said the same thing twice — where we are, and
 * how far along — while the aggregate bar underneath already said the second part. In a 560px
 * window those 180px are the whole difference between a page grid you can read and a strip of
 * confetti.
 *
 * Dots rather than the full-width segments this started as, and the reason is worth keeping. Four
 * equal bars spanning the card *are* a progress bar to the eye whether or not they ever fill: two
 * green and one indigo reads as "about 60% through" at the exact moment the real bar underneath
 * reads 20%, because the upload is three quarters of the work and the first two steps are a fifth
 * of it between them. Two contradicting readouts is worse than one, and the one that has to win is
 * the one weighted by time. Dots carry position without implying proportion — they occupy no
 * measurable share of anything, so there is nothing to misread them against.
 *
 * Colour only, never size: a dot that grew would put the proportion back.
 *
 * Hidden from assistive technology on purpose. The step is named in the live region when it
 * changes and in the progressbar's `aria-valuetext` on demand; a third copy of it is noise.
 */
export function PublishStepMeter({
  states,
  className,
}: {
  states: readonly PublishChecklistState[]
  className?: string
}) {
  return (
    <ol
      aria-hidden="true"
      data-testid="publish-step-meter"
      className={cn("flex h-4 list-none items-center gap-1.5 p-0", className)}
    >
      {PUBLISH_STEP_COPY.map((step, index) => {
        const state = states[index] ?? "pending"
        return (
          <li
            key={step.id}
            data-state={state}
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors duration-[240ms] ease-out motion-reduce:transition-none",
              state === "done"
                ? "bg-emerald-500"
                : state === "error"
                  ? "bg-destructive"
                  : state === "running"
                    ? "bg-indigo-600 ring-4 ring-indigo-600/15"
                    : "bg-zinc-200",
            )}
          />
        )
      })}
    </ol>
  )
}
