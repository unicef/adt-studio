import { useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { PUBLISH_STEP_COPY } from "@/components/pipeline/stages/publish/publish-steps"
import type { BookPublishRunController } from "@/hooks/use-book-publication"

/** Four step transitions, three upload milestones, one ending. */
export const MAX_ANNOUNCEMENTS = 8
export const MIN_ANNOUNCEMENT_GAP_MS = 10_000

export interface PublishAnnouncement {
  message: string
  /** True only after a terminal failure, which is the one interruption this screen is allowed. */
  assertive: boolean
}

/**
 * What a screen reader hears, and — far more importantly — what it does not.
 *
 * `role="progressbar"` is not a live region, so the value changes are silent and a separate polite
 * region is required. Wiring that region to the stream directly would announce every file: 340
 * interruptions on a real book, during which the screen-reader user cannot use the rest of the
 * application at all. So the region speaks at most eight times in a run — one per step, three
 * across the upload, one at the end — and everything else is available on demand from the
 * progressbar's `aria-valuetext`, which is polled rather than pushed.
 *
 * Anything arriving inside the ten-second floor is dropped rather than queued. A queue would keep
 * talking after the thing it is describing has changed, which is worse than silence.
 */
export function usePublishAnnouncer(
  run: BookPublishRunController,
  { title }: { title: string },
): PublishAnnouncement {
  const { i18n, t } = useLingui()
  const [announcement, setAnnouncement] = useState<PublishAnnouncement>({
    message: "",
    assertive: false,
  })

  const spokenRef = useRef(0)
  /* Negative infinity, not zero: `performance.now()` is milliseconds since the page loaded, so a
     zero sentinel means "announced at page load" and silently swallows the first utterance of any
     run that starts inside the first ten seconds of the window's life. */
  const lastAtRef = useRef(Number.NEGATIVE_INFINITY)
  const lastCueRef = useRef<string | null>(null)
  const wasRunningRef = useRef(false)

  const runningIndex = run.stepStates.findIndex((state) => state === "running")
  const uploadRatio =
    run.progress && run.progress.total > 0 ? run.progress.done / run.progress.total : null
  /* Quarters of the *upload*, not of the whole run: the upload is the only stretch long enough to
     need waypoints, and a milestone measured against the aggregate would land three of its four
     announcements inside the same step anyway. */
  const uploadMilestone =
    uploadRatio === null ? 0 : Math.min(3, Math.max(0, Math.floor(uploadRatio * 4)))

  const cue =
    run.status === "done"
      ? "done"
      : run.status === "error"
        ? "failed"
        : run.status !== "running" || runningIndex < 0
          ? null
          : uploadMilestone > 0
            ? `${runningIndex}:${uploadMilestone}`
            : `${runningIndex}`

  /* A retry gets its own eight utterances. The budget belongs to a run, not to a session — an
     author who publishes twice is not asking to be told less the second time. */
  useEffect(() => {
    const running = run.status === "running"
    if (running && !wasRunningRef.current) {
      spokenRef.current = 0
      lastAtRef.current = Number.NEGATIVE_INFINITY
      lastCueRef.current = null
    }
    wasRunningRef.current = running
  }, [run.status])

  useEffect(() => {
    if (cue === null) {
      lastCueRef.current = null
      return
    }
    if (cue === lastCueRef.current) return

    const terminal = cue === "done" || cue === "failed"
    const now = performance.now()
    const tooSoon = now - lastAtRef.current < MIN_ANNOUNCEMENT_GAP_MS
    const spentBudget = spokenRef.current >= MAX_ANNOUNCEMENTS

    /* Progress cues are dropped rather than queued: by the time the floor expires the thing they
       described has moved on, and a live region talking about the recent past is worse than one
       that said nothing. The ending is the exception in both directions — it never goes stale, and
       it is the only utterance the whole run exists to make — so it is held back to the floor
       rather than thrown away, and it is allowed past the budget. */
    if (!terminal && (tooSoon || spentBudget)) {
      lastCueRef.current = cue
      return
    }

    /* `t` is called by name, never through an alias or a ref. The Lingui macro rewrites the tagged
       template at compile time by looking for that identifier, so `const translate = t` silently
       produces a runtime call the macro never saw and an empty string at the other end. */
    const stepTitle =
      runningIndex >= 0 && PUBLISH_STEP_COPY[runningIndex]
        ? i18n._(PUBLISH_STEP_COPY[runningIndex].title)
        : ""

    const sent = run.progress?.done ?? 0
    const outOf = run.progress?.total ?? 0
    const stepNumber = runningIndex + 1
    const stepCount = PUBLISH_STEP_COPY.length

    const message =
      cue === "done"
        ? run.kind === "publish"
          ? t`${title} is online.`
          : t`${title} is updated. The link now shows your latest version.`
        : cue === "failed"
          ? run.kind === "publish"
            ? t`Publishing ${title} stopped. Nothing has been shared.`
            : t`Publishing ${title} stopped. Your readers are still on the copy they had.`
          : uploadMilestone > 0 && run.progress
            ? t`${stepTitle}. ${sent} of ${outOf} sent.`
            : t`${stepTitle}. Step ${stepNumber} of ${stepCount}.`

    const speak = () => {
      spokenRef.current += 1
      lastAtRef.current = performance.now()
      setAnnouncement({ message, assertive: cue === "failed" })
    }

    lastCueRef.current = cue

    if (!tooSoon) {
      speak()
      return
    }

    const timer = setTimeout(speak, MIN_ANNOUNCEMENT_GAP_MS - (now - lastAtRef.current))
    return () => clearTimeout(timer)
  }, [cue, i18n, run.kind, run.progress, run.status, runningIndex, t, title, uploadMilestone])

  return announcement
}
