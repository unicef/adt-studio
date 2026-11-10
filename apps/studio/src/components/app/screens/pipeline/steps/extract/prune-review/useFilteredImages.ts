import { useCallback, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type LeftOutPage, type PageDetail } from "@/api/client"
import { pageQueryOptions } from "@/hooks/use-pages"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { ImageBounds, PageSize } from "@/components/app/screens/pipeline/steps/shared/page-inspector/types"
import { humanReason, REASON_ORDER, type HumanReason, type ReasonKind } from "../page-detail/humanReason"

type ImageSource = Pick<PageDetail, "imagesMeta" | "imageClassification">

export function leftOutQueryKey(label: string) {
  return ["books", label, "left-out"] as const
}

export interface FilteredImage {
  key: string
  pageId: string
  pageNumber: number
  imageId: string
  number: number
  rawReason?: string
  reason: HumanReason
  width?: number
  height?: number
  bounds?: ImageBounds
  pageSize: PageSize | null
  restored: boolean
}

export interface ReasonGroup {
  kind: ReasonKind
  items: FilteredImage[]
}

export interface PruneTotals {
  filtered: number
  pageElements: number
  kept: number
  pages: number
}

export function pruneTotals(pages: readonly PipelinePage[]): PruneTotals | null {
  if (!pages.some((page) => page.filteredImageCount !== undefined)) return null
  let filtered = 0
  let pageElements = 0
  let kept = 0
  let withFiltered = 0
  for (const page of pages) {
    filtered += page.filteredImageCount ?? 0
    pageElements += page.htmlImageCount ?? 0
    kept += page.keptImageCount ?? 0
    if ((page.filteredImageCount ?? 0) > 0) withFiltered++
  }
  return { filtered, pageElements, kept, pages: withFiltered }
}

export interface PageTierContext {
  pageSize: PageSize | null
  kept: ImageBounds[]
}

function pageSizeOf(page: PipelinePage, detail: ImageSource): PageSize | null {
  const pageMeta = detail.imagesMeta.find((entry) => entry.imageId === `${page.pageId}_page`)
  return pageMeta?.width && pageMeta.height ? { w: pageMeta.width, h: pageMeta.height } : page.pageWidth && page.pageHeight ? { w: page.pageWidth, h: page.pageHeight } : null
}

function contextOf(page: PipelinePage, detail: ImageSource): PageTierContext {
  const pageImageId = `${page.pageId}_page`
  const meta = new Map(detail.imagesMeta.map((entry) => [entry.imageId, entry]))
  const kept: ImageBounds[] = []
  for (const image of detail.imageClassification?.images ?? []) {
    if (image.isPruned || image.imageId === pageImageId) continue
    const bounds = meta.get(image.imageId)?.bounds
    if (bounds) kept.push(bounds)
  }
  return { pageSize: pageSizeOf(page, detail), kept }
}

function filteredOf(page: PipelinePage, detail: ImageSource): FilteredImage[] {
  const pageImageId = `${page.pageId}_page`
  const meta = new Map(detail.imagesMeta.map((entry) => [entry.imageId, entry]))
  const order = new Map(detail.imagesMeta.map((entry, index) => [entry.imageId, index]))
  const pageSize = pageSizeOf(page, detail)
  const images = (detail.imageClassification?.images ?? []).filter((image) => image.imageId !== pageImageId)
  return [...images]
    .sort((a, b) => (order.get(a.imageId) ?? Infinity) - (order.get(b.imageId) ?? Infinity) || a.imageId.localeCompare(b.imageId))
    .map((image, index) => ({ image, number: index + 1 }))
    .filter(({ image }) => image.isPruned)
    .map(({ image, number }) => {
      const info = meta.get(image.imageId)
      return {
        key: `${page.pageId}/${image.imageId}`,
        pageId: page.pageId,
        pageNumber: page.pageNumber,
        imageId: image.imageId,
        number,
        rawReason: image.reason,
        reason: humanReason(image.reason),
        width: info?.width,
        height: info?.height,
        bounds: info?.bounds,
        pageSize,
        restored: false,
      }
    })
}

export function groupByReason(items: readonly FilteredImage[]): ReasonGroup[] {
  const groups = new Map<ReasonKind, FilteredImage[]>()
  for (const item of items) {
    const list = groups.get(item.reason.kind) ?? []
    list.push(item)
    groups.set(item.reason.kind, list)
  }
  return REASON_ORDER.filter((kind) => groups.has(kind)).map((kind) => ({ kind, items: groups.get(kind) ?? [] }))
}

type SaveMode = "restore" | "filter"

