import { PUBLISH_STEPS, type PublishStepId } from "@adt/types"
import type {
  PublishChecklistState,
  PublishRunStatus,
  PublishStepProgress,
} from "@/hooks/use-book-publication"

/**
 * One number for the whole run, and the only number anything on the screen is allowed to draw.
 *
 * The bar, the page grid and `aria-valuenow` are three renderings of this value, never three
 * opinions about it. That is the point: a grid that filled from its own clock while the bar filled
 * from the counts would eventually disagree with itself in front of somebody who is already
 * wondering whether the thing has hung.
 *
 * Weighted by *time*, not by step count. The upload is three quarters of a real run's wall clock
 * and the other three steps share the rest, so a bar that gave each step a quarter would reach 50%
 * in the first seconds and then sit still for three minutes — the exact shape users read as a
 * crash, and the exact shape the old `settled / 4` bar had.
 */
export const PUBLISH_STEP_WEIGHTS: Record<PublishStepId, number> = {
  export: 0.15,
  package: 0.05,
  upload: 0.75,
  register: 0.05,
}

/**
 * Time constants for the three steps that send no counts.
 *
 * An exponential approach rather than a linear ramp, because a linear one has to guess a duration
 * and is wrong twice: it either arrives early and stalls, or crawls and then jumps. This one is
 * always moving, always slowing, and is capped below 1 so a step can never walk into the next
 * step's territory on time alone — only the server saying "done" moves it there.
 */
export const UNCOUNTED_TAU_MS: Record<PublishStepId, number> = {
  export: 12_000,
  package: 6_000,
  upload: 6_000,
  register: 6_000,
}

/** The ceiling an uncounted step reaches on its own. */
export const UNCOUNTED_CEILING = 0.9

/** How often the value may be recomputed. The upload emits one event per file — 340 of them on a
 *  real book — and rendering each one is 340 layout passes for a bar that moves a third of a pixel. */
export const AGGREGATE_COALESCE_MS = 200

export interface AggregateSample {
  status: PublishRunStatus
  stepStates: readonly PublishChecklistState[]
  /** The running step's counts, when it has any. Only the upload ever does. */
  progress: PublishStepProgress | null
  /** Milliseconds the *current* step has been running, for the uncounted model. */
  stepElapsedMs: number
  /** The last value handed out, for the monotonic clamp. */
  previous: number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** `min(0.9, 1 − exp(−t / τ))` — §3.1's model for a step that reports nothing. */
export function uncountedFraction(stepId: PublishStepId, stepElapsedMs: number): number {
  const tau = UNCOUNTED_TAU_MS[stepId]
  if (!(stepElapsedMs > 0) || !(tau > 0)) return 0
  return Math.min(UNCOUNTED_CEILING, 1 - Math.exp(-stepElapsedMs / tau))
}

/** `done / total`, or null when the step is honestly indeterminate — including the degenerate
 *  `total: 0`, which would otherwise divide its way to NaN and paint the bar as empty forever. */
export function countedFraction(progress: PublishStepProgress | null): number | null {
  if (!progress || !(progress.total > 0)) return null
  return clamp01(progress.done / progress.total)
}

export function publishAggregate(sample: AggregateSample): number {
  const previous = clamp01(sample.previous)

  if (sample.status === "idle") return 0
  if (sample.status === "done") return 1

  let value = 0
  let runningIndex = -1

  PUBLISH_STEPS.forEach((step, index) => {
    const state = sample.stepStates[index]
    if (state === "done") value += PUBLISH_STEP_WEIGHTS[step.id]
    if (state === "running" && runningIndex === -1) runningIndex = index
  })

  const running = runningIndex === -1 ? null : PUBLISH_STEPS[runningIndex]
  if (running) {
    const fraction =
      countedFraction(sample.progress) ?? uncountedFraction(running.id, sample.stepElapsedMs)
    value += PUBLISH_STEP_WEIGHTS[running.id] * fraction
  }

  /* The clamp is what makes a failure survivable: nothing recomputes downwards, so a step that
     errors leaves the bar exactly where the author last saw it rather than emptying the three
     minutes they just watched. */
  return Math.max(previous, clamp01(value))
}

/** The integer the progressbar reports. Monotone because its input is. */
export function aggregatePercent(value: number): number {
  return Math.round(clamp01(value) * 100)
}
