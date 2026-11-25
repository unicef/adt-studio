import type { ReactNode } from "react"
import { Plural, Trans } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import type { EngineRun } from "../../../../../engine/useEngineRun"
import { Chip } from "../../bubbles"
import { Flipbook } from "./Flipbook"
import { MorphMark } from "./MorphMark"
import { ScanPages } from "./ScanPages"
import { ShimmerLine } from "./ShimmerLine"
import { SkeletonAnswer } from "./SkeletonAnswer"
import { TickSteps } from "./TickSteps"
import { useSeconds } from "./parts"
import "./loader.css"

/**
 * The reading message with one of the board's loader ideas (lab only): one sentence and
 * one visual, plus "Set it up myself" when it runs slow, as today.
 */
export function IdeaReading({ idea, file, pageCount, run, rec, onManual }: { idea: string; file: File; pageCount: number; run: EngineRun; rec: SetupRecommendation | null; onManual: () => void }) {
  const seconds = useSeconds(run)
  const done = !!rec
  const slow = run.status === "running" && run.slow
  const sentence = done ? <Trans>Done reading.</Trans> : slow ? <Trans>This is taking longer than usual. I&apos;ll keep at it.</Trans> : <Trans>Reading your book. This takes a few seconds.</Trans>
  const chip = slow && (
    <div>
      <Chip onClick={onManual}>
        <Trans>Set it up myself</Trans>
      </Chip>
    </div>
  )
  // The board's stage: the visual on its own, the words under it like its caption.
  const figure = (visual: ReactNode) => (
    <div className="flex flex-col items-start gap-4">
      <div className="py-1">{visual}</div>
      <div className="flex min-w-0 flex-col gap-2.5">
        <p>{sentence}</p>
        {chip}
      </div>
    </div>
  )
  const under = (visual: ReactNode) => (
    <div className="flex flex-col gap-3.5">
      <p>{sentence}</p>
      {visual}
      {chip}
    </div>
  )

  switch (idea) {
    case "c12":
      return figure(<ScanPages file={file} pageCount={pageCount} />)
    case "c13":
      return (
        <div className="flex flex-col gap-2.5">
          <ShimmerLine seconds={seconds} under={<Plural value={pageCount} one="# page" other="# pages" />}>
            {slow ? sentence : <Trans>Reading your book</Trans>}
          </ShimmerLine>
          {chip}
        </div>
      )
    case "c14":
      return under(<TickSteps seconds={seconds} done={done} />)
    case "c15":
      return under(<SkeletonAnswer file={file} pageCount={pageCount} rec={rec} />)
    case "c16":
      return figure(<Flipbook file={file} pageCount={pageCount} />)
    case "c17":
      return figure(<MorphMark />)
    default:
      return null
  }
}
