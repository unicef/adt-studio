import { useMemo } from "react"
import { usePageImage } from "@/hooks/use-pages"

const PORTRAIT = 3 / 4
const LANDSCAPE_FROM = 1.05

interface SizedPage {
  pageId: string
  pageWidth?: number | null
  pageHeight?: number | null
}

function pngAspect(base64: string | undefined): number | null {
  if (!base64) return null
  try {
    const head = atob(base64.slice(0, 44))
    if (head.slice(1, 4) !== "PNG") return null
    const read = (offset: number) =>
      ((head.charCodeAt(offset) << 24) | (head.charCodeAt(offset + 1) << 16) | (head.charCodeAt(offset + 2) << 8) | head.charCodeAt(offset + 3)) >>> 0
    const width = read(16)
    const height = read(20)
    return width > 0 && height > 0 ? width / height : null
  } catch {
    return null
  }
}

function sizedRatio(page: SizedPage | undefined): number | null {
  return page?.pageWidth && page.pageHeight ? page.pageWidth / page.pageHeight : null
}

export interface PageAspect {
  ratio: number
  landscape: boolean
  gridClass: string
  ratioOf: (page: SizedPage) => number
  fitOf: (page: SizedPage) => "cover" | "contain"
  railThumbClassOf: (page: SizedPage) => string
}

export function usePageAspect(label: string, pages: readonly SizedPage[] | undefined): PageAspect {
  const list = pages ?? []
  const knownKey = list
    .map(sizedRatio)
    .filter((ratio): ratio is number => ratio != null)
    .join(",")
  const probe = knownKey === "" ? list[Math.floor(list.length / 2)]?.pageId : undefined
  const image = usePageImage(label, probe ?? "", { enabled: !!probe })
  const probed = pngAspect(image.data?.imageBase64)

  return useMemo(() => {
    const known = knownKey === "" ? [] : knownKey.split(",").map(Number)
    const landscapeCount = known.filter((ratio) => ratio > LANDSCAPE_FROM).length
    const ratio =
      known.length > 0
        ? landscapeCount > known.length / 2
          ? (known.find((value) => value > LANDSCAPE_FROM) ?? PORTRAIT)
          : (known.find((value) => value <= LANDSCAPE_FROM) ?? PORTRAIT)
        : (probed ?? PORTRAIT)
    const landscape = ratio > LANDSCAPE_FROM
    const ratioOf = (page: SizedPage) => sizedRatio(page) ?? ratio
    return {
      ratio,
      landscape,
      gridClass: landscape ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
      ratioOf,
      fitOf: (page: SizedPage) => (ratioOf(page) > LANDSCAPE_FROM === landscape ? "cover" : "contain"),
      railThumbClassOf: (page: SizedPage) => (ratioOf(page) > LANDSCAPE_FROM ? "h-[38px] w-[54px]" : "h-[52px] w-[38px]"),
    }
  }, [knownKey, probed])
}
