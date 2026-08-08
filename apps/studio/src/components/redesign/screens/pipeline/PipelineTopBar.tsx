import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Code2, Pencil, Settings } from "lucide-react"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { NO_DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import { REDESIGN_PATHS } from "../../nav"
import { PipelineRunIndicator } from "./PipelineRunIndicator"
import type { Viewport } from "./types"
import { PreviewViewportToggle } from "@/components/pipeline/components/PreviewViewportToggle"

export interface PipelineTopBarProps {
  label: string
  /** Current page crumb — omitted while the storyboard is still empty. */
  pageLabel?: string
  version?: number | null
  viewport: Viewport
  onViewportChange: (viewport: Viewport) => void
  /** Right-hand status pill: review queue, extraction summary, … */
  status?: React.ReactNode
  /** Viewport switch and editing actions are inert until a storyboard exists. */
  disabled?: boolean
}

function IconAction({
  icon: Icon,
  label,
  disabled,
  mono,
}: {
  icon: typeof Code2
  label: string
  disabled?: boolean
  mono?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={label}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors",
        mono && "font-mono",
        disabled ? "text-muted-foreground/50" : "text-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

export function PipelineTopBar({
  label,
  pageLabel,
  version,
  viewport,
  onViewportChange,
  status,
  disabled,
}: PipelineTopBarProps) {
  const { t } = useLingui()

  return (
    <header className="drag-region flex h-13 shrink-0 items-center gap-3.5 border-b bg-card px-3.5">
      <Link
        to={REDESIGN_PATHS.library}
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
        {version != null && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            v{version}
          </span>
        )}
        {!pageLabel && (
          <span className="text-muted-foreground/70">
            <Trans>no sections yet</Trans>
          </span>
        )}
      </nav>

      <div style={NO_DRAG_REGION} className="shrink-0">
        <PreviewViewportToggle
          value={viewport}
          onChange={onViewportChange}
          variant="surface"
        />
      </div>

      <div className="flex-1" />

      {status}

      <div style={NO_DRAG_REGION} className="flex items-center gap-1.5">
        <PipelineRunIndicator />
        <button
          type="button"
          title={t`Book settings`}
          aria-label={t`Book settings`}
          className="grid size-8 place-items-center rounded-lg border text-foreground transition-colors hover:bg-muted"
        >
          <Settings className="size-3.5" />
        </button>
      </div>

      <TitleBarControls className="-my-px -mr-3.5 h-13" />
    </header>
  )
}
