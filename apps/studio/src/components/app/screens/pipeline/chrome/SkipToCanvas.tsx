import { Trans } from "@lingui/react/macro"
import { NO_DRAG_REGION } from "@/constants"

export function SkipToCanvas() {
  return (
    <button
      type="button"
      style={NO_DRAG_REGION}
      onClick={() => document.getElementById("pipeline-canvas")?.focus()}
      className="sr-only rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background shadow-lg focus:not-sr-only focus:absolute focus:left-2 focus:top-[calc(100%+4px)] focus:z-50 focus:inline-flex focus:h-8 focus:items-center"
    >
      <Trans>Skip to the canvas</Trans>
    </button>
  )
}
