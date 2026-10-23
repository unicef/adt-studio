import { useState, useRef, useEffect } from "react"
import {
  ChevronDown,
  Crop,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  Scissors,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface ElementActionsProps {
  dataId: string
  isImage: boolean
  isContainer: boolean
  textType?: string
  isPruned?: boolean
  /** The selected leaf is hidden by a pruned ancestor, not its own flag. */
  ancestorPruned?: boolean
  textTypes?: Record<string, string>
  imageSrc?: string
  segmenting?: boolean
  onChangeTextType?: (dataId: string, newType: string) => void
  onTogglePrune?: (dataId: string) => void
  onCrop?: (dataId: string) => void
  onRecropFromPage?: (dataId: string) => void
  onReplace?: (dataId: string) => void
  onReplaceFromBook?: (dataId: string) => void
  onAiImage?: (dataId: string) => void
  onSegment?: (dataId: string) => void
  onDelete?: (dataId: string) => void
}

/**
 * Per-element configuration the StyleEditorPanel passes to its sub-sections
 * (image actions, text role, etc.). The `dataId` is provided separately by
 * each section since it's the identity, not part of the action set.
 */
export type StyleEditorElementProps = Omit<ElementActionsProps, "dataId">

export function ElementActions({
  dataId,
  isImage,
  isContainer,
  textType,
  isPruned,
  textTypes,
  imageSrc,
  segmenting,
  onChangeTextType,
  onTogglePrune,
  onCrop,
  onRecropFromPage,
  onReplace,
  onReplaceFromBook,
  onAiImage,
  onSegment,
  onDelete,
}: ElementActionsProps) {
  const { t } = useLingui()
  const [cropMenuOpen, setCropMenuOpen] = useState(false)
  const [replaceMenuOpen, setReplaceMenuOpen] = useState(false)
  const cropMenuRef = useRef<HTMLDivElement>(null)
  const replaceMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!cropMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (cropMenuRef.current && !cropMenuRef.current.contains(e.target as Node)) {
        setCropMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [cropMenuOpen])

  useEffect(() => {
    if (!replaceMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (replaceMenuRef.current && !replaceMenuRef.current.contains(e.target as Node)) {
        setReplaceMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [replaceMenuOpen])

  if (isContainer) {
    return null
  }

  if (isImage) {
    return (
      <div className="space-y-2">
        {imageSrc && (
          <img
            src={imageSrc}
            alt={dataId}
            className="w-full max-h-32 object-cover rounded border bg-muted/30"
          />
        )}
        <div className="flex items-center gap-1 flex-wrap">
          {onCrop && (
            <div className="relative inline-flex" ref={cropMenuRef}>
              <button
                type="button"
                onClick={() => onCrop(dataId)}
                className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 bg-muted hover:bg-accent transition-colors cursor-pointer ${onRecropFromPage ? "rounded-l" : "rounded"}`}
              >
                <Crop className="h-3 w-3" />
                <Trans>Crop</Trans>
              </button>
              {onRecropFromPage && (
                <>
                  <button
                    type="button"
                    onClick={() => setCropMenuOpen(!cropMenuOpen)}
                    className="flex items-center text-[10px] font-medium rounded-r px-1 py-1 bg-muted hover:bg-accent transition-colors cursor-pointer border-l border-border"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {cropMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded shadow-md py-1 min-w-[150px]">
                      <button
                        type="button"
                        onClick={() => { setCropMenuOpen(false); onRecropFromPage(dataId) }}
                        className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-accent transition-colors cursor-pointer"
                      >
                        <Trans>Recrop from Page</Trans>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {onReplace && (
            <div className="relative inline-flex" ref={replaceMenuRef}>
              <button
                type="button"
                onClick={() => onReplace(dataId)}
                className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 bg-muted hover:bg-accent transition-colors cursor-pointer ${onReplaceFromBook ? "rounded-l" : "rounded"}`}
              >
                <Upload className="h-3 w-3" />
                <Trans>Replace</Trans>
              </button>
              {onReplaceFromBook && (
                <>
                  <button
                    type="button"
                    onClick={() => setReplaceMenuOpen(!replaceMenuOpen)}
                    className="flex items-center text-[10px] font-medium rounded-r px-1 py-1 bg-muted hover:bg-accent transition-colors cursor-pointer border-l border-border"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {replaceMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded shadow-md py-1 min-w-[150px]">
                      <button
                        type="button"
                        onClick={() => { setReplaceMenuOpen(false); onReplace(dataId) }}
                        className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Upload className="h-3 w-3" />
                        <Trans>Upload from Disk</Trans>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setReplaceMenuOpen(false); onReplaceFromBook(dataId) }}
                        className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-accent transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <ImagePlus className="h-3 w-3" />
                        <Trans>Pick from Book</Trans>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {onAiImage && (
            <button
              type="button"
              onClick={() => onAiImage(dataId)}
              className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 transition-colors cursor-pointer"
            >
              <Sparkles className="h-3 w-3" />
              <Trans>AI</Trans>
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
              {segmenting ? <Trans>Segmenting...</Trans> : <Trans>Segment</Trans>}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(dataId)}
              className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 transition-colors cursor-pointer"
              title={t`Remove this block`}
            >
              <Trash2 className="h-3 w-3" />
              <Trans>Delete</Trans>
            </button>
          )}
          {onTogglePrune && (
            <button
              type="button"
              onClick={() => onTogglePrune(dataId)}
              className="flex items-center gap-1 text-[10px] font-medium rounded px-2 py-1 hover:bg-accent transition-colors cursor-pointer ml-auto"
              title={isPruned ? t`Restore element` : t`Prune element`}
            >
              {isPruned ? (
                <>
                  <EyeOff className="h-3 w-3 text-destructive" />
                  <span className="text-destructive"><Trans>Pruned</Trans></span>
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3 text-muted-foreground" />
                  <span><Trans>Prune</Trans></span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Type className="h-3 w-3 text-muted-foreground shrink-0" />
      {textTypes && onChangeTextType ? (
        <Select value={textType ?? ""} onValueChange={(val) => onChangeTextType(dataId, val)}>
          <SelectTrigger className="h-6 text-[10px] px-1.5 py-0 min-w-[90px] border-0 bg-muted/50">
            <SelectValue>{textType ?? ""}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(textTypes).map(([key, desc]) => (
              <SelectItem key={key} value={key} className="text-xs">
                {key}
                <span className="ml-1 text-muted-foreground text-[10px]">{desc}</span>
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
        <Trans>Editing</Trans>
      </span>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(dataId)}
          className="p-0.5 rounded hover:bg-red-100 transition-colors cursor-pointer ml-auto"
          title={t`Remove this block`}
        >
          <Trash2 className="h-3 w-3 text-red-600" />
        </button>
      )}
      {onTogglePrune && (
        <button
          type="button"
          onClick={() => onTogglePrune(dataId)}
          className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
          title={isPruned ? t`Restore element` : t`Prune element`}
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
