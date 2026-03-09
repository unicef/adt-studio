import { Crop, Eye, EyeOff, Pencil, Scissors, Sparkles, Trash2, Type, Upload } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface SectionEditToolbarProps {
  /** The data-id of the selected element */
  dataId: string
  /** Bounding rect of the selected element (relative to iframe container) */
  rect: DOMRect
  /** Offset of the iframe container from the viewport */
  containerOffset: { top: number; left: number }
  /** Whether this is an image element */
  isImage: boolean
  /** Current text type (for text elements) */
  textType?: string
  /** Whether the element is pruned */
  isPruned?: boolean
  /** Available text types from config */
  textTypes?: Record<string, string>
  /** Image src URL for image elements */
  imageSrc?: string
  /** Called when text type changes */
  onChangeTextType?: (dataId: string, newType: string) => void
  /** Called when prune is toggled */
  onTogglePrune?: (dataId: string) => void
  /** Called when crop is requested (image elements only) */
  onCrop?: (dataId: string) => void
  /** Called when replace is requested (image elements only) */
  onReplace?: (dataId: string) => void
  /** Called when AI image edit/generate is requested */
  onAiImage?: (dataId: string) => void
  /** Called when image segmentation is requested */
  onSegment?: (dataId: string) => void
  /** Whether segmentation is currently running */
  segmenting?: boolean
  /** Called when delete/remove block is requested */
  onDelete?: (dataId: string) => void
}

/**
 * Floating popover for selected elements in the preview iframe.
 * Text: compact bar positioned BELOW the element (so it doesn't cover text being edited).
 * Image: richer card positioned ABOVE the element with thumbnail, crop, replace, AI, prune.
 */
export function SectionEditToolbar({
  dataId,
  rect,
  containerOffset,
  isImage,
  textType,
  isPruned,
  textTypes,
  imageSrc,
  onChangeTextType,
  onTogglePrune,
  onCrop,
  onReplace,
  onAiImage,
  onSegment,
  segmenting,
  onDelete,
}: SectionEditToolbarProps) {
  if (!dataId) return null

  if (isImage) {
    // Image popover: positioned ABOVE the element (card height ~110px: thumbnail 48 + info + padding + actions)
    const IMAGE_POPOVER_H = 110
    const top = containerOffset.top + rect.top - IMAGE_POPOVER_H
    const left = containerOffset.left + rect.left

    return (
      <div
        className="fixed z-50 bg-popover border rounded-lg shadow-lg w-[280px]"
        style={{
          top: Math.max(4, top),
          left: Math.max(4, Math.min(left, window.innerWidth - 290)),
        }}
      >
        <div className="p-2.5 space-y-2">
          {/* Image thumbnail + info */}
          <div className="flex items-start gap-2">
            {imageSrc && (
              <img
                src={imageSrc}
                alt={dataId}
                className="w-16 h-12 object-cover rounded border shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <span className="text-[10px] text-muted-foreground font-mono block truncate">
                {dataId}
              </span>
              </div>
          </div>
          {/* Actions row */}
          <div className="flex items-center gap-1 border-t pt-2 flex-wrap">
            {onCrop && (
              <button
                type="button"
                onClick={() => onCrop(dataId)}
                className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 bg-muted hover:bg-accent transition-colors cursor-pointer"
              >
                <Crop className="h-3 w-3" />
                Crop
              </button>
            )}
            {onReplace && (
              <button
                type="button"
                onClick={() => onReplace(dataId)}
                className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 bg-muted hover:bg-accent transition-colors cursor-pointer"
              >
                <Upload className="h-3 w-3" />
                Replace
              </button>
            )}
            {onAiImage && (
              <button
                type="button"
                onClick={() => onAiImage(dataId)}
                className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 transition-colors cursor-pointer"
              >
                <Sparkles className="h-3 w-3" />
                AI
              </button>
            )}
            {onSegment && (
              <button
                type="button"
                onClick={() => onSegment(dataId)}
                disabled={segmenting}
                className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Scissors className="h-3 w-3" />
                {segmenting ? "Segmenting..." : "Segment"}
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(dataId)}
                className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 transition-colors cursor-pointer"
                title="Remove this block"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
            {onTogglePrune && (
              <button
                type="button"
                onClick={() => onTogglePrune(dataId)}
                className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 hover:bg-accent transition-colors cursor-pointer ml-auto"
                title={isPruned ? "Restore element" : "Prune element"}
              >
                {isPruned ? (
                  <>
                    <EyeOff className="h-3 w-3 text-destructive" />
                    <span className="text-destructive">Pruned</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3 text-muted-foreground" />
                    <span>Prune</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Text toolbar: compact single-row bar positioned BELOW the element (flips ABOVE if near viewport bottom)
  const TOOLBAR_H = 34
  const topBelow = containerOffset.top + rect.bottom + 4
  const topAbove = containerOffset.top + rect.top - TOOLBAR_H - 4
  const top = window.innerHeight - topBelow >= TOOLBAR_H + 8 ? topBelow : Math.max(4, topAbove)
  const left = containerOffset.left + rect.left

  return (
    <div
      className="fixed z-50 flex items-center gap-1.5 bg-popover border rounded-md shadow-md px-2 py-1"
      style={{
        top: Math.max(4, top),
        left: Math.max(4, Math.min(left, window.innerWidth - 290)),
      }}
    >
      <Type className="h-3 w-3 text-muted-foreground shrink-0" />
      {textTypes && onChangeTextType ? (
        <Select
          value={textType ?? ""}
          onValueChange={(val) => onChangeTextType(dataId, val)}
        >
          <SelectTrigger className="h-6 text-[10px] px-1.5 py-0 min-w-[80px] border-0 bg-muted/50">
            <SelectValue>{textType ?? ""}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(textTypes).map(([key, desc]) => (
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
        textType && (
          <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
            {textType}
          </span>
        )
      )}

      <span className="flex items-center gap-0.5 text-[10px] text-blue-500">
        <Pencil className="h-2.5 w-2.5" />
        Editing
      </span>

      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(dataId)}
          className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer"
          title="Remove this block"
        >
          <Trash2 className="h-3 w-3 text-red-600" />
        </button>
      )}

      {onTogglePrune && (
        <button
          type="button"
          onClick={() => onTogglePrune(dataId)}
          className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
          title={isPruned ? "Restore element" : "Prune element"}
        >
          {isPruned ? (
            <EyeOff className="h-3 w-3 text-destructive" />
          ) : (
            <Eye className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      )}
    </div>
  )
}
