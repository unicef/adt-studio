import { useEffect, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Hand } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SignLanguageVideo } from "@/api/client"
import { SectionRow } from "./SectionRow"
import { FilterEmptyState } from "./FilterEmptyState"
import type { FilterValue, SectionEntry } from "./types"

interface ManageSectionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookLabel: string
  filter: FilterValue
  onFilterChange: (filter: FilterValue) => void
  filteredEntries: SectionEntry[]
  videoBySection: Map<string, SignLanguageVideo>
  missingCount: number
  coveredSections: number
  totalSections: number
  uploadPending: boolean
  pendingDeleteId: string | null
  onUploadForSection: (sectionId: string) => void
  onAssign: (videoId: string, sectionId: string | null) => void
  onDelete: (videoId: string) => void
  onPlay: (video: SignLanguageVideo) => void
}

export function ManageSectionsDialog({
  open,
  onOpenChange,
  bookLabel,
  filter,
  onFilterChange,
  filteredEntries,
  videoBySection,
  missingCount,
  coveredSections,
  totalSections,
  uploadPending,
  pendingDeleteId,
  onUploadForSection,
  onAssign,
  onDelete,
  onPlay,
}: ManageSectionsDialogProps) {
  const listScrollRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => 44,
    overscan: 6,
  })

  // When the dialog opens, the scroll element mounts fresh — force the
  // virtualizer to remeasure so the first frame paints the visible rows.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      rowVirtualizer.measure()
    })
    return () => cancelAnimationFrame(id)
  }, [open, rowVirtualizer])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {/* Header — matches SelectImagesDialog */}
        <div className="flex items-center gap-2 border-b px-5 py-3.5">
          <Hand className="h-4 w-4 text-cyan-500" strokeWidth={2.25} aria-hidden />
          <DialogTitle className="text-sm font-semibold">
            <Trans>Manage sign-language videos</Trans>
          </DialogTitle>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden p-4">
          <DialogDescription className="text-xs text-muted-foreground">
            <Trans>
              Browse every Storyboard section and upload, replace, or remove
              its sign-language video.
            </Trans>
          </DialogDescription>

          <Tabs
            value={filter}
            onValueChange={(v) => onFilterChange(v as FilterValue)}
          >
            <TabsList className="w-full justify-stretch">
              <TabsTrigger value="missing" className="flex-1 gap-1.5">
                <Trans>Missing</Trans>
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-foreground/10 px-1 text-[10px] font-semibold tabular-nums">
                  {missingCount}
                </span>
              </TabsTrigger>
              <TabsTrigger value="covered" className="flex-1 gap-1.5">
                <Trans>Covered</Trans>
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-foreground/10 px-1 text-[10px] font-semibold tabular-nums">
                  {coveredSections}
                </span>
              </TabsTrigger>
              <TabsTrigger value="all" className="flex-1 gap-1.5">
                <Trans>All</Trans>
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-foreground/10 px-1 text-[10px] font-semibold tabular-nums">
                  {totalSections}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {filteredEntries.length === 0 ? (
            <FilterEmptyState filter={filter} />
          ) : (
            <div
              ref={listScrollRef}
              className="flex-1 min-h-0 overflow-y-auto rounded-md border"
            >
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: "relative",
                  width: "100%",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const section = filteredEntries[virtualRow.index]
                  return (
                    <div
                      key={section.sectionId}
                      data-index={virtualRow.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={
                        virtualRow.index > 0
                          ? "border-t border-[#f0f0f0]"
                          : ""
                      }
                    >
                      <SectionRow
                        bookLabel={bookLabel}
                        label={section.sectionLabel}
                        sectionId={section.sectionId}
                        video={videoBySection.get(section.sectionId) ?? null}
                        onUpload={() => onUploadForSection(section.sectionId)}
                        onUnassign={(videoId) => onAssign(videoId, null)}
                        onDelete={(videoId) => onDelete(videoId)}
                        onPlay={(video) => onPlay(video)}
                        uploading={uploadPending}
                        pendingDeleteId={pendingDeleteId}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-5 py-3.5">
          <p className="text-[11px] text-muted-foreground">
            <Trans>
              {coveredSections} of {totalSections} sections covered
            </Trans>
          </p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded px-3 py-1.5 text-xs font-medium bg-muted hover:bg-accent transition-colors"
          >
            <Trans>Close</Trans>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
