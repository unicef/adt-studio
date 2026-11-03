import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useAdtPages } from "@/hooks/use-adt-pages"
import { usePipelineState, type PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { usePreviewSource, type PreviewSource } from "../usePreviewSource"
import { leavePreviewForPage, type PreviewTarget } from "./previewSurface"

export interface PreviewSession {
  source: PreviewSource
  frameSrc: string | null
  viewport: Viewport
  setViewport: (viewport: Viewport) => void
  page: PipelinePage | null
  liveSectionId: string | null
  onLocation: (href: string) => void
  openInBrowser: () => void
  editPage: (() => void) | null
}

let lastViewport: Viewport = "desktop"

function fileOf(href: string): string {
  return href.split("?")[0].split("#")[0].split("/").pop() ?? ""
}

export function usePreviewSession(label: string, target: PreviewTarget): PreviewSession {
  const router = useRouter()
  const source = usePreviewSource(label, target.sectionId, target.href)
  const { pages } = usePipelineState(label)
  const manifest = useAdtPages(label, { enabled: source.pkg.status === "ready" })
  const [viewport, setViewportState] = useState<Viewport>(lastViewport)
  const [startUrl, setStartUrl] = useState<string | null>(null)
  const [liveSection, setLiveSection] = useState<string | null>(null)
  const liveUrl = useRef<string | null>(null)
  const shown = useRef(false)

  useEffect(() => {
    if (!source.src) return
    const file = liveUrl.current ? fileOf(liveUrl.current) : ""
    if (shown.current && file) {
      setStartUrl(source.src.replace(/[^/]*$/, file))
      return
    }
    shown.current = true
    setStartUrl(null)
    setLiveSection(null)
    liveUrl.current = null
  }, [source.src])

  const onLocation = useCallback(
    (href: string) => {
      liveUrl.current = href
      const file = fileOf(href)
      const entry = manifest.data?.find((candidate) => candidate.href === file)
      if (entry) setLiveSection(entry.section_id)
    },
    [manifest.data],
  )

  const sectionId =
    liveSection ??
    target.sectionId ??
    (target.href ? manifest.data?.find((entry) => entry.href === target.href)?.section_id ?? null : null)

  const page = useMemo(
    () => (sectionId ? pages.find((candidate) => candidate.sections.some((section) => section.sectionId === sectionId)) ?? null : null),
    [pages, sectionId],
  )

  const setViewport = (next: Viewport) => {
    setStartUrl(liveUrl.current)
    lastViewport = next
    setViewportState(next)
  }

  const openInBrowser = () => {
    const url = liveUrl.current ?? source.src
    if (!url) return
    window.open(url, "_blank", "noopener")
  }

  const editPage = page ? () => leavePreviewForPage(router, label, page.pageId) : null

  return {
    source,
    frameSrc: source.src ? startUrl ?? source.src : null,
    viewport,
    setViewport,
    page,
    liveSectionId: liveSection,
    onLocation,
    openInBrowser,
    editPage,
  }
}
