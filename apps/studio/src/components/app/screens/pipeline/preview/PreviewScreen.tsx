import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { Minimize2 } from "lucide-react"
import { getAdtUrl } from "@/api/client"
import { useAdtPages } from "@/hooks/use-adt-pages"
import { previewHrefForSection } from "@/components/app/screens/pipeline/shared/previewTarget"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { PreviewFrame } from "./PreviewFrame"
import { PreviewHeader } from "./PreviewHeader"
import { PreviewStatusPanel } from "./PreviewStatusPanel"
import { DEVICE_SIZE, type PreviewSize } from "./previewSize"
import { usePreviewFullscreen } from "./usePreviewFullscreen"
import { usePreviewPackage } from "./usePreviewPackage"

export interface PreviewScreenProps {
  label: string
  targetSectionId: string | null
  targetHref?: string | null
  onBack: () => void
}

export function PreviewScreen({ label, targetSectionId, targetHref, onBack }: PreviewScreenProps) {
  const [device, setDevice] = useState<Viewport>("desktop")
  const [size, setSize] = useState<PreviewSize>(DEVICE_SIZE.desktop)
  const fullscreen = usePreviewFullscreen()

  const pkg = usePreviewPackage(label, true)
  const packaged = pkg.status === "ready" && pkg.version !== null

  const needsManifest = !targetHref && !!targetSectionId
  const manifestQuery = useAdtPages(label, { enabled: packaged && needsManifest })
  const targetResolved = !needsManifest || manifestQuery.isSuccess || manifestQuery.isError
  const href = targetHref ?? previewHrefForSection(targetSectionId, manifestQuery.data) ?? ""
  const src = packaged && targetResolved ? `${getAdtUrl(label)}/v-${pkg.version}/${href}` : null

  const selectDevice = (next: Viewport) => {
    setDevice(next)
    setSize(DEVICE_SIZE[next])
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {fullscreen.fullscreen ? (
        <button
          type="button"
          onClick={fullscreen.exit}
          className="absolute top-3 left-3 z-10 flex h-8 items-center gap-1.5 rounded-lg border bg-card/90 px-2.5 text-[13px] font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-card"
        >
          <Minimize2 className="size-3.5" />
          <Trans>Exit full screen</Trans>
        </button>
      ) : (
        <PreviewHeader
          src={src}
          packaging={pkg.status === "packaging"}
          device={device}
          size={size}
          onBack={onBack}
          onRebuild={pkg.repackage}
          onFullscreen={fullscreen.enter}
          onDeviceChange={selectDevice}
          onSizeChange={setSize}
        />
      )}

      <div className="relative flex min-h-0 flex-1">
        {pkg.error ? (
          <PreviewStatusPanel error={pkg.error} onRetry={pkg.repackage} />
        ) : (
          <PreviewFrame src={src} size={size} onResize={setSize} fullscreen={fullscreen.fullscreen} />
        )}
      </div>
    </div>
  )
}
