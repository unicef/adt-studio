import { useEffect, useMemo, useState } from "react"
import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  CircleHelp,
  CircleAlert,
  FileText,
  Link2,
  ListChecks,
  MessageSquareText,
  Puzzle,
  Table2,
  ToggleLeft,
  Type,
  Underline,
  type LucideIcon,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"

import type { AdtBundleImportPreview } from "@/api/client"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type ActivityReview = AdtBundleImportPreview["activityReview"]
type ActivityReviewItem = ActivityReview["items"][number]

function hasDecision(
  decisions: Record<string, string | null>,
  sectionId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(decisions, sectionId)
}

function useActivityTypeLabel() {
  const { t } = useLingui()
  return (type: string): string => {
    if (type === "activity_quiz") return t`Quiz`
    if (type === "activity_multiple_choice") return t`Multiple choice`
    if (type === "activity_multi_select") return t`Multiple selection`
    if (type === "activity_true_false") return t`True or false`
    if (type === "activity_fill_in_the_blank") return t`Fill in the blank`
    if (type === "activity_fill_in_a_table") return t`Fill in a table`
    if (type === "activity_open_ended_answer") return t`Open-ended answer`
    if (type === "activity_underline_text") return t`Underline text`
    if (type === "activity_matching") return t`Matching`
    if (type === "activity_sorting") return t`Sorting`
    if (type === "activity_other") return t`Other activity`
    const customName = type.startsWith("activity_custom_")
      ? type.slice("activity_custom_".length).replaceAll("_", " ")
      : undefined
    return customName ? `${t`Custom activity`}: ${customName}` : t`Custom activity`
  }
}

function useActivityReasonLabel() {
  const { t } = useLingui()
  return (reason: ActivityReviewItem["reasons"][number]): string => {
    if (reason === "missing-declaration") return t`This activity was added after export.`
    if (reason === "missing-marker") return t`The exported activity marker is missing.`
    if (reason === "type-mismatch") return t`The activity type changed after export.`
    if (reason === "interactive-unmarked") return t`Interactive controls were found without an activity marker.`
    if (reason === "invalid-structure") return t`The activity structure needs confirmation.`
    return t`The declared activity page is missing.`
  }
}

