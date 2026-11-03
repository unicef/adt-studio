import { useMemo } from "react"
import { useRouterState, type AnyRouter } from "@tanstack/react-router"

export interface PreviewTarget {
  sectionId: string | null
  href: string | null
}

export const PREVIEW_PARAM = "preview"

let pushedEntry = false

export function encodePreviewTarget(target: PreviewTarget): string {
  if (target.href) return `href:${target.href}`
  if (target.sectionId) return `section:${target.sectionId}`
  return "start"
}

export function decodePreviewTarget(value: unknown): PreviewTarget | null {
  if (typeof value !== "string" || !value) return null
  if (value.startsWith("href:")) return { sectionId: null, href: value.slice(5) }
  if (value.startsWith("section:")) return { sectionId: value.slice(8), href: null }
  return { sectionId: null, href: null }
}

function setPreviewParam(router: AnyRouter, value: string | null, replace: boolean) {
  return router.navigate({
    to: router.state.location.pathname,
    search: (previous: Record<string, unknown>) => {
      const next = { ...previous }
      if (value === null) delete next[PREVIEW_PARAM]
      else next[PREVIEW_PARAM] = value
      return next
    },
    replace,
  } as never)
}

export function openPreviewSurface(router: AnyRouter, target: PreviewTarget) {
  pushedEntry = true
  void setPreviewParam(router, encodePreviewTarget(target), false)
}

export function closePreviewSurface(router: AnyRouter) {
  if (pushedEntry) {
    pushedEntry = false
    router.history.back()
    return
  }
  void setPreviewParam(router, null, true)
}

export function followPreviewPage(router: AnyRouter, sectionId: string) {
  const current = (router.state.location.search as Record<string, unknown>)[PREVIEW_PARAM]
  const next = encodePreviewTarget({ sectionId, href: null })
  if (!current || current === next) return
  void setPreviewParam(router, next, true)
}

export function leavePreviewForPage(router: AnyRouter, label: string, pageId: string) {
  pushedEntry = false
  void router.navigate({ to: "/pipeline/$label/pages/$pageId", params: { label, pageId }, replace: true })
}

export function useOpenPreviewTarget(): PreviewTarget | null {
  const raw = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>)[PREVIEW_PARAM],
  })
  return useMemo(() => decodePreviewTarget(raw), [raw])
}
