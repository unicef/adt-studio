import { useLingui } from "@lingui/react/macro"
import { HtmlEditor } from "adt-html-editor/shadcn"
import { StyleGestureTooltip } from "./inspection/StyleGestureTooltip"
import { usePosition } from "./position/PositionProvider"
import { useFreeTransform } from "./position/useFreeTransform"

export function FlowOverlay() {
  const { t } = useLingui()
  const transform = useFreeTransform()
  const transforming = usePosition()?.active ?? false

  return (
    <>
      {!transforming && <HtmlEditor.Canvas.FlowControls />}
      {!transforming && <HtmlEditor.Canvas.FlowToolbar />}
      {transform.active && (
        <div className="pointer-events-none absolute inset-0 z-[33] overflow-hidden">
          {transform.origin ? (
            <div data-transform-origin className="absolute border border-dashed border-teal-600/50" style={transform.origin} />
          ) : (
            <button
              type="button"
              onClick={transform.stop}
              className="pointer-events-auto absolute right-3 top-3 rounded-md border border-teal-500 bg-background px-3 py-1.5 text-xs text-teal-700 shadow-sm dark:text-teal-300"
            >
              {t`Done transforming`}
            </button>
          )}
        </div>
      )}
      <StyleGestureTooltip />
    </>
  )
}
