import { Trans } from "@lingui/react/macro"
import { StepEmptyHint } from "../shared/ui"
import { NOT_PLACED, type VideoFilter } from "./useSignLanguageModel"

export function VideoFilterEmpty({ filter, onShowAll }: { filter: VideoFilter; onShowAll: () => void }) {
  return (
    <StepEmptyHint>
      <span className="flex flex-col items-center gap-2 animate-in fade-in duration-200 motion-reduce:animate-none">
        {filter === NOT_PLACED ? <Trans>Every video is on a page.</Trans> : <Trans>No videos on page {filter} any more.</Trans>}
        <button type="button" onClick={onShowAll} className="font-medium text-foreground underline-offset-4 transition-colors hover:underline">
          <Trans>Show all videos</Trans>
        </button>
      </span>
    </StepEmptyHint>
  )
}
