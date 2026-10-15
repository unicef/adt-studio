import { useNavigate } from "@tanstack/react-router"
import { useChromeRoot } from "@/components/app/lab/chrome"
import { useVariant } from "@/components/app/lab/variants"
import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Eye, RotateCcw, FileDown } from "lucide-react"
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
  const navigate = useNavigate()
  const exportVariant = useVariant("export")
  const otherArc = useVariant("topother") === "arc"
  const otherChrome = useChromeRoot(PREVIEW_HEX, otherArc ? "arc" : "current")

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
        left={
          <>
            <span data-stage-icon="" className="grid size-6.5 place-items-center rounded-full bg-white/20">
              <Eye className="size-3.5" strokeWidth={2.4} />
            </span>
            <span className="text-sm font-semibold">
              <Trans>Preview</Trans>
            </span>
          </>
        }
        center={
          packaged && (
            <div style={NO_DRAG_REGION}>
              <PreviewViewportToggle value={viewport} onChange={setViewport} variant="surface" />
            </div>
          )
        }
        right={
          <>
            {exportVariant !== "current" && (
              <button
                type="button"
                onClick={() => void navigate({ to: "/pipeline/$label/export", params: { label } })}
                className="flex h-7 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-semibold text-foreground shadow-sm transition-transform duration-150 hover:scale-[1.03] active:scale-95 animate-in fade-in zoom-in-95 duration-300"
              >
                <FileDown className="size-3.5" />
                <Trans>Export</Trans>
              </button>
            )}
            <button
              type="button"
              onClick={pkg.repackage}
              disabled={pkg.status === "packaging"}
              aria-label={t`Rebuild the preview`}
              title={t`Rebuild the preview`}
              className="grid size-7 place-items-center rounded-lg transition-colors hover:bg-white/16 disabled:pointer-events-none disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
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
