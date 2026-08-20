import { getPdfJs } from "@/components/wizard/shared/pdfjsLoader"

const pageCountCache = new WeakMap<File, number>()

export function getCachedPdfPageCount(file: File): number | undefined {
  return pageCountCache.get(file)
}
export async function getPdfPageCount(file: File): Promise<number> {
  const cached = pageCountCache.get(file)
  if (cached !== undefined) return cached
  const pdfjs = await getPdfJs()
  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: buffer })
  const pdf = await loadingTask.promise
  try {
    const count = pdf.numPages
    pageCountCache.set(file, count)
    return count
  } finally {
    await loadingTask.destroy()
  }
}