export function useFilteredImages(
  label: string,
  pages: readonly PipelinePage[],
  { enabled, blocked, focusPageId = null }: { enabled: boolean; blocked: boolean; focusPageId?: string | null },
) {
  const queryClient = useQueryClient()
  const candidates = useMemo(() => {
    const list = pages.filter((page) => (page.filteredImageCount ?? page.imageCount) > 0)
    const index = focusPageId ? list.findIndex((page) => page.pageId === focusPageId) : -1
    return index > 0 ? [list[index], ...list.slice(0, index), ...list.slice(index + 1)] : list
  }, [pages, focusPageId])
  const signature = useMemo(() => candidates.map((page) => `${page.pageId}:${page.filteredImageCount ?? ""}:${page.keptImageCount ?? ""}`).join(","), [candidates])
  const scan = useQuery({
    queryKey: [...leftOutQueryKey(label), signature],
    queryFn: () => api.getLeftOut(label),
    enabled: enabled && candidates.length > 0,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  })
  const details = useMemo(() => {
    const byPage = new Map((scan.data?.pages ?? []).map((entry) => [entry.pageId, entry]))
    return candidates.map((page) => byPage.get(page.pageId))
  }, [scan.data, candidates])

  const loaded = details.filter((detail) => detail !== undefined).length
  const contexts = useMemo(() => {
    const map = new Map<string, PageTierContext>()
    candidates.forEach((page, index) => {
      const detail = details[index]
      if (detail) map.set(page.pageId, contextOf(page, detail))
    })
    return map
  }, [candidates, details])
  const fromServer = useMemo(
    () =>
      candidates.flatMap((page, index) => {
        const detail = details[index]
        return detail ? filteredOf(page, detail) : []
      }),
    [candidates, details],
  )

  const [restored, setRestored] = useState<Map<string, FilteredImage>>(() => new Map())
  const [busy, setBusy] = useState<Set<string>>(() => new Set())
  const [failed, setFailed] = useState<string | null>(null)
  const chain = useRef<Promise<void>>(Promise.resolve())

  const items = useMemo(() => {
    const live = new Set(fromServer.map((item) => item.key))
    const back = [...restored.values()].filter((item) => !live.has(item.key))
    return [...fromServer, ...back].sort((a, b) => a.pageNumber - b.pageNumber || a.number - b.number)
  }, [fromServer, restored])
  const groups = useMemo(() => groupByReason(items), [items])

  const savePage = useCallback(
    async (pageId: string, list: FilteredImage[], mode: SaveMode) => {
      const key = pageQueryOptions(label, pageId).queryKey
      const detail = queryClient.getQueryData<PageDetail>(key)
      const bulk = queryClient
        .getQueriesData<{ pages: LeftOutPage[] }>({ queryKey: leftOutQueryKey(label) })
        .flatMap(([, value]) => value?.pages ?? [])
        .find((entry) => entry.pageId === pageId)
      const base = detail?.imageClassification ?? bulk?.imageClassification ?? (await api.getPage(label, pageId)).imageClassification
      if (!base) return
      const hits = new Map(list.map((item) => [item.imageId, item]))
      const images = base.images.map((image) => {
        const hit = hits.get(image.imageId)
        if (!hit) return image
        return mode === "restore" ? { ...image, isPruned: false, reason: undefined } : { ...image, isPruned: true, reason: hit.rawReason ?? "manual" }
      })
      const next = { ...base, images }
      await api.updateImageClassification(label, pageId, next)
      if (detail) queryClient.setQueryData<PageDetail>(key, { ...detail, imageClassification: next })
      queryClient.setQueriesData<{ pages: LeftOutPage[] }>({ queryKey: leftOutQueryKey(label) }, (previous) =>
        previous ? { pages: previous.pages.map((entry) => (entry.pageId === pageId ? { ...entry, imageClassification: next } : entry)) } : previous,
      )
    },
    [label, queryClient],
  )

  const run = useCallback(
    (list: FilteredImage[], mode: SaveMode) => {
      if (blocked || list.length === 0) return Promise.resolve()
      const keys = list.map((item) => item.key)
      setFailed(null)
      setBusy((previous) => new Set([...previous, ...keys]))
      const byPage = new Map<string, FilteredImage[]>()
      for (const item of list) byPage.set(item.pageId, [...(byPage.get(item.pageId) ?? []), item])
      const task = chain.current.then(async () => {
        try {
          for (const [pageId, pageItems] of byPage) {
            await savePage(pageId, pageItems, mode)
            setRestored((previous) => {
              const next = new Map(previous)
              for (const item of pageItems) {
                if (mode === "restore") next.set(item.key, { ...item, restored: true })
                else next.delete(item.key)
              }
              return next
            })
          }
        } catch (error) {
          setFailed(error instanceof Error ? error.message : String(error))
        } finally {
          setBusy((previous) => {
            const next = new Set(previous)
            for (const key of keys) next.delete(key)
            return next
          })
          void queryClient.invalidateQueries({ queryKey: ["books", label, "pages"], exact: true })
        }
      })
      chain.current = task
      return task
    },
    [blocked, label, queryClient, savePage],
  )

  const bringBack = useCallback((list: FilteredImage[]) => run(list.filter((item) => !item.restored), "restore"), [run])
  const undo = useCallback((list: FilteredImage[]) => run(list.filter((item) => item.restored), "filter"), [run])

  return {
    items,
    groups,
    contexts,
    loading: enabled && candidates.length > 0 && !scan.data && !scan.isError,
    loaded,
    total: candidates.length,
    busy,
    failed,
    blocked,
    bringBack,
    undo,
  }
}

export type FilteredImagesApi = ReturnType<typeof useFilteredImages>
