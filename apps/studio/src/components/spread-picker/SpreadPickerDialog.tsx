import { useMemo, useState } from "react"
import { Loader2, AlertTriangle, Link2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { usePdfPreviewPages } from "@/components/wizard/shared/usePdfPreviewPages"
import { PageGroupingEditor } from "./PageGroupingEditor"

const RENDER_WIDTH = 520

type PageView = "all" | "spreads"

interface SpreadPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Local file (wizard, pre-creation) OR a source URL (post-creation). */
  file?: File | null
  src?: string
  startPage: number
  endPage: number
  spreadPairs: number[]
  onChange: (next: number[]) => void
  disabled?: boolean
}

export function SpreadPickerDialog({
  open,
  onOpenChange,
  file,
  src,
  startPage,
  endPage,
  spreadPairs,
  onChange,
  disabled = false,
}: SpreadPickerDialogProps) {
  const { t } = useLingui()
  const [view, setView] = useState<PageView>("all")

  // Only load the PDF while the dialog is open — avoids rendering every page in
  // the background for books the user never opens the picker for.
  const { pages, isLoading, error } = usePdfPreviewPages({
    file: open ? file : null,
    src: open ? src : undefined,
    mode: "all",
    width: RENDER_WIDTH,
  })

  const spreadCount = useMemo(
    () => spreadPairs.filter((p) => p >= startPage && p + 1 <= endPage).length,
    [spreadPairs, startPage, endPage],
  )

  const pageCount = Math.max(0, endPage - startPage + 1)

  const viewOptions = useMemo(
    () => [
      { value: "all" as const, label: t`All pages` },
      { value: "spreads" as const, label: t`Spreads only` },
    ],
    [t],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-h-[900px] w-full max-w-[960px] flex-col gap-4">
        <DialogHeader>
          <DialogTitle>
            <Trans>Mark spreads</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Most books are read one page at a time. If yours has an
              illustration that spans two facing pages, link those pages so
              they're processed together as a single spread instead of being
              split down the middle.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Link2 className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              </span>
              <Trans>Linked pages are kept together as one spread.</Trans>
            </span>
            <span className="tabular-nums text-muted-foreground/70">
              {t`${pageCount} {pageCount, plural, one {page} other {pages}}`}
            </span>
          </div>
          <div className="w-[220px] shrink-0">
            <SegmentedControl
              options={viewOptions}
              value={view}
              onValueChange={(v) => setView(v as PageView)}
            />
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-[#e5e5e5] bg-[#fafafa]">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <AlertTriangle className="h-7 w-7 text-amber-600" aria-hidden />
              <p className="max-w-[360px] text-sm text-muted-foreground">
                <Trans>
                  Couldn't load the PDF preview. You can still mark spreads once
                  the pages load.
                </Trans>
              </p>
            </div>
          ) : (
            <>
              {isLoading && (
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  <Trans>Loading pages…</Trans>
                </div>
              )}
              <PageGroupingEditor
                startPage={startPage}
                endPage={endPage}
                spreadPairs={spreadPairs}
                onChange={onChange}
                pageThumbnails={pages}
                onlySpreads={view === "spreads"}
                disabled={disabled}
              />
            </>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-[13px] text-muted-foreground">
            {spreadCount === 0
              ? t`No spreads marked — every page stays single.`
              : t`${spreadCount} {spreadCount, plural, one {spread} other {spreads}} marked.`}
          </span>
          <DialogClose className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Trans>Done</Trans>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
