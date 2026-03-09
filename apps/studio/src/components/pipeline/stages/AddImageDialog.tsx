import { useState, useRef, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, ImagePlus, Upload, Sparkles, X, ArrowLeft, Search, Loader2 } from "lucide-react"
import { api, BASE_URL } from "@/api/client"

type Step = "choose" | "pick" | "upload" | "generate"

interface AddImageDialogProps {
  bookLabel: string
  onSelectExisting: (imageIds: string[]) => void
  onUpload: (file: File) => void
  onGenerate: (prompt: string) => void
  onClose: () => void
}

/**
 * Wizard dialog for adding an image to a section.
 * Three modes: pick from existing book images, upload a file, or generate with AI.
 */
export function AddImageDialog({
  bookLabel,
  onSelectExisting,
  onUpload,
  onGenerate,
  onClose,
}: AddImageDialogProps) {
  const [step, setStep] = useState<Step>("choose")
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [prompt, setPrompt] = useState("")
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Revoke object URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    }
  }, [uploadPreview])

  // Fetch all images when picking from existing
  const imagesQuery = useQuery({
    queryKey: ["books", bookLabel, "images"],
    queryFn: () => api.listBookImages(bookLabel),
    enabled: step === "pick",
    staleTime: 30_000,
  })

  const filteredImages = imagesQuery.data?.images.filter((img) =>
    !filter || img.imageId.toLowerCase().includes(filter.toLowerCase())
  )

  // Exclude page-render images (full page renders) — only show extracted/cropped/generated/uploaded
  const selectableImages = filteredImages?.filter((img) => img.source !== "page")

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setUploadFile(file)
    if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    const url = URL.createObjectURL(file)
    setUploadPreview(url)
  }

  const handleUploadConfirm = () => {
    if (!uploadFile) return
    if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    onUpload(uploadFile)
  }

  const handleGenerateSubmit = () => {
    if (!prompt.trim()) return
    onGenerate(prompt.trim())
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-8">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            {step !== "choose" && (
              <button
                type="button"
                onClick={() => {
                  setStep("choose")
                  if (uploadPreview) {
                    URL.revokeObjectURL(uploadPreview)
                    setUploadPreview(null)
                    setUploadFile(null)
                  }
                }}
                className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <ImagePlus className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold">
              {step === "choose" && "Add Image"}
              {step === "pick" && "Pick from Book"}
              {step === "upload" && "Upload Image"}
              {step === "generate" && "Generate with AI"}
            </h2>
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
        <div className="flex-1 overflow-y-auto">
          {/* Step: Choose method */}
          {step === "choose" && (
            <div className="p-5 space-y-2">
              <MethodCard
                icon={<ImagePlus className="h-4 w-4" />}
                title="Pick from book"
                description="Choose an existing image from this project"
                onClick={() => setStep("pick")}
              />
              <MethodCard
                icon={<Upload className="h-4 w-4" />}
                title="Upload image"
                description="Upload a new image file from your computer"
                onClick={() => setStep("upload")}
              />
              <MethodCard
                icon={<Sparkles className="h-4 w-4" />}
                title="Generate with AI"
                description="Create a new image from a text description"
                onClick={() => setStep("generate")}
              />
            </div>
          )}

          {/* Step: Pick from existing */}
          {step === "pick" && (
            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter by image ID..."
                  className="w-full text-sm border rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  autoFocus
                />
              </div>

              {imagesQuery.isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {selectableImages && selectableImages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  {filter ? "No images match your filter" : "No images in this book"}
                </p>
              )}

              {selectableImages && selectableImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {selectableImages.map((img) => {
                    const isSelected = selected.has(img.imageId)
                    return (
                      <button
                        key={img.imageId}
                        type="button"
                        onClick={() => {
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(img.imageId)) next.delete(img.imageId)
                            else next.add(img.imageId)
                            return next
                          })
                        }}
                        className={`group relative rounded border overflow-hidden bg-card flex flex-col items-center min-h-[60px] transition-all cursor-pointer ${
                          isSelected
                            ? "ring-2 ring-blue-500 border-blue-500"
                            : "hover:ring-2 hover:ring-blue-500/50"
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-1 right-1 z-10 h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <img
                          src={`${BASE_URL}/books/${bookLabel}/images/${img.imageId}`}
                          alt={img.imageId}
                          className="max-w-full h-auto block"
                          loading="lazy"
                        />
                        <div className="px-1.5 py-0.5 border-t bg-muted/30 w-full mt-auto">
                          <span className="text-[9px] text-muted-foreground truncate block">
                            {img.imageId}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step: Upload */}
          {step === "upload" && (
            <div className="p-5 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />

              {!uploadPreview ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/60 py-12 transition-colors cursor-pointer"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to select an image
                  </span>
                </button>
              ) : (
                <div className="space-y-3">
                  <img
                    src={uploadPreview}
                    alt="Preview"
                    className="max-w-full max-h-[300px] mx-auto rounded-lg border object-contain"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate">
                      {uploadFile?.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-blue-500 hover:text-blue-400 cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Generate with AI */}
          {step === "generate" && (
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Describe the image
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleGenerateSubmit()
                    }
                  }}
                  placeholder="e.g., A cheerful leopard family in a green forest, children's book style..."
                  rows={4}
                  autoFocus
                  className="w-full text-sm border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Be descriptive — include style, colors, mood, and composition.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === "pick" || step === "upload" || step === "generate") && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t shrink-0">
            <p className="text-[10px] text-muted-foreground">
              {step === "pick" && selected.size > 0
                ? `${selected.size} image${selected.size === 1 ? "" : "s"} selected`
                : step === "pick"
                  ? "Click images to select"
                  : step === "generate"
                    ? "Runs in background — you can keep editing"
                    : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {step === "pick" && (
                <button
                  type="button"
                  onClick={() => onSelectExisting(Array.from(selected))}
                  disabled={selected.size === 0}
                  className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white cursor-pointer transition-colors disabled:opacity-50"
                >
                  <ImagePlus className="h-3 w-3" />
                  {selected.size <= 1 ? "Add Image" : `Add ${selected.size} Images`}
                </button>
              )}
              {step === "upload" && (
                <button
                  type="button"
                  onClick={handleUploadConfirm}
                  disabled={!uploadFile}
                  className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white cursor-pointer transition-colors disabled:opacity-50"
                >
                  <Upload className="h-3 w-3" />
                  Add Image
                </button>
              )}
              {step === "generate" && (
                <button
                  type="button"
                  onClick={handleGenerateSubmit}
                  disabled={!prompt.trim()}
                  className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white cursor-pointer transition-colors disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3" />
                  Generate
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MethodCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-start gap-3 rounded-lg border p-3.5 text-left hover:border-blue-500/50 hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors cursor-pointer"
    >
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  )
}