function activityTypeVisual(type: string | null): {
  icon: LucideIcon
  tileClassName: string
} {
  if (type === null) return { icon: Ban, tileClassName: "bg-slate-100 text-slate-600" }
  if (type === "activity_quiz") {
    return { icon: CircleHelp, tileClassName: "bg-orange-50 text-orange-700" }
  }
  if (type === "activity_multiple_choice" || type === "activity_multi_select") {
    return { icon: ListChecks, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_true_false") {
    return { icon: ToggleLeft, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_fill_in_the_blank") {
    return { icon: Type, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_fill_in_a_table") {
    return { icon: Table2, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_open_ended_answer") {
    return { icon: MessageSquareText, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_underline_text") {
    return { icon: Underline, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_matching") {
    return { icon: Link2, tileClassName: "bg-violet-50 text-violet-700" }
  }
  if (type === "activity_sorting") {
    return { icon: ArrowDownAZ, tileClassName: "bg-violet-50 text-violet-700" }
  }
  return { icon: Puzzle, tileClassName: "bg-violet-50 text-violet-700" }
}

function ClassificationOption({
  type,
  label,
  compact = false,
}: {
  type: string | null
  label: string
  compact?: boolean
}) {
  const visual = activityTypeVisual(type)
  const Icon = visual.icon
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        compact ? "size-5" : "size-6",
        visual.tileClassName,
      )}>
        <Icon aria-hidden="true" className={compact ? "size-3" : "size-3.5"} />
      </span>
      <span className="truncate">{label}</span>
    </span>
  )
}

function ActivityClassificationSelect({
  item,
  options,
  hasSelection,
  value,
  onChange,
}: {
  item: ActivityReviewItem
  options: string[]
  hasSelection: boolean
  value: string | null | undefined
  onChange: (value: string | null) => void
}) {
  const { t } = useLingui()
  const activityTypeLabel = useActivityTypeLabel()
  const notAnActivityValue = JSON.stringify(null)
  const selectedValue = hasSelection ? value ?? notAnActivityValue : ""
  const selectedLabel = hasSelection
    ? value === null
      ? t`Not an activity`
      : value
        ? activityTypeLabel(value)
        : undefined
    : undefined

  return (
    <Select
      value={selectedValue}
      onValueChange={(nextValue) => onChange(
        nextValue === notAnActivityValue ? null : nextValue,
      )}
    >
      <SelectTrigger
        aria-label={t`Classification for ${item.href}`}
        className={cn(
          "h-10 w-full rounded-lg border-slate-300 bg-white text-sm shadow-sm hover:border-primary/40 data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/15",
          hasSelection && value === "activity_quiz" && "text-orange-700",
          hasSelection && value !== null && value !== undefined && value !== "activity_quiz" && "text-violet-800",
        )}
      >
        <SelectValue placeholder={t`Choose classification`}>
          {selectedLabel !== undefined ? (
            <ClassificationOption type={value ?? null} label={selectedLabel} compact />
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="max-h-80 w-[var(--radix-select-trigger-width)] rounded-lg"
      >
        {options.map((type) => (
          <SelectItem
            key={type}
            value={type}
            className={cn(
              "py-2.5 text-sm",
              type === "activity_quiz"
                ? "text-orange-700 focus:bg-orange-50 focus:text-orange-800"
                : "text-violet-800 focus:bg-violet-50 focus:text-violet-900",
            )}
          >
            <ClassificationOption type={type} label={activityTypeLabel(type)} />
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={notAnActivityValue} className="py-2.5 text-sm text-slate-700 focus:bg-slate-100">
          <ClassificationOption type={null} label={t`Not an activity`} />
        </SelectItem>
      </SelectContent>
    </Select>
  )
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
  const activityReasonLabel = useActivityReasonLabel()
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
    ? [...new Set([activeItem.suggestedType, ...review.typeOptions])]
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
        <DialogHeader className="shrink-0 gap-1 border-b border-slate-200 px-6 py-5 pr-16 text-left">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <Puzzle className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="text-base"><Trans>Review activity pages</Trans></DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                <Trans>Check each page and choose how ADT Studio should treat it after import.</Trans>
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
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${items.length > 0 ? (classifiedCount / items.length) * 100 : 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium text-slate-600">
              <Trans>{classifiedCount} of {items.length} classified</Trans>
            </span>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50/70">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
                          ? "border-primary/30 bg-primary/5 text-slate-950 hover:bg-primary/5"
                          : "border-transparent bg-transparent text-slate-700 hover:border-slate-200 hover:bg-white",
                      )}
                    >
                      <span className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        classified
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700",
                      )}>
                        {classified ? <Check className="h-3.5 w-3.5" /> : <span>{index + 1}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{item.href}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-500">
                          {classified
                            ? decisions[item.sectionId] === null
                              ? t`Not an activity`
                              : activityTypeLabel(decisions[item.sectionId] ?? item.suggestedType)
                            : t`Needs classification`}
                        </span>
                      </span>
                    </Button>
                  )
                })}
              </div>
            </ScrollArea>
          </aside>

          {activeItem ? (
            <section className="flex min-w-0 flex-1 flex-col bg-white">
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="truncate text-sm font-medium text-slate-800">{activeItem.href}</span>
                </div>
                <span className="shrink-0 text-xs text-slate-500">
                  <Trans>Page {activeIndex + 1} of {items.length}</Trans>
                </span>
              </div>

              <div className="min-h-0 flex-1 bg-slate-100 p-4">
                {activeItem.previewHtml ? (
                  <iframe
                    srcDoc={activeItem.previewHtml}
                    sandbox=""
                    title={t`Preview of ${activeItem.href}`}
                    className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-sm"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                    <Trans>This page is unavailable in the imported archive.</Trans>
                  </div>
                )}
              </div>

              <div className="grid shrink-0 gap-4 border-t border-slate-200 bg-white px-5 py-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
                <div className="flex min-w-0 items-start gap-2.5">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-xs font-semibold text-slate-800"><Trans>Why this needs review</Trans></p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {activityReasonLabel(activeItem.reasons[0])}
                    </p>
                    {activeItem.textPreview ? (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                        {activeItem.textPreview}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-700">
                    <Trans>Classification</Trans>
                  </p>
                  <ActivityClassificationSelect
                    item={activeItem}
                    options={options}
                    hasSelection={activeItemHasDecision}
                    value={activeItemHasDecision ? decisions[activeItem.sectionId] : undefined}
                    onChange={(value) => onDecision(activeItem.sectionId, value)}
                  />
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between space-x-0 border-t border-slate-200 bg-slate-50/80 px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={activeIndex === 0}
              onClick={() => selectItem(activeIndex - 1)}
            >
              <ArrowLeft className="h-4 w-4" />
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
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!allClassified}
            onClick={() => onOpenChange(false)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Check className="h-4 w-4" />
            {allClassified ? <Trans>Finish review</Trans> : <Trans>Classify every page</Trans>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
