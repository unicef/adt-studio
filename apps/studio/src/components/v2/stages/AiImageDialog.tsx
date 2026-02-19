import { useState } from "react"
import { Sparkles, X, Pencil, ImagePlus } from "lucide-react"

interface AiImageDialogProps {
  /** Current image URL (for reference) */
  currentImageSrc: string
  /** Image ID being edited */
  imageId: string
  /** Called when the user submits — dialog closes immediately, parent handles async */
  onSubmit: (prompt: string, referenceImageId?: string) => void
  /** Called when user cancels */
  onClose: () => void
}

/**
 * Prompt input dialog for AI image generation/editing.
 * Collects the prompt and mode, then fires onSubmit and closes.
 * The actual API call happens in the parent (background).
 */
export function AiImageDialog({
  currentImageSrc,
  imageId,
  onSubmit,
  onClose,
}: AiImageDialogProps) {
  const [prompt, setPrompt] = useState("")
  const [mode, setMode] = useState<"edit" | "generate">("edit")

  const handleSubmit = () => {
    if (!prompt.trim()) return
    onSubmit(prompt.trim(), mode === "edit" ? imageId : undefined)
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-8">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <h2 className="text-sm font-semibold">AI Image</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Mode toggle cards */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                mode === "edit"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-500/10"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <Pencil className={`h-4 w-4 mt-0.5 shrink-0 ${mode === "edit" ? "text-purple-600" : "text-muted-foreground"}`} />
              <div>
                <p className={`text-xs font-semibold ${mode === "edit" ? "text-purple-700 dark:text-purple-300" : ""}`}>
                  Edit this image
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  AI sees the current image and modifies it
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("generate")}
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                mode === "generate"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-500/10"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <ImagePlus className={`h-4 w-4 mt-0.5 shrink-0 ${mode === "generate" ? "text-purple-600" : "text-muted-foreground"}`} />
              <div>
                <p className={`text-xs font-semibold ${mode === "generate" ? "text-purple-700 dark:text-purple-300" : ""}`}>
                  Generate new
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Create from scratch using your description
                </p>
              </div>
            </button>
          </div>

          {/* Current image thumbnail + prompt */}
          <div className="flex gap-3">
            <img
              src={currentImageSrc}
              alt="Current"
              className="w-20 h-20 rounded-lg border object-cover bg-muted/30 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                {mode === "edit" ? "What should the AI change?" : "Describe the image"}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder={
                  mode === "edit"
                    ? "e.g., Make the background brighter, add more trees..."
                    : "e.g., A cheerful leopard family in a green forest, children's book style..."
                }
                rows={3}
                autoFocus
                className="w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Be descriptive — include style, colors, mood, and composition.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t shrink-0">
          <p className="text-[10px] text-muted-foreground">
            Runs in background — you can keep editing
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!prompt.trim()}
              className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white cursor-pointer transition-colors disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" />
              {mode === "edit" ? "Edit" : "Generate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
