import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight, LayoutGrid, Loader2, RotateCcw, TriangleAlert } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useVariant } from "@/components/app/lab/variants"
import { DetailNavButton, StepBody, StepEmptyHint } from "../ui"
import { PageDetailImage } from "./PageDetailImage"
import { DetailPanePeek } from "./variants/DetailPanePeek"
import { DetailPaneSide } from "./variants/DetailPaneSide"
import { DetailPaneTop } from "./variants/DetailPaneTop"

export type PageDetailState = "loading" | "error" | "empty" | "ready"

export interface PageDetailFrameProps {
  label: string
  pageId: string
  pageNumber: number
  meta?: ReactNode
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
  state?: PageDetailState
  onRetry?: () => void
  emptyMessage?: ReactNode
  versionPicker?: ReactNode
  notice?: ReactNode
  children?: ReactNode
}

export function PageDetailFrame({
  label,
  pageId,
  pageNumber,
  meta,
  prevPageId,
  nextPageId,
  onStep,
  onClose,
  state = "ready",
  onRetry,
  emptyMessage,
  versionPicker,
  notice,
  children,
}: PageDetailFrameProps) {
  const { t } = useLingui()
  const pane = useVariant("detailpane")
  const Pane = pane === "top" ? DetailPaneTop : pane === "peek" ? DetailPanePeek : DetailPaneSide

  return (
    <StepBody
      title={<Trans>Page {pageNumber}</Trans>}
      meta={meta ?? pageId}
      actions={
        <>
          {versionPicker}
          <DetailNavButton
            icon={ChevronLeft}
            label={t`Previous page`}
            onClick={() => prevPageId && onStep(prevPageId)}
            disabled={!prevPageId}
          />
          <DetailNavButton
            icon={ChevronRight}
            label={t`Next page`}
            onClick={() => nextPageId && onStep(nextPageId)}
            disabled={!nextPageId}
          />
          <DetailNavButton icon={LayoutGrid} label={t`All pages`} onClick={onClose}>
            <Trans>All pages</Trans>
          </DetailNavButton>
        </>
      }
    >
      {notice}
      {state === "loading" ? (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          <Trans>Loading page {pageNumber}…</Trans>
        </div>
      ) : state === "error" ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none"
        >
          <TriangleAlert className="size-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-[13px] font-medium text-foreground">
            <Trans>Couldn't load page {pageNumber}</Trans>
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors hover:bg-muted"
            >
              <RotateCcw className="size-3.5" />
              <Trans>Try again</Trans>
            </button>
          )}
        </div>
      ) : (
        <Pane image={<PageDetailImage label={label} pageId={pageId} pageNumber={pageNumber} />}>
          {state === "empty" ? <StepEmptyHint>{emptyMessage ?? <Trans>Nothing on this page yet.</Trans>}</StepEmptyHint> : children}
        </Pane>
      )}
    </StepBody>
  )
}
