import { useEffect, useMemo, useState } from "react"
import { getPageThumbnailUrl } from "@/api/client"

const PORTRAIT = 3 / 4
const LANDSCAPE_FROM = 1.05

interface SizedPage {
  pageId: string
  pageWidth?: number | null
  pageHeight?: number | null
}

const PROBE_WIDTH = 100

function useThumbnailAspect(label: string, pageId: string | undefined): number | null {
  const url = pageId ? getPageThumbnailUrl(label, pageId, PROBE_WIDTH) : null
  const [measured, setMeasured] = useState<{ url: string; ratio: number } | null>(null)
  useEffect(() => {
    if (!url) return
    const image = new Image()
    image.decoding = "async"
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) setMeasured({ url, ratio: image.naturalWidth / image.naturalHeight })
    }
    image.src = url
    return () => {
      image.onload = null
    }
  }, [url])
  return measured && measured.url === url ? measured.ratio : null
}

const RATIO_KEY = "adt.page-ratio."

export function pageGridClass(landscape: boolean): string {
  return landscape ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
}

export interface StoredPageRatio {
  ratio: number
  single: number
}

export function parseStoredRatio(raw: string | null): StoredPageRatio | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === "number") return parsed > 0 ? { ratio: parsed, single: parsed } : null
    if (typeof parsed !== "object" || parsed === null) return null
    const { ratio, single } = parsed as Partial<StoredPageRatio>
    if (typeof ratio !== "number" || ratio <= 0) return null
    return { ratio, single: typeof single === "number" && single > 0 ? single : ratio }
  } catch {
    return null
  }
}

function storedPageRatio(label: string): StoredPageRatio | null {
  try {
    return parseStoredRatio(localStorage.getItem(RATIO_KEY + label))
  } catch {
    return null
  }
}

export function rememberedSingleRatio(label: string): number | null {
  return storedPageRatio(label)?.single ?? null
}

export function rememberedPageRatio(label: string): number {
  return storedPageRatio(label)?.ratio ?? PORTRAIT
}

export function isLandscapeRatio(ratio: number): boolean {
  return ratio > LANDSCAPE_FROM
}

export function runRatio(stored: StoredPageRatio | null, spread: boolean): number {
  const single = stored?.single ?? PORTRAIT
  return spread ? single * 2 : single
}

export function expectedRunRatio(label: string, spread: boolean): number {
  return runRatio(storedPageRatio(label), spread)
}

export function isSpreadPageId(pageId: string): boolean {
  return (pageId.slice(2).match(/\d{3}/g)?.length ?? 0) > 1
}

function majorityRatio(ratios: readonly number[]): number | null {
  if (ratios.length === 0) return null
  const landscapeCount = ratios.filter((ratio) => ratio > LANDSCAPE_FROM).length
  return landscapeCount > ratios.length / 2
    ? (ratios.find((value) => value > LANDSCAPE_FROM) ?? PORTRAIT)
    : (ratios.find((value) => value <= LANDSCAPE_FROM) ?? PORTRAIT)
}

export interface MeasuredRatio {
  ratio: number
  single: number
}

export function measureRatios(sized: ReadonlyArray<{ ratio: number; spread: boolean }>): MeasuredRatio | null {
  const ratio = majorityRatio(sized.map((entry) => entry.ratio))
  if (ratio == null) return null
  const singles = majorityRatio(sized.filter((entry) => !entry.spread).map((entry) => entry.ratio))
  const spreads = majorityRatio(sized.filter((entry) => entry.spread).map((entry) => entry.ratio))
  return { ratio, single: singles ?? (spreads != null ? spreads / 2 : ratio) }
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

export function usePageAspect(
  label: string,
  pages: readonly SizedPage[] | undefined,
  { expected = null }: { expected?: number | null } = {},
): PageAspect {
  const list = pages ?? []
  const knownKey = list
    .flatMap((page) => {
      const ratio = sizedRatio(page)
      return ratio == null ? [] : [`${ratio}:${isSpreadPageId(page.pageId) ? 1 : 0}`]
    })
    .join(",")
  const probe = knownKey === "" ? list[Math.floor(list.length / 2)]?.pageId : undefined
  const probed = useThumbnailAspect(label, probe)

  const measuredRatios = useMemo(() => {
    if (knownKey !== "") {
      return measureRatios(
        knownKey.split(",").map((entry) => {
          const [ratio, spread] = entry.split(":")
          return { ratio: Number(ratio), spread: spread === "1" }
        }),
      )
    }
    return probed != null && probe ? measureRatios([{ ratio: probed, spread: isSpreadPageId(probe) }]) : null
  }, [knownKey, probed, probe])
  const measured = measuredRatios?.ratio ?? null
  const measuredSingle = measuredRatios?.single ?? null

  const aspect = useMemo(() => {
    const ratio = expected ?? measured ?? rememberedPageRatio(label)
    const landscape = ratio > LANDSCAPE_FROM
    const ratioOf = (page: SizedPage) => sizedRatio(page) ?? ratio
    return {
      ratio,
      landscape,
      gridClass: pageGridClass(landscape),
      ratioOf,
      fitOf: (page: SizedPage) => (ratioOf(page) > LANDSCAPE_FROM === landscape ? "cover" : "contain"),
      railThumbClassOf: (page: SizedPage) => (ratioOf(page) > LANDSCAPE_FROM ? "h-[38px] w-[54px]" : "h-[52px] w-[38px]"),
    }
  }, [expected, measured, label])

  useEffect(() => {
    if (measured == null || measuredSingle == null || !label) return
    try {
      localStorage.setItem(RATIO_KEY + label, JSON.stringify({ ratio: measured, single: measuredSingle }))
    } catch {
      return
    }
  }, [label, measured, measuredSingle])

  return aspect
}
