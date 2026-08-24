import { useCallback } from "react"
import { useNavigate, useSearch } from "@tanstack/react-router"

export interface ExtractPageParam {
  pageParam: string | null
  openPage: (pageId: string) => void
  stepPage: (pageId: string) => void
  closeDetail: () => void
}

export function useExtractPageParam(label: string, slug: string): ExtractPageParam {
  const search = useSearch({ strict: false })
  const navigate = useNavigate()

  const pageParam = typeof search.page === "string" && search.page ? search.page : null

  const go = useCallback(
    (page: string | null, replace: boolean) => {
      void navigate({
        to: "/pipeline/$label/$step",
        params: { label, step: slug },
        search: page ? { page } : {},
        replace,
      })
    },
    [navigate, label, slug],
  )

  const openPage = useCallback((pageId: string) => go(pageId, false), [go])
  const stepPage = useCallback((pageId: string) => go(pageId, true), [go])
  const closeDetail = useCallback(() => go(null, false), [go])

  return { pageParam, openPage, stepPage, closeDetail }
}
