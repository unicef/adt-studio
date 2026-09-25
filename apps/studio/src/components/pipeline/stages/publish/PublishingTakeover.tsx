import { useRef } from "react"
import type { BookPublishRunController } from "@/hooks/use-book-publication"
import { PublishStepArt } from "./run/art/PublishStepArt"
import { PublishRunShell } from "./run/PublishRunShell"
import { useElementSize } from "./run/useElementSize"

/** The height budget. Below the condensed line the artwork is dropped and the screen is the
 *  status band alone — an artwork small enough to be unreadable is decoration, and decoration is
 *  what this screen is specified not to have. */
const HEIGHT_FULL = 720
const HEIGHT_CONDENSED = 420

export interface PublishTakeoverProps {
  title: string
  /** The version readers stay on while an update runs. Null on a first publish, where there is
   *  nothing for them to stay on. */
  fromVersion: number | null
  run: BookPublishRunController
  elapsedMs: number
  /** The book whose pages the artwork draws, and whose config decides spread layout. */
  bookLabel: string
}

/**
 * The run, given the whole page.
 *
 * Three bands. A header whose second line carries the one sentence that matters — nothing is
 * shared until this finishes, or readers stay on version N. An artifact band showing the chosen
 * artwork for the step that is actually happening: Sheet Feed while the copy is made, the Gather
 * while it is packed, the Assembly Line while it uploads — the longest step, with the machine's
 * sight glass repeating the count — and Over the Spread while the link is registered, arriving
 * with the link row when the run finishes. And a status band that is the truth: the real
 * `{done} of {total} files` as the largest type on screen while the upload runs, a time-weighted
 * aggregate bar that never resets, the elapsed clock after twenty seconds, and Stop.
 *
 * A failure changes the copy and the colour and nothing else — the completed steps stay done, the
 * artwork parks where it stood, and the bar holds. That history is the evidence the author did
 * nothing wrong.
 *
 * A first publish and an update run the identical four steps and deserve the identical screen;
 * only the words differ, because the thing at stake differs.
 */
export function PublishingTakeover({
  title,
  fromVersion,
  run,
  elapsedMs,
  bookLabel,
}: PublishTakeoverProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const size = useElementSize(hostRef)

  const height = size?.height ?? null
  const showArt = height === null || height >= HEIGHT_CONDENSED

  return (
    <div ref={hostRef} data-testid="publish-takeover" className="flex min-h-0 flex-1 flex-col">
      <PublishRunShell
        title={title}
        fromVersion={fromVersion}
        run={run}
        elapsedMs={elapsedMs}
        onCancel={run.reset}
        compactHeader={height !== null && height < HEIGHT_FULL}
        showStepDetail={height === null || height >= HEIGHT_FULL}
        artifact={
          showArt
            ? () => (
                <PublishStepArt
                  run={run}
                  bookLabel={bookLabel}
                  shareUrl={run.result?.url ?? null}
                />
              )
            : null
        }
      />
    </div>
  )
}
