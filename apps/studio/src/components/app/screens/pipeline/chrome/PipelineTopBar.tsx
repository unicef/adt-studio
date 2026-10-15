import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronRight, Eye, FileDown } from "lucide-react"
import { BookCover } from "@/components/app/BookCover"
import { deriveCover } from "@/components/app/data"
import { NO_DRAG_REGION } from "@/constants"
import { PipelineRunIndicator } from "@/components/app/screens/pipeline/runs/PipelineRunIndicator"
import { useVariant } from "@/components/app/lab/variants"
import { useBooks } from "@/hooks/use-books"
import { useBookRun } from "@/hooks/use-book-run"
import { cn } from "@/lib/utils"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import { BookInfoPopover } from "./BookInfoPopover"
import { TopBar } from "./PipelineChrome"

export interface PipelineTopBarProps {
  label: string
  pageLabel?: string
  version?: number | null
  versionPicker?: React.ReactNode
  status?: React.ReactNode
  rerun?: React.ReactNode
  onPreview?: () => void
  previewDisabled?: boolean
}
export function PipelineTopBar({
  label,
  pageLabel,
  version,
  versionPicker,
  status,
  rerun,
  onPreview,
  previewDisabled,
}: PipelineTopBarProps) {
  const { t } = useLingui()
  const { data: books } = useBooks()
  const tbNav = useVariant("topnav")
  const tbBook = useVariant("topbook")
  const workspace = useVariant("tbstyle") === "workspace"
  const book = books?.find((candidate) => candidate.label === label)
  const title = books?.find((book) => book.label === label)?.title || label
  const exportVariant = useVariant("export")
  const { stageState } = useBookRun()
  const waitReason = previewDisabled && pageLabel ? t`Available once all pages are built` : undefined
  const navigate = useNavigate()
  const buttonTone = "text-foreground hover:bg-muted"

  return (
    <TopBar
      tone={{ hex: STORYBOARD_HEX, topStep: "home" }}
      left={
        <nav aria-label={t`Breadcrumb`} className="flex min-w-0 items-center gap-2 text-[13px]">
          {!workspace && tbNav === "crumbs" && <ChevronRight aria-hidden className="-ml-2 size-3.5 shrink-0 text-muted-foreground/50" />}
          {!workspace && tbBook === "cover" && book && (
            <span className="h-7 w-[21px] shrink-0 overflow-hidden rounded-[4px] shadow-[0_1px_3px_rgb(0_0_0/0.2)] [&>div]:rounded-[4px] [&>div]:border-0">
              <BookCover title={title} author={book.authors.join(", ")} cover={deriveCover(book)} fit="cover" />
            </span>
          )}
          {!workspace && <span title={title} className={cn("max-w-[260px] truncate", tbBook === "cover" ? "font-medium text-foreground" : "text-muted-foreground")}>{title}</span>}
          {pageLabel && (
            <>
              {!workspace && <span className="text-muted-foreground/50">/</span>}
              <span className="truncate font-semibold">{pageLabel}</span>
            </>
          )}
          {versionPicker ? (
            <span style={NO_DRAG_REGION} className="flex items-center">
              {versionPicker}
            </span>
          ) : (
            version != null && (
              <span
                className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
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
      }
      center={status}
      right={
        <>
          {rerun}
          {!workspace && onPreview && (
            <button
              type="button"
              onClick={onPreview}
              disabled={previewDisabled}
              title={waitReason ?? t`Preview the book`}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                buttonTone,
              )}
            >
              <Eye className="size-3.5" />
              <Trans>Preview</Trans>
            </button>
          )}
          {!workspace && exportVariant === "topbar" && (
            <button
              type="button"
              onClick={() => void navigate({ to: "/pipeline/$label/export", params: { label } })}
              disabled={previewDisabled}
              title={waitReason ?? t`Export the book`}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors animate-in fade-in zoom-in-95 duration-300 disabled:pointer-events-none disabled:opacity-50",
                buttonTone,
              )}
            >
              <FileDown className="size-3.5" />
              <Trans>Export</Trans>
            </button>
          )}
          {!workspace && <PipelineRunIndicator />}
          {!workspace && <BookInfoPopover label={label} triggerClassName={cn("size-8 rounded-lg border transition-colors", buttonTone)} />}
        </>
      }
    />
  )
}
