import { useEffect, useRef, useState, type ReactNode } from "react"
import { PUBLISH_STEPS } from "@adt/types"
import type { BookPublishRunController } from "@/hooks/use-book-publication"
import { cn } from "@/lib/utils"
import { useBookSpread } from "./useBookSpread"
import { usePageAspect } from "./usePageAspect"
import { usePreviewPages } from "./usePreviewPages"
import { SheetFeed } from "./export/SheetFeed"
import { GatherStack } from "./package/GatherStack"
import { OverTheSpread } from "./register/OverTheSpread"
import { AssemblyLine } from "./upload/AssemblyLine"
import { clamp01 } from "./upload/upload-common"
import { useRegisterPhase } from "./useRegisterPhase"

const UPLOAD_INDEX = PUBLISH_STEPS.findIndex((step) => step.id === "upload")
const CROSSFADE_MS = 400

/**
 * The box the object artworks live in: width-bounded so a wide card does not inflate them, and
 * height-bounded and centred so a tall band does not leave the drawing marooned at its top with a
 * page of dead air beneath. The Assembly Line never comes through here — its belt is meant to run
 * the card's full width.
 */
function ObjectStage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center">
      <div className="relative h-full max-h-[440px] w-full">{children}</div>
    </div>
  )
}

/**
 * The four chosen step artworks, keyed to a real run: Sheet Feed while the copy is made, the
 * Gather while it is packed, the Assembly Line while it uploads, Over the Spread while the link is
 * registered — and through done, where the spread lifts and the link row comes out from behind it.
 *
 * Step boundaries are a crossfade rather than a cut: the outgoing art fades over 400ms and is then
 * unmounted, so at most two artworks are ever alive and a step that finishes in 900ms cannot
 * flash. A failure changes nothing here — the failed step's art stays up, parked by its own stall
 * handling, because the artwork holding its place *is* the evidence that nothing was lost.
 *
 * The upload's fraction is held across the moment a failure nulls `run.progress`, for the same
 * reason: a sight glass that drained to zero on a 503 would be the screen subtracting work that
 * already happened.
 */
export function PublishStepArt({
  run,
  bookLabel,
  shareUrl,
  className,
}: {
  run: BookPublishRunController
  bookLabel: string | null
  shareUrl: string | null
  className?: string
}) {
  const pages = usePreviewPages(bookLabel)
  const aspect = usePageAspect(pages)
  const spread = useBookSpread(bookLabel)
  const registerPhase = useRegisterPhase(run.stepStates[PUBLISH_STEPS.length - 1], run.status)

  const running = run.stepStates.findIndex((state) => state === "running")
  const errored = run.stepStates.findIndex((state) => state === "error")
  const active =
    run.status === "done" ? PUBLISH_STEPS.length - 1 : running >= 0 ? running : Math.max(errored, 0)

  /* The last honest upload fraction, surviving the failure that nulls `run.progress`. */
  const held = useRef(0)
  useEffect(() => {
    if (run.progress && run.progress.total > 0) {
      held.current = Math.max(held.current, clamp01(run.progress.done / run.progress.total))
    }
    if (run.stepStates[UPLOAD_INDEX] === "pending") held.current = 0
  }, [run.progress, run.stepStates])
  const uploadProgress =
    run.progress && run.progress.total > 0
      ? clamp01(run.progress.done / run.progress.total)
      : held.current

  /* At most two layers: the active art, and the one it is fading out. */
  const [layers, setLayers] = useState<readonly { step: number; leaving: boolean }[]>([
    { step: active, leaving: false },
  ])
  useEffect(() => {
    setLayers((previous) => {
      const current = previous.find((layer) => !layer.leaving)
      if (current?.step === active) return previous
      return [
        ...previous.filter((layer) => layer.step !== active).map((layer) => ({ ...layer, leaving: true })),
        { step: active, leaving: false },
      ]
    })
    const sweep = setTimeout(
      () => setLayers((previous) => previous.filter((layer) => !layer.leaving)),
      CROSSFADE_MS + 60,
    )
    return () => clearTimeout(sweep)
  }, [active])

  return (
    <div className={cn("relative h-full w-full", className)}>
      {layers.map((layer) => {
        const id = PUBLISH_STEPS[layer.step]?.id
        return (
          <div
            key={layer.step}
            className={cn(
              "absolute inset-0 transition-opacity motion-reduce:transition-none",
              layer.leaving
                ? "opacity-0"
                : "opacity-100 motion-safe:animate-in motion-safe:fade-in-0",
            )}
            style={{ transitionDuration: `${CROSSFADE_MS}ms`, animationDuration: `${CROSSFADE_MS}ms` }}
          >
            {/* The object artworks sit in a bounded box so a wide card does not inflate them; the
                Assembly Line gets the whole band, because its belt is meant to run the card's full
                width — a conveyor that stops short of the edge is a video pasted into a slot. */}
            {id === "export" ? (
              <ObjectStage>
                <SheetFeed pages={pages} progress={null} aspect={aspect} spread={spread} />
              </ObjectStage>
            ) : id === "package" ? (
              <ObjectStage>
                <GatherStack pages={pages} progress={null} aspect={aspect} spread={spread} />
              </ObjectStage>
            ) : id === "upload" ? (
              <AssemblyLine
                pages={pages}
                progress={uploadProgress}
                aspect={aspect}
                spread={spread}
              />
            ) : (
              <ObjectStage>
                <OverTheSpread
                  pages={pages}
                  progress={null}
                  aspect={aspect}
                  spread={spread}
                  phase={registerPhase}
                  shareUrl={shareUrl}
                />
              </ObjectStage>
            )}
          </div>
        )
      })}
    </div>
  )
}
