import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Eye, RotateCcw } from "lucide-react"
import { getAdtUrl } from "@/api/client"
import { PreviewViewportToggle } from "@/components/pipeline/components/PreviewViewportToggle"
import { STAGES } from "@/components/pipeline/stage-config"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { NO_DRAG_REGION } from "@/constants"
import { useAdtPages } from "@/hooks/use-adt-pages"
import { previewHrefForSection } from "@/components/app/screens/pipeline/shared/previewTarget"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { PreviewFrame } from "./PreviewFrame"
import { PreviewStatusPanel } from "./PreviewStatusPanel"
import { usePreviewPackage } from "./usePreviewPackage"

const PREVIEW_HEX = STAGES.find((stage) => stage.slug === "preview")?.hex ?? "#4b5563"

export interface PreviewScreenProps {
  label: string
  /** Section the storyboard was showing — the preview opens on its page. */
  targetSectionId: string | null
  /** Bundle-relative page, when the caller already resolved it. Wins over
   *  `targetSectionId` and skips the manifest lookup entirely. */
  targetHref?: string | null
  onBack: () => void
}

/** The packaged book, read inside the pipeline shell. Only the top bar frames
 *  it — the dock stays out so the book reads exactly as the reader gets it. */
export function PreviewScreen({ label, targetSectionId, targetHref, onBack }: PreviewScreenProps) {
  const { t } = useLingui()
  const [viewport, setViewport] = useState<Viewport>("desktop")

  const pkg = usePreviewPackage(label, true)
  const packaged = pkg.status === "ready" && pkg.version !== null

  // Only the manifest knows which file a section became — the book's first page
  // is written as index.html. Without a target there is nothing to look up, and
  // the bundle root already redirects to the first page.
  const needsManifest = !targetHref && !!targetSectionId
  const manifestQuery = useAdtPages(label, { enabled: packaged && needsManifest })
  const targetResolved = !needsManifest || manifestQuery.isSuccess || manifestQuery.isError
  const href = targetHref ?? previewHrefForSection(targetSectionId, manifestQuery.data) ?? ""

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header
        className="drag-region flex h-12.5 shrink-0 items-center gap-3 px-3.5 text-white"
        style={{ background: PREVIEW_HEX }}
      >
        <button
          type="button"
          onClick={onBack}
          style={NO_DRAG_REGION}
          className="flex h-7 items-center gap-1.5 rounded-lg bg-white/16 px-2.5 text-xs font-semibold transition-colors hover:bg-white/24"
        >
          <ArrowLeft className="size-3.5" />
          <Trans>Storyboard</Trans>
        </button>

        <span className="grid size-6.5 place-items-center rounded-full bg-white/20">
          <Eye className="size-3.5" strokeWidth={2.4} />
        </span>
        <span className="text-sm font-semibold">
          <Trans>Preview</Trans>
        </span>

        <div className="flex flex-1 items-center justify-center">
          {packaged && (
            <div style={NO_DRAG_REGION}>
              <PreviewViewportToggle value={viewport} onChange={setViewport} />
            </div>
          )}
        </div>

        <div style={NO_DRAG_REGION} className="flex items-center gap-2">
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
        </div>

        <TitleBarControls darkMode className="-my-px -mr-3.5 h-12.5" />
      </header>

      <div className="relative flex min-h-0 flex-1">
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
  )
}
