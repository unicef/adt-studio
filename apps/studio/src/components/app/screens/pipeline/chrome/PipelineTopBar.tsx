import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Eye, Settings } from "lucide-react"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { NO_DRAG_REGION } from "@/constants"
import { APP_PATHS } from "@/components/app/nav"
import { PipelineRunIndicator } from "@/components/app/screens/pipeline/runs/PipelineRunIndicator"

export interface PipelineTopBarProps {
  label: string
  pageLabel?: string
  version?: number | null
  versionPicker?: React.ReactNode
  status?: React.ReactNode
  rerun?: React.ReactNode
  onPreview?: () => void
  previewDisabled?: boolean
  onOpenBookInfo: () => void
}
export function PipelineTopBar({
  label,
  pageLabel,
  version,
  versionPicker,
  rerun,
  onPreview,
  previewDisabled,
  onOpenBookInfo,
}: PipelineTopBarProps) {
  const { t } = useLingui()

  return (
    <header className="drag-region flex h-13 shrink-0 items-center gap-3.5 border-b bg-card px-3.5">
      <Link
        to={APP_PATHS.library}
        style={NO_DRAG_REGION}
        className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        <Trans>Library</Trans>
      </Link>

      <div className="h-5.5 w-px bg-border" />

      <nav aria-label={t`Breadcrumb`} className="flex min-w-0 items-center gap-2 text-[13px]">
        <span className="truncate text-muted-foreground">{label}</span>
        {pageLabel && (
          <>
            <span className="text-muted-foreground/50">/</span>
            <span className="truncate font-semibold">{pageLabel}</span>
          </>
        )}
        {versionPicker ? (
          <span style={NO_DRAG_REGION} className="flex items-center">
            {versionPicker}
          </span>
        ) : (
          version != null && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              v{version}
            </span>
          )
        )}
        {!pageLabel && (
          <span className="text-muted-foreground/70">
            <Trans>no sections yet</Trans>
          </span>
        )}
      </nav>

      <div className="flex-1" />

      <div style={NO_DRAG_REGION} className="flex items-center gap-1.5">
        {rerun}
        {onPreview && (
          <button
            type="button"
            onClick={onPreview}
            disabled={previewDisabled}
            title={t`Preview the book`}
            className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <Eye className="size-3.5" />
            <Trans>Preview</Trans>
          </button>
        )}
        <PipelineRunIndicator />
        <button
          type="button"
          onClick={onOpenBookInfo}
          title={t`Book information`}
          aria-label={t`Book information`}
          className="grid size-8 place-items-center rounded-lg border text-foreground transition-colors hover:bg-muted"
        >
          <Settings className="size-3.5" />
        </button>
      </div>

      <TitleBarControls className="-my-px -mr-3.5 h-13" />
    </header>
  )
}
