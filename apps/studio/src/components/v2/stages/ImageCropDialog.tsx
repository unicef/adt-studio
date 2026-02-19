import { useState, useCallback, useEffect } from "react"
import Cropper from "react-easy-crop"
import type { Area } from "react-easy-crop"
import { Loader2 } from "lucide-react"

const ASPECT_PRESETS = [
  { label: "Free", value: null },
  { label: "Original", value: "original" as const },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:4", value: 3 / 4 },
  { label: "2:3", value: 2 / 3 },
] as const

type AspectValue = null | "original" | number

interface ImageCropDialogProps {
  /** Image URL to crop */
  imageSrc: string
  /** Called with the cropped image blob */
  onApply: (blob: Blob) => Promise<void>
  /** Called when user cancels */
  onClose: () => void
}

/**
 * Full-screen dialog for cropping images using react-easy-crop.
 * Supports zoom/pan, aspect ratio presets, and custom W×H input.
 * Output is scaled to the original image width so display size is preserved.
 */
export function ImageCropDialog({ imageSrc, onApply, onClose }: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [applying, setApplying] = useState(false)

  // Aspect ratio state
  const [aspectMode, setAspectMode] = useState<AspectValue>(null)
  const [originalAspect, setOriginalAspect] = useState<number | undefined>(undefined)
  const [customW, setCustomW] = useState("4")
  const [customH, setCustomH] = useState("3")
  const [showCustom, setShowCustom] = useState(false)

  // Detect original image aspect ratio on load
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setOriginalAspect(img.naturalWidth / img.naturalHeight)
    }
    img.src = imageSrc
  }, [imageSrc])

  // Compute the actual numeric aspect for the Cropper
  const resolvedAspect = (() => {
    if (aspectMode === null) return undefined // free-form
    if (aspectMode === "original") return originalAspect
    return aspectMode
  })()

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPx: Area) => {
    setCroppedAreaPixels(croppedAreaPx)
  }, [])

  const handleAspectChange = (value: AspectValue) => {
    setAspectMode(value)
    setShowCustom(false)
    // Reset crop position when aspect changes
    setCrop({ x: 0, y: 0 })
  }

  const applyCustomAspect = () => {
    const w = parseFloat(customW)
    const h = parseFloat(customH)
    if (w > 0 && h > 0) {
      setAspectMode(w / h)
      setShowCustom(false)
      setCrop({ x: 0, y: 0 })
    }
  }

  const handleApply = async () => {
    if (!croppedAreaPixels) return
    setApplying(true)
    try {
      const blob = await getCroppedImage(imageSrc, croppedAreaPixels)
      await onApply(blob)
    } finally {
      setApplying(false)
    }
  }

  // Check if the current aspectMode matches a preset
  const isPresetActive = (preset: (typeof ASPECT_PRESETS)[number]) => {
    if (preset.value === null) return aspectMode === null
    if (preset.value === "original") return aspectMode === "original"
    return aspectMode === preset.value
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-background border-b shrink-0">
        <h2 className="text-sm font-medium">Crop Image</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || !croppedAreaPixels}
            className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white cursor-pointer transition-colors disabled:opacity-50"
          >
            {applying && <Loader2 className="h-3 w-3 animate-spin" />}
            Apply
          </button>
        </div>
      </div>

      {/* Cropper area */}
      <div className="flex-1 relative">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={resolvedAspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      {/* Controls bar */}
      <div className="bg-background border-t shrink-0">
        {/* Aspect ratio presets */}
        <div className="flex items-center justify-center gap-1 px-4 pt-3 pb-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground mr-1.5">Aspect:</span>
          {ASPECT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handleAspectChange(preset.value)}
              className={`text-[10px] font-medium rounded px-2 py-1 transition-colors cursor-pointer ${
                isPresetActive(preset)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            className={`text-[10px] font-medium rounded px-2 py-1 transition-colors cursor-pointer ${
              showCustom ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
            }`}
          >
            Custom
          </button>
        </div>

        {/* Custom aspect ratio input */}
        {showCustom && (
          <div className="flex items-center justify-center gap-2 px-4 pb-1.5">
            <input
              type="number"
              min="1"
              value={customW}
              onChange={(e) => setCustomW(e.target.value)}
              className="w-14 h-6 text-[11px] text-center border rounded bg-muted/50 px-1"
            />
            <span className="text-[10px] text-muted-foreground">:</span>
            <input
              type="number"
              min="1"
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              className="w-14 h-6 text-[11px] text-center border rounded bg-muted/50 px-1"
            />
            <button
              type="button"
              onClick={applyCustomAspect}
              className="text-[10px] font-medium rounded px-2 py-1 bg-primary text-primary-foreground cursor-pointer"
            >
              Set
            </button>
          </div>
        )}

        {/* Zoom slider */}
        <div className="flex items-center justify-center gap-3 px-4 pb-3 pt-1.5">
          <span className="text-[10px] text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-48"
          />
          <span className="text-[10px] text-muted-foreground w-8">{zoom.toFixed(1)}x</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Crop an image using canvas and return as a Blob.
 * The output is scaled to the original image's full width so that
 * the cropped image maintains the same display size in the layout.
 */
async function getCroppedImage(imageSrc: string, crop: Area): Promise<Blob> {
  const image = await loadImage(imageSrc)

  // Scale the cropped area to the original image width.
  // This preserves display size in layouts using max-width/width: 100%.
  const scale = image.naturalWidth / crop.width
  const outputWidth = image.naturalWidth
  const outputHeight = Math.round(crop.height * scale)

  const canvas = document.createElement("canvas")
  canvas.width = outputWidth
  canvas.height = outputHeight
  const ctx = canvas.getContext("2d")!

  // Draw the cropped region scaled up to fill the output canvas
  ctx.drawImage(
    image,
    crop.x, crop.y, crop.width, crop.height,
    0, 0, outputWidth, outputHeight
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Canvas toBlob failed"))
      },
      "image/png"
    )
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
