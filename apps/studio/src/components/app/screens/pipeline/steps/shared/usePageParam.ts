import { useCallback, useEffect, useRef } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"

export interface PageParam {
  pageParam: string | null
  openPage: (pageId: string) => void
  stepPage: (pageId: string) => void
  closeDetail: () => void
}

export function usePageParam(label: string, slug: string): PageParam {
  const search = useSearch({ strict: false })
  const navigate = useNavigate()

  const pageParam = typeof search.page === "string" && search.page ? search.page : null

  const go = useCallback(
    (page: string | null, replace: boolean, viewTransition = false) => {
      void navigate({
        to: "/pipeline/$label/$step",
        params: { label, step: slug },
        search: (prev) => ({ ...prev, page: page ?? undefined }),
        replace,
        viewTransition,
      })
    },
    [navigate, label, slug],
  )

  const detailOpen = pageParam !== null
  const openPage = useCallback((pageId: string) => go(pageId, false, !detailOpen), [go, detailOpen])
  const stepPage = useCallback((pageId: string) => go(pageId, true), [go])
  const closeDetail = useCallback(() => go(null, false, true), [go])

  return { pageParam, openPage, stepPage, closeDetail }
}

export function useDetailFocus(pageParam: string | null) {
  const lastOpened = useRef<string | null>(null)
  useEffect(() => {
    let frame = 0
    if (pageParam) {
      lastOpened.current = pageParam
      frame = requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true }))
    } else if (lastOpened.current) {
      const pageId = lastOpened.current
      frame = requestAnimationFrame(() => {
        const card = document.querySelector<HTMLElement>(`[data-page-card="${CSS.escape(pageId)}"]`)
        if (!card) {
          document.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true })
          return
        }
        card.scrollIntoView({ block: "center" })
        card.focus({ preventScroll: true })
      })
    }
    return () => cancelAnimationFrame(frame)
  }, [pageParam])
}
