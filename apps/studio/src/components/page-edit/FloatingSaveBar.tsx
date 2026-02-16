import { Save, RefreshCw, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FloatingSaveBarProps {
  changedEntities: string[]
  isSaving: boolean
  hasApiKey: boolean
  onSave: () => void
  onSaveAndReRender: () => void
  onDiscard: () => void
}

export function FloatingSaveBar({
  changedEntities,
  isSaving,
  hasApiKey,
  onSave,
  onSaveAndReRender,
  onDiscard,
}: FloatingSaveBarProps) {
  if (changedEntities.length === 0) return null

  return (
    <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 shadow-lg">
        <span className="text-sm text-muted-foreground">
          Modified: <span className="font-medium text-foreground">{changedEntities.join(", ")}</span>
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Save className="mr-1 h-3 w-3" />
            )}
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSaveAndReRender}
            disabled={isSaving || !hasApiKey}
            title={!hasApiKey ? "Set your API key first" : ""}
          >
            {isSaving ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Save & Re-render
          </Button>
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={isSaving}>
            <X className="mr-1 h-3 w-3" />
            Discard
          </Button>
        </div>
      </div>
    </div>
  )
}
