import { Eye, EyeOff, Image as ImageIcon, Type } from "lucide-react"
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
  /** Called when text type changes */
  onChangeTextType?: (dataId: string, newType: string) => void
  /** Called when prune is toggled */
  onTogglePrune?: (dataId: string) => void
}

/**
 * Floating toolbar that appears above the selected element in the preview iframe.
 * Shows contextual actions for text (type dropdown, prune) and images (prune).
 */
export function SectionEditToolbar({
  dataId,
  rect,
  containerOffset,
  isImage,
  textType,
  isPruned,
  textTypes,
  onChangeTextType,
  onTogglePrune,
}: SectionEditToolbarProps) {
  if (!dataId) return null

  // Position toolbar above the selected element
  const top = containerOffset.top + rect.top - 36
  const left = containerOffset.left + rect.left

  return (
    <div
      className="fixed z-50 flex items-center gap-1.5 bg-popover border rounded-md shadow-md px-2 py-1"
      style={{
        top: Math.max(4, top),
        left: Math.max(4, left),
      }}
    >
      {isImage ? (
        <>
          <ImageIcon className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
            {dataId}
          </span>
        </>
      ) : (
        <>
          <Type className="h-3 w-3 text-muted-foreground" />
          {textTypes && onChangeTextType ? (
            <Select
              value={textType ?? ""}
              onValueChange={(val) => onChangeTextType(dataId, val)}
            >
              <SelectTrigger className="h-6 text-[10px] px-1.5 py-0 min-w-[80px] border-0 bg-muted/50">
                <SelectValue />
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
        </>
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
