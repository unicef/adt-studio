import { getPdfJs } from "@/components/wizard/core/pdf/pdfjsLoader"

const pageCountCache = new WeakMap<File, number>()

export function getCachedPdfPageCount(file: File): number | undefined {
  return pageCountCache.get(file)
}

export async function getPdfPageCount(file: File): Promise<number> {
  const cached = pageCountCache.get(file)
  if (cached !== undefined) return cached
  const pdfjs = await getPdfJs()
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  try {
    const count = pdf.numPages
    pageCountCache.set(file, count)
    return count
  } finally {
    await pdf.destroy()
  }
}
