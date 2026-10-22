import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ExternalLink, Maximize2, RotateCw } from "lucide-react"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { NO_DRAG_REGION } from "@/constants"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { PreviewSizeControls } from "./PreviewSizeControls"
import type { PreviewSize } from "./previewSize"

const ICON_BUTTON_CLASS =
  "grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"

export interface PreviewHeaderProps {
  src: string | null
  packaging: boolean
  device: Viewport
  size: PreviewSize
  onBack: () => void
  onRebuild: () => void
  onFullscreen: () => void
  onDeviceChange: (device: Viewport) => void
  onSizeChange: (size: PreviewSize) => void
}

export function PreviewHeader({
  src,
  packaging,
  device,
  size,
  onBack,
  onRebuild,
  onFullscreen,
  onDeviceChange,
  onSizeChange,
}: PreviewHeaderProps) {
  const { t } = useLingui()

  return (
    <header className="drag-region grid h-13 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b bg-card pl-3.5">
      <div style={NO_DRAG_REGION} className="flex items-center gap-1 justify-self-start">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-3.5" />
          <Trans>Storyboard</Trans>
        </button>
        <button
          type="button"
          onClick={onRebuild}
          disabled={packaging}
          aria-label={t`Rebuild the preview`}
          title={t`Rebuild the preview`}
          className={ICON_BUTTON_CLASS}
        >
          <RotateCw className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => src && window.open(src, "_blank", "noopener,noreferrer")}
          disabled={!src}
          aria-label={t`Open in the browser`}
          title={t`Open in the browser`}
          className={ICON_BUTTON_CLASS}
        >
          <ExternalLink className="size-4" />
        </button>
        <button
          type="button"
          onClick={onFullscreen}
          disabled={!src}
          aria-label={t`Full screen`}
          title={t`Full screen`}
          className={ICON_BUTTON_CLASS}
        >
          <Maximize2 className="size-4" />
        </button>
      </div>

      <div style={NO_DRAG_REGION}>
        <PreviewSizeControls
          device={device}
          size={size}
          onDeviceChange={onDeviceChange}
          onSizeChange={onSizeChange}
        />
      </div>

      <div className="flex h-full items-center justify-self-end">
        <TitleBarControls className="-my-px h-13" />
      </div>
    </header>
  )
}
