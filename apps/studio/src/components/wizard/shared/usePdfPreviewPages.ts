import { useEffect, useState } from "react"
import { getPdfJs, PDF_WASM_OPTIONS } from "@/components/wizard/shared/pdfjsLoader"

const JPEG_QUALITY = 0.92
const MAX_CACHE_ENTRIES = 12

type CachedPreview = { dataUrls: string[]; pageLabels: string[] | null }

const previewCache = new Map<string, CachedPreview>()

function rememberInCache(key: string, entry: CachedPreview) {
  if (previewCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = previewCache.keys().next().value
    if (oldest !== undefined) previewCache.delete(oldest)
  }
  previewCache.set(key, entry)
}

type PdfPreviewMode = "first" | "all"

interface UsePdfPreviewPagesParams {
  file?: File | null
  src?: string
  mode: PdfPreviewMode
  width?: number
  height?: number
}

function buildCacheKey({ file, src, mode, width, height }: UsePdfPreviewPagesParams): string {
  if (file) {
    return `v2:file:${file.name}:${file.lastModified}:${file.size}:${mode}:${width ?? "-"}:${height ?? "-"}`
  }
  return `v2:src:${src ?? ""}:${mode}:${width ?? "-"}:${height ?? "-"}`
}

export function usePdfPreviewPages(params: UsePdfPreviewPagesParams) {
  const { file, src, mode, width, height } = params
  const [pages, setPages] = useState<string[]>([])
  const [pageLabels, setPageLabels] = useState<string[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const hasFile = Boolean(file)
    const hasSrc = Boolean(src)
    if (!hasFile && !hasSrc) {
      setPages([])
      setPageLabels(null)
      setIsLoading(false)
      setError(null)
      return
    }

    const cacheKey = buildCacheKey(params)
    const cached = previewCache.get(cacheKey)
    if (cached) {
      setPages(cached.dataUrls)
      setPageLabels(cached.pageLabels)
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    setPages([])
    setPageLabels(null)
    setIsLoading(true)
    setError(null)

    ;(async () => {
      try {
        const documentSource = file
          ? { url: (objectUrl = URL.createObjectURL(file)), ...PDF_WASM_OPTIONS }
          : { url: src as string, ...PDF_WASM_OPTIONS }

        const pdfjs = await getPdfJs()
        if (cancelled) return

        const pdf = await pdfjs.getDocument(documentSource).promise
        if (cancelled) {
          await pdf.destroy().catch(() => {})
          return
        }

        try {
          const rawLabels = await pdf.getPageLabels()
          if (cancelled) return

          const normalizedLabels: string[] | null =
            rawLabels && rawLabels.length > 0
              ? rawLabels.map((label, idx) => {
                  const s = label?.trim() ?? ""
                  return s !== "" ? s : String(idx + 1)
                })
              : null

          const result: string[] = []
          const lastPage = mode === "first" ? 1 : pdf.numPages
          const labelSlice =
            normalizedLabels === null ? null : normalizedLabels.slice(0, lastPage)

          if (cancelled) return
          setPageLabels(labelSlice)

          for (let pageNumber = 1; pageNumber <= lastPage; pageNumber++) {
            const page = await pdf.getPage(pageNumber)
            if (cancelled) return

            const base = page.getViewport({ scale: 1 })
            const scale =
              mode === "first" && width && height
                ? Math.min(width / base.width, height / base.height)
                : mode === "all" && width
                  ? width / base.width
                  : 1200 / base.width
            const viewport = page.getViewport({ scale })
            const canvas = document.createElement("canvas")
            const ctx = canvas.getContext("2d")
            if (!ctx) throw new Error("Canvas context unavailable")

            canvas.width = Math.floor(viewport.width)
            canvas.height = Math.floor(viewport.height)
            await page.render({ canvas, canvasContext: ctx, viewport }).promise
            if (cancelled) return

            result.push(canvas.toDataURL("image/jpeg", JPEG_QUALITY))
            page.cleanup()
            canvas.width = 0

            setPages([...result])
            if (pageNumber === 1) setIsLoading(false)
          }

          rememberInCache(cacheKey, { dataUrls: result, pageLabels: labelSlice })
        } catch (error) {
          throw error
        }
        finally {
          await pdf.destroy().catch(() => {})
        }
      } catch {
        if (cancelled) return
        setError("preview-error")
        setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, src, mode, width, height])

  return { pages, pageLabels, isLoading, error }
}

export function getPreviewPageLabel(pageLabels: string[] | null, index: number): string {
  const physical = String(index + 1)
  if (!pageLabels || index < 0 || index >= pageLabels.length) return physical
  const label = pageLabels[index]?.trim()
  return label !== undefined && label !== "" ? label : physical
}
