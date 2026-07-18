import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, AlertTriangle, Link2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { usePdfPreviewPages } from "@/components/wizard/shared/usePdfPreviewPages"
import { PageGroupingEditor } from "./PageGroupingEditor"
import { normalizeLeads } from "./pairs"

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
  /** Committed spreads (what's actually saved). */
  spreadPairs: number[]
  /** Called once with the final set when the user confirms (Done). */
  onChange: (next: number[]) => void
  disabled?: boolean
  /** Leads (1-indexed) that came from auto-detection — badged in the strip. */
  suggestedLeads?: number[]
  /** Leads (1-indexed) already merged in the extracted book — badged as merged. */
  mergedLeads?: number[]
  /** Extra leads to pre-link in the draft on open (e.g. suggestions under review). */
  initialSelection?: number[]
  /** Which view to open on ("spreads" jumps straight to the marked pairs). */
  defaultView?: PageView
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
  suggestedLeads,
  mergedLeads,
  initialSelection,
  defaultView = "all",
}: SpreadPickerDialogProps) {
  const { t } = useLingui()
  const [view, setView] = useState<PageView>(defaultView)
  const [draft, setDraft] = useState<number[]>(spreadPairs)
  const prevOpen = useRef(false)

  useEffect(() => {
    if (open && !prevOpen.current) {
      setDraft(normalizeLeads([...spreadPairs, ...(initialSelection ?? [])], startPage, endPage))
      setView(defaultView)
    }
    prevOpen.current = open
  }, [open, spreadPairs, initialSelection, startPage, endPage, defaultView])

  const { pages, isLoading, error } = usePdfPreviewPages({
    file: open ? file : null,
    src: open ? src : undefined,
    mode: "all",
    width: RENDER_WIDTH,
  })

  const spreadCount = useMemo(
    () => normalizeLeads(draft, startPage, endPage).length,
    [draft, startPage, endPage],
  )

  const pageCount = Math.max(0, endPage - startPage + 1)

  const viewOptions = useMemo(
    () => [
      { value: "all" as const, label: t`All pages` },
      { value: "spreads" as const, label: t`Spreads only` },
    ],
    [t],
  )

  const done = () => {
    onChange(normalizeLeads(draft, startPage, endPage))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-h-[900px] w-full max-w-[960px] flex-col gap-4">
        <DialogHeader>
          <DialogTitle>
            <Trans>Review spreads</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Most books are read one page at a time. If yours has an
              illustration that spans two facing pages, link those pages so
              they're processed together as a single spread instead of being
              split down the middle. Nothing changes until you press Apply.
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
                spreadPairs={draft}
                onChange={setDraft}
                pageThumbnails={pages}
                onlySpreads={view === "spreads"}
                suggestedLeads={suggestedLeads}
                mergedLeads={mergedLeads}
                disabled={disabled}
              />
            </>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-[13px] text-muted-foreground">
            {spreadCount === 0
              ? t`No spreads marked — every page stays single.`
              : t`${spreadCount} {spreadCount, plural, one {spread} other {spreads}} selected.`}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {t`Cancel`}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={done}
              disabled={disabled}
              className="bg-primary hover:bg-primary/90"
            >
              {t`Apply`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
