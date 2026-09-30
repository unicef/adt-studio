import { useAtom } from "jotai"
import {
  dockAlignAtom,
  dockPositionAtom,
  dockWidthAtom,
  type DockAlign,
  type DockPosition,
  type DockWidth,
} from "@/shared/state/ui.atoms"
import { useTranslation } from "@/features/language/hooks/useTranslation"
import { useIsMobile } from "@/shared/hooks/use-is-mobile"
import { trackToggleEvent } from "@/shared/lib/analytics"
import { cn } from "@/shared/lib/utils"
import { SegmentedRow } from "@/features/settings/components/SegmentedRow"


export function DockLayoutPicker() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [position, setPosition] = useAtom(dockPositionAtom)
  const [width, setWidth] = useAtom(dockWidthAtom)
  const [align, setAlign] = useAtom(dockAlignAtom)

  const dockPosition = position as DockPosition
  const dockWidth = width as DockWidth
  const dockAlign = align as DockAlign

  const setPos = (next: DockPosition) => {
    trackToggleEvent(`DockPosition:${next}`, true)
    setPosition(next)
  }
  const setW = (next: DockWidth) => {
    trackToggleEvent(`DockWidth:${next}`, true)
    setWidth(next)
  }
  const setA = (next: DockAlign) => {
    trackToggleEvent(`DockAlign:${next}`, true)
    setAlign(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <SegmentedRow
          label={t("dock-layout-preview") || "Dock layout preview"}
          value={dockPosition}
          options={[
            { value: "top", label: t("dock-position-top") || "Top" },
            { value: "bottom", label: t("dock-position-bottom") || "Bottom" },
          ]}
          onChange={setPos}
        />
        {!isMobile ? (
          <>
            <SegmentedRow
              label={t("dock-width-label") || "Width"}
              value={dockWidth}
              options={[
                { value: "compact", label: t("dock-width-compact") || "Compact" },
                { value: "full", label: t("dock-width-full") || "Full" },
              ]}
              onChange={setW}
            />
            <SegmentedRow
              label={t("dock-align-label") || "Alignment"}
              value={dockAlign}
              options={[
                { value: "center", label: t("dock-align-center") || "Center" },
                { value: "spread", label: t("dock-align-spread") || "Spread" },
              ]}
              onChange={setA}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
