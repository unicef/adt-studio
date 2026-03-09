import { useState, useRef, useCallback, type ReactNode } from "react"
import {
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Layers,
  Loader2,
  Merge,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { BASE_URL } from "@/api/client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PageSection } from "@adt/types"

// -- Types --

interface SectionDataPanelProps {
  open: boolean
  onClose: () => void
  section: PageSection
  sectionIndex: number
  sectionCount: number
  bookLabel: string
  sectionTypes?: Record<string, string>
  textTypes?: Record<string, string>
  onChangeSectionType: (type: string) => void
  onToggleSectionPruned: () => void
  onTogglePartPruned: (partIndex: number) => void
  onChangeTextType: (partIndex: number, textIndex: number, type: string) => void
  onToggleTextPruned: (partIndex: number, textIndex: number) => void
  onDeleteTextEntry: (partIndex: number, textIndex: number) => void
  onDuplicateTextEntry: (partIndex: number, textIndex: number) => void
  onAddGroup: () => void
  onDuplicateGroup: (partIndex: number) => void
  onDeleteGroup: (partIndex: number) => void
  onReorderParts: (fromIndex: number, toIndex: number) => void
  onMoveText: (
    fromPartIndex: number,
    textIndex: number,
    toPartIndex: number,
    toTextIndex: number
  ) => void
  onMergeSection: (dir: "prev" | "next") => void
  onCloneSection: () => void
  onDeleteSection: () => void
  onAddImage: () => void
  // Version picker
  versionPickerNode: ReactNode
  // Disabled states
  merging: boolean
  cloning: boolean
  deleting: boolean
  saving: boolean
  dirty: boolean
  renderingDirty: boolean
  showPrunedImages: boolean
  onToggleShowPrunedImages: () => void
}

// -- ImageCard (inline) --

function ImageCard({
  imageId,
  bookLabel,
  isPruned,
  reason,
}: {
  imageId: string
  bookLabel: string
  isPruned?: boolean
  reason?: string
}) {
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(
    null
  )

  return (
    <div
      className={`relative rounded border overflow-hidden bg-card flex flex-col items-center min-h-[80px] transition-opacity duration-300 ${isPruned ? "opacity-40" : ""}`}
      title={isPruned ? `Pruned: ${reason}` : undefined}
    >
      <img
        src={`${BASE_URL}/books/${bookLabel}/images/${imageId}`}
        alt={imageId}
        className={`max-w-full h-auto block my-auto ${isPruned ? "grayscale" : ""}`}
        onLoad={(e) => {
          const img = e.target as HTMLImageElement
          setDimensions({ w: img.naturalWidth, h: img.naturalHeight })
        }}
        onError={(e) => {
          const target = e.target as HTMLImageElement
          target.style.display = "none"
        }}
      />
      <div className="px-2 py-1 flex items-center justify-between border-t bg-muted/30 w-full mt-auto">
        <span className="text-[10px] text-muted-foreground truncate">
          {imageId}
        </span>
        {dimensions && (
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
            {dimensions.w}&times;{dimensions.h}
          </span>
        )}
      </div>
    </div>
  )
}

// -- Drag types --

const DRAG_TYPE_GROUP = "application/x-group-index"
const DRAG_TYPE_TEXT = "application/x-text-entry"

// -- Component --

export function SectionDataPanel({
  open,
  onClose,
  section,
  sectionIndex,
  sectionCount,
  bookLabel,
  sectionTypes,
  textTypes,
  onChangeSectionType,
  onToggleSectionPruned,
  onTogglePartPruned,
  onChangeTextType,
  onToggleTextPruned,
  onDeleteTextEntry,
  onDuplicateTextEntry,
  onAddGroup,
  onDuplicateGroup,
  onDeleteGroup,
  onReorderParts,
  onMoveText,
  onMergeSection,
  onCloneSection,
  onDeleteSection,
  onAddImage,
  versionPickerNode,
  merging,
  cloning,
  deleting,
  saving,
  dirty,
  renderingDirty,
  showPrunedImages,
  onToggleShowPrunedImages,
}: SectionDataPanelProps) {
  const parts = section.parts

  const hasTextParts = parts.some((p) => p.type === "text_group")
  const hasImageParts = parts.some((p) => p.type === "image")

  // -- Group drag state --
  const [dragGroupIdx, setDragGroupIdx] = useState<number | null>(null)
  // dropGroupSlot tracks the insertion point: "before:3" means insert before partIndex 3, "after:3" means insert after
  const [dropGroupSlot, setDropGroupSlot] = useState<string | null>(null)

  // -- Text drag state --
  const [dragText, setDragText] = useState<{
    partIndex: number
    textIndex: number
  } | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    partIndex: number
    textIndex: number
  } | null>(null)
  const dragCounterRef = useRef(0)

  // -- Group drag handlers --
  const handleGroupDragStart = useCallback(
    (e: React.DragEvent, partIndex: number) => {
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData(DRAG_TYPE_GROUP, String(partIndex))
      setDragGroupIdx(partIndex)
    },
    []
  )

  const handleGroupDragEnd = useCallback(() => {
    setDragGroupIdx(null)
    setDropGroupSlot(null)
  }, [])

  const handleGroupDragOver = useCallback(
    (e: React.DragEvent, partIndex: number) => {
      if (dragGroupIdx === null) return
      if (!e.dataTransfer.types.includes(DRAG_TYPE_GROUP)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      // Determine if cursor is in the top or bottom half of the element
      const rect = e.currentTarget.getBoundingClientRect()
      const midY = rect.top + rect.height / 2
      const slot = e.clientY < midY ? `before:${partIndex}` : `after:${partIndex}`
      setDropGroupSlot(slot)
    },
    [dragGroupIdx]
  )

  // Drop zone between groups: handles drops in the gaps
  const handleGapDragOver = useCallback(
    (e: React.DragEvent, insertBeforePartIndex: number) => {
      if (dragGroupIdx === null) return
      if (!e.dataTransfer.types.includes(DRAG_TYPE_GROUP)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      setDropGroupSlot(`before:${insertBeforePartIndex}`)
    },
    [dragGroupIdx]
  )

  const handleGroupDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!dropGroupSlot) return
      const fromStr = e.dataTransfer.getData(DRAG_TYPE_GROUP)
      if (!fromStr) return
      const fromIndex = parseInt(fromStr, 10)
      const [position, idxStr] = dropGroupSlot.split(":")
      const targetIdx = parseInt(idxStr, 10)
      const toIndex = position === "after" ? targetIdx + 1 : targetIdx
      // Adjust: if dragging from before the insertion point, the removal shifts indices
      const adjustedTo = fromIndex < toIndex ? toIndex - 1 : toIndex
      if (fromIndex !== adjustedTo) {
        onReorderParts(fromIndex, adjustedTo)
      }
      setDragGroupIdx(null)
      setDropGroupSlot(null)
    },
    [onReorderParts, dropGroupSlot]
  )

  // -- Text drag handlers --
  const handleTextDragStart = useCallback(
    (e: React.DragEvent, partIndex: number, textIndex: number) => {
      e.stopPropagation() // don't trigger group drag
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData(
        DRAG_TYPE_TEXT,
        JSON.stringify({ partIndex, textIndex })
      )
      setDragText({ partIndex, textIndex })
    },
    []
  )

  const handleTextDragEnd = useCallback(() => {
    setDragText(null)
    setDropTarget(null)
    dragCounterRef.current = 0
  }, [])

  const handleTextDragOver = useCallback(
    (e: React.DragEvent, partIndex: number, textIndex: number) => {
      if (!dragText) return
      if (!e.dataTransfer.types.includes(DRAG_TYPE_TEXT)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "move"
      setDropTarget({ partIndex, textIndex })
    },
    [dragText]
  )

  const handleGroupBodyDragOver = useCallback(
    (e: React.DragEvent, partIndex: number, textCount: number) => {
      if (!dragText) return
      if (!e.dataTransfer.types.includes(DRAG_TYPE_TEXT)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      // Drop at the end of the group
      setDropTarget({ partIndex, textIndex: textCount })
    },
    [dragText]
  )

  const handleTextDrop = useCallback(
    (e: React.DragEvent, toPartIndex: number, toTextIndex: number) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE_TEXT)) return // let group drops bubble up
      e.preventDefault()
      e.stopPropagation()
      const raw = e.dataTransfer.getData(DRAG_TYPE_TEXT)
      if (!raw) return
      const { partIndex: fromPartIndex, textIndex: fromTextIndex } = JSON.parse(
        raw
      ) as { partIndex: number; textIndex: number }

      if (fromPartIndex === toPartIndex && fromTextIndex === toTextIndex) {
        // No-op
      } else {
        onMoveText(fromPartIndex, fromTextIndex, toPartIndex, toTextIndex)
      }
      setDragText(null)
      setDropTarget(null)
      dragCounterRef.current = 0
    },
    [onMoveText]
  )

  const handleGroupBodyDrop = useCallback(
    (e: React.DragEvent, partIndex: number, textCount: number) => {
      handleTextDrop(e, partIndex, textCount)
    },
    [handleTextDrop]
  )

  return (
    <div
      className={`absolute top-0 right-0 h-full w-[480px] bg-background border-l shadow-lg transition-transform duration-200 ease-in-out z-30 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b text-xs text-muted-foreground">
        <span className="font-medium uppercase tracking-wider">Content</span>
        {sectionTypes ? (
          <Select
            value={section.sectionType}
            onValueChange={onChangeSectionType}
          >
            <SelectTrigger className="h-6 text-[10px] font-medium px-1.5 py-0 w-auto min-w-[80px] border-0 bg-muted/50">
              <SelectValue>{section.sectionType}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(sectionTypes).map(([key, desc]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {key}
                  <span className="ml-1 text-muted-foreground text-[10px]">
                    {desc}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="font-medium">{section.sectionType}</span>
        )}
        {!section.isPruned && (
          <>
            <span
              className="w-3.5 h-3.5 rounded border"
              style={{ backgroundColor: section.backgroundColor }}
              title={`Background: ${section.backgroundColor}`}
            />
            <span
              className="w-3.5 h-3.5 rounded border"
              style={{ backgroundColor: section.textColor }}
              title={`Text color: ${section.textColor}`}
            />
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleSectionPruned}
            className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
            title={
              section.isPruned
                ? "Include section in render"
                : "Exclude section from render"
            }
          >
            {section.isPruned ? (
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {sectionIndex > 0 && (
            <button
              type="button"
              onClick={() => onMergeSection("prev")}
              disabled={merging || dirty || renderingDirty || saving}
              className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
              title={
                dirty || renderingDirty
                  ? "Save changes before merging"
                  : "Merge with previous section"
              }
            >
              {merging ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Merge className="h-3.5 w-3.5 rotate-180" />
              )}
            </button>
          )}
          {sectionIndex < sectionCount - 1 && (
            <button
              type="button"
              onClick={() => onMergeSection("next")}
              disabled={merging || dirty || renderingDirty || saving}
              className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
              title={
                dirty || renderingDirty
                  ? "Save changes before merging"
                  : "Merge with next section"
              }
            >
              {merging ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Merge className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onCloneSection}
            disabled={cloning || dirty || renderingDirty || saving}
            className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            title={
              dirty || renderingDirty
                ? "Save changes before cloning"
                : "Clone this section"
            }
          >
            {cloning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          {sectionCount > 1 && (
            <button
              type="button"
              onClick={onDeleteSection}
              disabled={deleting || dirty || renderingDirty || saving}
              className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
              title={
                dirty || renderingDirty
                  ? "Save changes before deleting"
                  : "Delete this section"
              }
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              )}
            </button>
          )}
          {versionPickerNode}
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Panel body — scrollable */}
      <div className="overflow-auto h-[calc(100%-41px)] px-4 py-3 space-y-5">
        {/* Text groups */}
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            <Layers className="h-3 w-3" />
            Text Groups
          </h3>
          {hasTextParts && (
            <div>
              {parts.map((p, partIndex) => {
                if (p.type !== "text_group") return null
                const isGroupDragging = dragGroupIdx === partIndex
                const showDropLine = dropGroupSlot === `before:${partIndex}` && dragGroupIdx !== null && dragGroupIdx !== partIndex
                return (
                  <div key={p.groupId}>
                    {/* Drop zone gap before each group */}
                    <div
                      className={`transition-all duration-150 ${dragGroupIdx !== null ? "py-1.5" : "py-1"}`}
                      onDragOver={(e) => handleGapDragOver(e, partIndex)}
                      onDrop={handleGroupDrop}
                    >
                      {showDropLine && (
                        <div className="h-0.5 bg-primary rounded-full" />
                      )}
                    </div>
                    <div
                      className={`group/card rounded border overflow-hidden transition-all duration-150 ${
                        p.isPruned ? "opacity-40" : ""
                      } ${isGroupDragging ? "opacity-50 scale-[0.98]" : ""}`}
                      onDragOver={(e) => handleGroupDragOver(e, partIndex)}
                      onDrop={handleGroupDrop}
                    >
                    <div className="px-3 py-1.5 bg-muted/50 border-b flex items-center gap-1.5">
                      {/* Drag handle — visible on hover */}
                      <div
                        draggable
                        onDragStart={(e) => handleGroupDragStart(e, partIndex)}
                        onDragEnd={handleGroupDragEnd}
                        className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-accent transition-colors opacity-0 group-hover/card:opacity-100"
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {p.groupType}
                      </span>
                      <div className="ml-auto flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onDuplicateGroup(partIndex)}
                          className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
                          title="Duplicate group"
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                        {p.isPruned && (
                          <button
                            type="button"
                            onClick={() => onDeleteGroup(partIndex)}
                            className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer"
                            title="Delete group"
                          >
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onTogglePartPruned(partIndex)}
                          className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
                          title={
                            p.isPruned
                              ? "Include in render"
                              : "Exclude from render"
                          }
                        >
                          {p.isPruned ? (
                            <EyeOff className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Eye className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div
                      className="divide-y"
                      onDragOver={(e) =>
                        handleGroupBodyDragOver(e, partIndex, p.texts.length)
                      }
                      onDrop={(e) =>
                        handleGroupBodyDrop(e, partIndex, p.texts.length)
                      }
                    >
                      {p.texts.length === 0 && (
                        <div className="px-3 py-3 text-xs text-muted-foreground/50 italic text-center">
                          Empty group — drag text entries here
                        </div>
                      )}
                      {p.texts.map((t, ti) => {
                        const isTextDragging =
                          dragText?.partIndex === partIndex &&
                          dragText?.textIndex === ti
                        const isTextDropTarget =
                          dropTarget?.partIndex === partIndex &&
                          dropTarget?.textIndex === ti &&
                          dragText !== null
                        return (
                          <div
                            key={t.textId}
                            className={`group/text px-3 py-1.5 flex items-start gap-2 text-sm transition-all duration-150 ${
                              t.isPruned ? "opacity-40" : ""
                            } ${isTextDragging ? "opacity-30 bg-muted/30" : ""} ${
                              isTextDropTarget
                                ? "border-t-2 !border-t-primary"
                                : ""
                            }`}
                            onDragOver={(e) =>
                              handleTextDragOver(e, partIndex, ti)
                            }
                            onDrop={(e) => handleTextDrop(e, partIndex, ti)}
                          >
                            {/* Drag handle — visible on hover */}
                            <div
                              draggable
                              onDragStart={(e) =>
                                handleTextDragStart(e, partIndex, ti)
                              }
                              onDragEnd={handleTextDragEnd}
                              className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 mt-0.5 rounded hover:bg-accent transition-colors opacity-0 group-hover/text:opacity-100"
                              title="Drag to reorder or move to another group"
                            >
                              <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                            </div>
                            {textTypes ? (
                              <Select
                                value={t.textType}
                                onValueChange={(val) =>
                                  onChangeTextType(partIndex, ti, val)
                                }
                              >
                                <SelectTrigger className="shrink-0 h-5 text-[10px] font-medium px-1.5 py-0 w-auto min-w-[60px] border-0 bg-muted/50">
                                  <SelectValue>{t.textType}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {Object.entries(textTypes).map(
                                    ([key, desc]) => (
                                      <SelectItem
                                        key={key}
                                        value={key}
                                        className="text-xs"
                                      >
                                        {key}
                                        <span className="ml-1 text-muted-foreground text-[10px]">
                                          {desc}
                                        </span>
                                      </SelectItem>
                                    )
                                  )}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="shrink-0 text-xs font-medium text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 text-center">
                                {t.textType}
                              </span>
                            )}
                            <span className="leading-relaxed flex-1 min-w-0 text-xs">
                              {t.text}
                            </span>
                            <div className="shrink-0 flex items-center gap-0.5 self-center opacity-0 group-hover/text:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => onDuplicateTextEntry(partIndex, ti)}
                                className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
                                title="Duplicate text entry"
                              >
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              </button>
                              {t.isPruned && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteTextEntry(partIndex, ti)}
                                  className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer"
                                  title="Delete text entry"
                                >
                                  <Trash2 className="h-3 w-3 text-red-600" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onToggleTextPruned(partIndex, ti)}
                                className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
                                title={
                                  t.isPruned
                                    ? "Include in render"
                                    : "Exclude from render"
                                }
                              >
                                {t.isPruned ? (
                                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                                ) : (
                                  <Eye className="h-3 w-3 text-muted-foreground" />
                                )}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    </div>
                  </div>
                )
              })}
              {/* Drop zone after the last group */}
              {dragGroupIdx !== null && (() => {
                const lastTextGroupIdx = parts.reduce((last, p, i) => p.type === "text_group" ? i : last, -1)
                const showDropLine = dropGroupSlot === `after:${lastTextGroupIdx}` && dragGroupIdx !== lastTextGroupIdx
                return (
                  <div
                    className="py-1.5"
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(DRAG_TYPE_GROUP)) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = "move"
                      setDropGroupSlot(`after:${lastTextGroupIdx}`)
                    }}
                    onDrop={handleGroupDrop}
                  >
                    {showDropLine && (
                      <div className="h-0.5 bg-primary rounded-full" />
                    )}
                  </div>
                )
              })()}
            </div>
          )}
          <button
            type="button"
            onClick={onAddGroup}
            className="flex items-center justify-center gap-1.5 w-full rounded border border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer mt-3"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Group
          </button>
        </div>

        {/* Images */}
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Images
            {hasImageParts &&
              parts.some((p) => p.type === "image" && p.isPruned) && (
                <button
                  type="button"
                  onClick={onToggleShowPrunedImages}
                  className="ml-auto flex items-center gap-1 text-[10px] font-normal normal-case tracking-normal text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={
                    showPrunedImages
                      ? "Hide pruned images"
                      : "Show pruned images"
                  }
                >
                  {showPrunedImages ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                  {showPrunedImages ? "Hide Pruned" : "Show Pruned"}
                </button>
              )}
          </h3>
          {hasImageParts && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              {parts.map((p, partIndex) => {
                if (p.type !== "image") return null
                if (p.isPruned && !showPrunedImages) return null
                return (
                  <div key={p.imageId} className="group relative">
                    <ImageCard
                      imageId={p.imageId}
                      bookLabel={bookLabel}
                      isPruned={p.isPruned}
                      reason={p.reason}
                    />
                    <button
                      type="button"
                      onClick={() => onTogglePartPruned(partIndex)}
                      className="absolute top-1 right-1 p-1 rounded bg-background/80 hover:bg-accent transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                      title={
                        p.isPruned
                          ? "Include in render"
                          : "Exclude from render"
                      }
                    >
                      {p.isPruned ? (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <button
            type="button"
            onClick={onAddImage}
            className="flex items-center justify-center gap-1.5 w-full rounded border border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Add Image
          </button>
        </div>
      </div>
    </div>
  )
}
