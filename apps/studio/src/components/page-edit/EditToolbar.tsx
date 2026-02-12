import { Pencil, Save, X, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EditToolbarProps {
  isEditing: boolean
  hasChanges: boolean
  isSaving: boolean
  isReRendering: boolean
  hasApiKey: boolean
  hasRenderingData: boolean
  isSaveAndReRendering?: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onReRender: () => void
  onSaveAndReRender?: () => void
}

export function EditToolbar({
  isEditing,
  hasChanges,
  isSaving,
  isReRendering,
  hasApiKey,
  hasRenderingData,
  isSaveAndReRendering,
  onEdit,
  onSave,
  onCancel,
  onReRender,
  onSaveAndReRender,
}: EditToolbarProps) {
  const editTitle = !hasRenderingData ? "Run the pipeline first to extract text" : ""
  const reRenderViewTitle = !hasApiKey
    ? "Set your API key first"
    : !hasRenderingData
      ? "Run the pipeline first"
      : isReRendering
        ? "Re-rendering..."
        : ""
  const reRenderEditTitle = hasChanges
    ? "Save changes before re-rendering"
    : !hasApiKey
      ? "Set your API key first"
      : isReRendering
        ? "Re-rendering..."
        : ""

  if (!isEditing) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={!hasRenderingData} title={editTitle}>
            <Pencil className="mr-1 h-3 w-3" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReRender}
            disabled={!hasApiKey || isReRendering || !hasRenderingData}
            title={reRenderViewTitle}
          >
            {isReRendering ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Re-render
          </Button>
        </div>
        {hasRenderingData && (
          <p className="text-[11px] text-muted-foreground">
            Modify text, images, or sections, then re-render.
          </p>
        )}
      </div>
    )
  }

  const busy = isSaving || !!isSaveAndReRendering

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={onSave}
        disabled={!hasChanges || busy}
      >
        {isSaving && !isSaveAndReRendering ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Save className="mr-1 h-3 w-3" />
        )}
        Save Changes
      </Button>
      {onSaveAndReRender && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveAndReRender}
          disabled={!hasChanges || busy || !hasApiKey}
          title={!hasApiKey ? "Set your API key first" : !hasChanges ? "No changes to save" : ""}
        >
          {isSaveAndReRendering ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          {isSaveAndReRendering ? "Saving & re-rendering..." : "Save & Re-render"}
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
        <X className="mr-1 h-3 w-3" />
        Cancel
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onReRender}
        disabled={!hasApiKey || isReRendering || hasChanges}
        title={reRenderEditTitle}
      >
        {isReRendering ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="mr-1 h-3 w-3" />
        )}
        Re-render
      </Button>
    </div>
  )
}
