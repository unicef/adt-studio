import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import {
  AiGeneratedThumb,
  DynamicOverlayThumb,
  SingleColumnThumb,
  StrategyThumbPaper,
  TwoColumnStoryThumb,
} from "./RenderStrategyThumb"

export function RenderStrategyVisual() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <ThumbnailFrame label={<Trans>One Column</Trans>}>
        <SingleColumnThumb />
      </ThumbnailFrame>
      <ThumbnailFrame label={<Trans>AI Generated</Trans>}>
        <AiGeneratedThumb />
      </ThumbnailFrame>
      <ThumbnailFrame label={<Trans>Dynamic Overlay</Trans>}>
        <DynamicOverlayThumb />
      </ThumbnailFrame>
      <ThumbnailFrame label={<Trans>Two Column</Trans>}>
        <TwoColumnStoryThumb />
      </ThumbnailFrame>
    </div>
  )
}

function ThumbnailFrame({
  label,
  children,
}: {
  label: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <StrategyThumbPaper>{children}</StrategyThumbPaper>
      <span className="text-[10px] font-medium leading-none text-[#525252]">
        {label}
      </span>
    </div>
  )
}
