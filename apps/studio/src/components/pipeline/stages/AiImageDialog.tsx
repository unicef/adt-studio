import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Sparkles, X, Pencil, ImagePlus, ChevronDown, Image as ImageIcon } from "lucide-react"
import { api, BASE_URL } from "@/api/client"

const STYLE_PRESETS = [
  { value: "", label: "Default (from prompt)" },
  { value: "watercolor", label: "Watercolor" },
  { value: "flat-vector", label: "Flat Vector" },
  { value: "cartoon", label: "Cartoon" },
  { value: "realistic", label: "Realistic / Photo" },
  { value: "pencil-sketch", label: "Pencil Sketch" },
  { value: "collage", label: "Paper Collage" },
  { value: "pixel-art", label: "Pixel Art" },
  { value: "storybook", label: "Classic Storybook" },
] as const

const IMAGE_TYPES = [
  { value: "", label: "Auto" },
  { value: "illustration", label: "Illustration" },
  { value: "photograph", label: "Photograph" },
  { value: "diagram", label: "Diagram" },
  { value: "chart", label: "Chart / Graph" },
  { value: "infographic", label: "Infographic" },
  { value: "map", label: "Map" },
  { value: "cartoon", label: "Cartoon" },
] as const

interface AiImageDialogProps {
  /** Current image URL (for reference) */
  currentImageSrc: string
  /** Image ID being edited */
  imageId: string
  /** Book label (for fetching images for style reference) */
  bookLabel: string
  /** Called when the user submits — dialog closes immediately, parent handles async */
  onSubmit: (prompt: string, referenceImageId?: string, options?: { style?: string; imageType?: string; styleImageId?: string }) => void
  /** Called when user cancels */
  onClose: () => void
}

/**
 * Prompt input dialog for AI image generation/editing.
 * Collects the prompt, mode, style, and image type, then fires onSubmit and closes.
 * The actual API call happens in the parent (background).
 */
export function AiImageDialog({
  currentImageSrc,
  imageId,
  bookLabel,
  onSubmit,
  onClose,
}: AiImageDialogProps) {
  const [prompt, setPrompt] = useState("")
  const [mode, setMode] = useState<"edit" | "generate">("edit")
  const [stylePreset, setStylePreset] = useState("")
  const [imageType, setImageType] = useState("")
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [styleImageId, setStyleImageId] = useState<string | null>(null)

  // Fetch book images for style reference picker
  const imagesQuery = useQuery({
    queryKey: ["books", bookLabel, "images"],
    queryFn: () => api.listBookImages(bookLabel),
    enabled: showStylePicker,
    staleTime: 30_000,
  })

  const selectableImages = useMemo(
    () => imagesQuery.data?.images.filter((img) => img.source !== "page") ?? [],
    [imagesQuery.data],
  )

  const resolvedStyle = stylePreset === "custom-image"
    ? undefined  // style comes from the image reference instead
    : stylePreset || undefined

  const handleSubmit = () => {
    if (!prompt.trim()) return
    const options: { style?: string; imageType?: string; styleImageId?: string } = {}
    if (resolvedStyle) options.style = resolvedStyle
    if (imageType) options.imageType = imageType
    if (styleImageId) options.styleImageId = styleImageId
    onSubmit(
      prompt.trim(),
      mode === "edit" ? imageId : undefined,
      Object.keys(options).length > 0 ? options : undefined,
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-8">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[85vh]">
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
        <div className="p-5 space-y-4 overflow-y-auto">
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
                    : "e.g., A cheerful leopard family in a green forest..."
                }
                rows={3}
                autoFocus
                className="w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
            </div>
          </div>

          {/* Style & Image Type selectors */}
          <div className="grid grid-cols-2 gap-3">
            {/* Style preset */}
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Style
              </label>
              <div className="relative">
                <select
                  value={stylePreset}
                  onChange={(e) => {
                    setStylePreset(e.target.value)
                    if (e.target.value !== "custom-image") {
                      setStyleImageId(null)
                      setShowStylePicker(false)
                    }
                  }}
                  className="w-full text-xs border rounded-lg px-3 py-2 pr-7 appearance-none bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/30 cursor-pointer"
                >
                  {STYLE_PRESETS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                  <option value="custom-image">From reference image...</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Image type (generate mode only) */}
            {mode === "generate" && (
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Image Type
                </label>
                <div className="relative">
                  <select
                    value={imageType}
                    onChange={(e) => setImageType(e.target.value)}
                    className="w-full text-xs border rounded-lg px-3 py-2 pr-7 appearance-none bg-background focus:outline-none focus:ring-2 focus:ring-purple-500/30 cursor-pointer"
                  >
                    {IMAGE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            )}
          </div>

          {/* Style reference image picker */}
          {stylePreset === "custom-image" && (
            <div className="space-y-2">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
                Style reference image
              </label>
              {!showStylePicker ? (
                <button
                  type="button"
                  onClick={() => setShowStylePicker(true)}
                  className="w-full flex items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-purple-500/50 p-3 transition-colors cursor-pointer"
                >
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {styleImageId ? `Selected: ${styleImageId}` : "Click to pick a style reference image"}
                  </span>
                </button>
              ) : (
                <div className="border rounded-lg p-2 max-h-[140px] overflow-y-auto">
                  {imagesQuery.isLoading && (
                    <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
                  )}
                  {selectableImages.length > 0 && (
                    <div className="grid grid-cols-5 gap-1.5">
                      {selectableImages.map((img) => (
                        <button
                          key={img.imageId}
                          type="button"
                          onClick={() => {
                            setStyleImageId(img.imageId)
                            setShowStylePicker(false)
                          }}
                          className={`relative rounded border overflow-hidden bg-card transition-all cursor-pointer ${
                            styleImageId === img.imageId
                              ? "ring-2 ring-purple-500 border-purple-500"
                              : "hover:ring-2 hover:ring-purple-500/50"
                          }`}
                        >
                          <img
                            src={`${BASE_URL}/books/${bookLabel}/images/${img.imageId}`}
                            alt={img.imageId}
                            className="w-full h-12 object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  {selectableImages.length === 0 && !imagesQuery.isLoading && (
                    <p className="text-xs text-muted-foreground text-center py-4">No images in this book</p>
                  )}
                </div>
              )}
              {styleImageId && (
                <div className="flex items-center gap-2">
                  <img
                    src={`${BASE_URL}/books/${bookLabel}/images/${styleImageId}`}
                    alt="Style reference"
                    className="w-10 h-10 rounded border object-cover"
                  />
                  <span className="text-[10px] text-muted-foreground flex-1 truncate">{styleImageId}</span>
                  <button
                    type="button"
                    onClick={() => { setStyleImageId(null); setShowStylePicker(false) }}
                    className="text-[10px] text-red-500 hover:text-red-400 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            {mode === "edit"
              ? "The AI will preserve the original style while applying your changes."
              : "Be descriptive — include subject, colors, mood, and composition."}
          </p>
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
