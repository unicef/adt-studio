import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, Check, Puzzle } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import { ActivityTypePanel } from "./ActivityTypePanel"
import {
  hasDecision,
  pageName,
  useActivityTypeLabel,
  useControlsLabel,
  type ActivityReview,
} from "./activity-labels"

/** Outlines every control a learner can use, so the preview shows what made
 * ADT Studio ask. Added to the sanitized preview, which runs no scripts. */
const CONTROL_OUTLINE = "<style>input:not([type=hidden]),button,select,textarea,[draggable=true]{outline:2px solid #d97706!important;outline-offset:3px;border-radius:3px}</style>"

function withControlsOutlined(html: string): string {
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${CONTROL_OUTLINE}</head>`) : CONTROL_OUTLINE + html
}

export function ActivityClassificationDialog({
  open,
  onOpenChange,
  review,
  decisions,
  onDecision,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  review: ActivityReview
  decisions: Record<string, string | null>
  onDecision: (sectionId: string, type: string | null) => void
}) {
  const { t } = useLingui()
  const activityTypeLabel = useActivityTypeLabel()
  const controlsLabel = useControlsLabel()
  const items = useMemo(
    () => review.items.filter((item) => item.status === "needs-review"),
    [review.items],
  )
  const [activeSectionId, setActiveSectionId] = useState(items[0]?.sectionId ?? "")

  useEffect(() => {
    if (!items.some((item) => item.sectionId === activeSectionId)) {
      setActiveSectionId(items[0]?.sectionId ?? "")
    }
  }, [activeSectionId, items])

  const activeIndex = Math.max(0, items.findIndex((item) => item.sectionId === activeSectionId))
  const activeItem = items[activeIndex]
  const classifiedCount = items.filter((item) => hasDecision(decisions, item.sectionId)).length
  const allClassified = classifiedCount === items.length
  const options = activeItem
    // The server's own suggestion (often "Custom activity: external") goes last;
    // the panel puts types that fit the controls first.
    ? [...new Set([...review.typeOptions, activeItem.suggestedType])]
    : []
  const activeItemHasDecision = activeItem
    ? hasDecision(decisions, activeItem.sectionId)
    : false

  const selectItem = (index: number) => {
    const item = items[index]
    if (item) setActiveSectionId(item.sectionId)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(820px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 gap-1 border-b border-border px-6 py-5 pr-16 text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-300">
              <Puzzle className="size-4" />
            </span>
            <div>
              <DialogTitle className="text-base"><Trans>Choose activity types</Trans></DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                <Trans>These pages have controls a learner can use. Tell ADT Studio what each one is.</Trans>
              </DialogDescription>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div
              role="progressbar"
              aria-label={t`Activity classification progress`}
              aria-valuemin={0}
              aria-valuemax={items.length}
              aria-valuenow={classifiedCount}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: `${items.length > 0 ? (classifiedCount / items.length) * 100 : 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
              <Trans>{classifiedCount} of {items.length} classified</Trans>
            </span>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-muted/40">
            <div className="border-b border-border px-4 py-3">
              <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <span className="h-px w-6 shrink-0 bg-current opacity-50" />
                <Trans>Pages to review</Trans>
              </p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-1.5 p-2.5">
                {items.map((item, index) => {
                  const selected = item.sectionId === activeItem?.sectionId
                  const classified = hasDecision(decisions, item.sectionId)
                  return (
                    <Button
                      key={item.sectionId}
                      type="button"
                      variant="ghost"
                      aria-current={selected ? "page" : undefined}
                      onClick={() => setActiveSectionId(item.sectionId)}
                      className={cn(
                        "h-auto w-full justify-start whitespace-normal rounded-lg border px-3 py-2.5 text-left shadow-none",
                        selected
                          ? "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/5"
                          : "border-transparent bg-transparent text-foreground/80 hover:border-border hover:bg-card",
                      )}
                    >
                      <span className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition-colors duration-200",
                        classified
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                      )}>
                        {classified ? <Check className="size-3.5" /> : <span>{index + 1}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{pageName(item)}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">
                          {classified
                            ? decisions[item.sectionId] === null
                              ? t`Not an activity`
                              : activityTypeLabel(decisions[item.sectionId] ?? item.suggestedType)
                            : t`Has ${controlsLabel(item.controls)}`}
                        </span>
                      </span>
                    </Button>
                  )
                })}
              </div>
            </ScrollArea>
          </aside>

          {activeItem ? (
            <>
              <section className="flex min-w-0 flex-1 flex-col bg-background">
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-3">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{pageName(activeItem)}</span>
                    <code className="truncate font-mono text-xs text-muted-foreground">{activeItem.href}</code>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    <Trans>Page {activeIndex + 1} of {items.length}</Trans>
                  </span>
                </div>
                <div className="min-h-0 flex-1 bg-muted p-4">
                  {activeItem.previewHtml ? (
                    <iframe
                      srcDoc={withControlsOutlined(activeItem.previewHtml)}
                      sandbox=""
                      title={t`Preview of ${activeItem.href}`}
                      className="h-full w-full rounded-lg border border-border bg-white shadow-sm"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-card text-sm text-muted-foreground">
                      <Trans>This page is unavailable in the imported archive.</Trans>
                    </div>
                  )}
                </div>
                <p className="shrink-0 border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
                  <Trans>Outlined: {controlsLabel(activeItem.controls)} found on this page, with no activity type.</Trans>
                </p>
              </section>
              <aside className="flex w-[22rem] shrink-0 flex-col border-l border-border bg-background">
                <ActivityTypePanel
                  key={activeItem.sectionId}
                  item={activeItem}
                  options={options}
                  hasSelection={activeItemHasDecision}
                  value={activeItemHasDecision ? decisions[activeItem.sectionId] : undefined}
                  onChange={(value) => onDecision(activeItem.sectionId, value)}
                />
              </aside>
            </>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between space-x-0 border-t border-border bg-muted/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={activeIndex === 0}
              onClick={() => selectItem(activeIndex - 1)}
            >
              <ArrowLeft className="size-4" />
              <Trans>Previous</Trans>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={activeIndex >= items.length - 1}
              onClick={() => selectItem(activeIndex + 1)}
            >
              <Trans>Next</Trans>
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!allClassified}
            onClick={() => onOpenChange(false)}
          >
            <Check className="size-4" />
            {allClassified ? <Trans>Finish review</Trans> : <Trans>Classify every page</Trans>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
