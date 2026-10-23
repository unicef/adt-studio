import { useChromeRoot } from "@/components/app/lab/chrome"
import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Eye, RotateCcw } from "lucide-react"
import { getAdtUrl } from "@/api/client"
import { PreviewViewportToggle } from "@/components/pipeline/components/PreviewViewportToggle"
import { STAGES } from "@/components/pipeline/stage-config"
import { NO_DRAG_REGION } from "@/constants"
import { TopBar } from "@/components/app/screens/pipeline/chrome/PipelineChrome"
import { useAdtPages } from "@/hooks/use-adt-pages"
import { previewHrefForSection } from "@/components/app/screens/pipeline/shared/previewTarget"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { PreviewFrame } from "./PreviewFrame"
import { PreviewStatusPanel } from "./PreviewStatusPanel"
import { usePreviewPackage } from "./usePreviewPackage"
import { cn } from "@/lib/utils"

const PREVIEW_HEX = STAGES.find((stage) => stage.slug === "preview")?.hex ?? "#4b5563"

export interface PreviewScreenProps {
  label: string
  targetSectionId: string | null
  targetHref?: string | null
  onBack: () => void
}

export function PreviewScreen({ label, targetSectionId, targetHref }: PreviewScreenProps) {
  const { t } = useLingui()
  const [viewport, setViewport] = useState<Viewport>("desktop")
  const otherChrome = useChromeRoot(PREVIEW_HEX)

  const pkg = usePreviewPackage(label, true)
  const packaged = pkg.status === "ready" && pkg.version !== null

  const needsManifest = !targetHref && !!targetSectionId
  const manifestQuery = useAdtPages(label, { enabled: packaged && needsManifest })
  const targetResolved = !needsManifest || manifestQuery.isSuccess || manifestQuery.isError
  const href = targetHref ?? previewHrefForSection(targetSectionId, manifestQuery.data) ?? ""

  return (
    <div {...otherChrome} className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        tone={{ hex: PREVIEW_HEX, stage: true }}
        location={{ icon: Eye, hex: PREVIEW_HEX, area: <Trans>Preview</Trans> }}
        center={
          packaged && (
            <div style={NO_DRAG_REGION}>
              <PreviewViewportToggle value={viewport} onChange={setViewport} variant="surface" />
            </div>
          )
        }
        right={
          <>
            <button
              type="button"
              onClick={pkg.repackage}
              disabled={pkg.status === "packaging"}
              aria-label={t`Rebuild the preview`}
              title={t`Rebuild the preview`}
              className={cn(
                "place-items-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50",
                "flex h-8 items-center gap-1.5 px-2.5 text-[13px] font-medium hover:bg-muted",
              )}
            >
              <RotateCcw className="size-3.5" />
              <Trans>Rebuild</Trans>
            </button>
          </>
        }
      />

      <div data-chrome="row" className="relative flex min-h-0 flex-1">
        <div data-chrome="center" className="relative flex min-h-0 min-w-0 flex-1">
        {packaged && targetResolved ? (
          <PreviewFrame
            src={`${getAdtUrl(label)}/v-${pkg.version}/${href}`}
            viewport={viewport}
          />
        ) : (
          <PreviewStatusPanel hex={PREVIEW_HEX} error={pkg.error} onRetry={pkg.repackage} />
        )}
        </div>
      </div>
    </div>
  )
}
