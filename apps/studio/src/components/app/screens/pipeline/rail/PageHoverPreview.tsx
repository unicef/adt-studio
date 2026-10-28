import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { getSectionScreenshotUrl } from "@/api/client"
import { usePageImage } from "@/hooks/use-pages"
import { useHoverPreview } from "@/components/pipeline/components/hover-preview/useHoverPreview"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { compareSize, PageComparePopover } from "./PageComparePopover"

const EXIT_MS = 140
const FALLBACK_RATIO = 3 / 4

export function PageHoverPreview({ label, page, outdated }: { label: string; page: PipelinePage; outdated: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const rowRef = useRef<HTMLElement | null>(null)
  const ratio = page.pageWidth && page.pageHeight ? page.pageWidth / page.pageHeight : FALLBACK_RATIO
  const viewport = typeof window === "undefined" ? { width: 1440, height: 900 } : { width: window.innerWidth, height: window.innerHeight }
  const size = compareSize(ratio, viewport, rowRef.current?.getBoundingClientRect().right ?? 260)
  const { show, pos, handleEnter, handleLeave } = useHoverPreview(rowRef, { width: size.width, height: size.height })
  const [mounted, setMounted] = useState(false)
  const [wasShown, setWasShown] = useState(false)
  if (show !== wasShown) {
    setWasShown(show)
    if (show) setMounted(true)
  }

  useEffect(() => {
    if (show || !mounted) return
    const timer = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(timer)
  }, [show, mounted])

  const pdf = usePageImage(label, page.pageId, { enabled: mounted })
  const pdfSrc = pdf.data?.imageBase64 ? `data:image/png;base64,${pdf.data.imageBase64}` : null
  const sectionIndex = page.sections[0]?.sectionIndex
  const renderedSrc =
    page.hasRendering && !page.isDiscarded && sectionIndex != null
      ? getSectionScreenshotUrl(label, page.pageId, sectionIndex, { viewport: "desktop", cacheKey: page.renderingVersion })
      : null

  useEffect(() => {
    const row = anchor.current?.parentElement
    if (!row) return
    rowRef.current = row
    let pointer = false
    const onPointerDown = () => {
      pointer = true
      handleLeave()
      setTimeout(() => {
        pointer = false
      }, 0)
    }
    const onFocus = () => {
      if (!pointer) handleEnter()
    }
    row.addEventListener("mouseenter", handleEnter)
    row.addEventListener("mouseleave", handleLeave)
    row.addEventListener("focusin", onFocus)
    row.addEventListener("focusout", handleLeave)
    row.addEventListener("pointerdown", onPointerDown)
    return () => {
      row.removeEventListener("mouseenter", handleEnter)
      row.removeEventListener("mouseleave", handleLeave)
      row.removeEventListener("focusin", onFocus)
      row.removeEventListener("focusout", handleLeave)
      row.removeEventListener("pointerdown", onPointerDown)
    }
  }, [handleEnter, handleLeave])

  return (
    <>
      <span ref={anchor} hidden />
      {mounted &&
        createPortal(
          <PageComparePopover
            pos={pos}
            size={size}
            leaving={!show}
            pageNumber={page.pageNumber}
            pdfSrc={pdfSrc}
            renderedSrc={renderedSrc}
            pruned={page.isDiscarded}
            stale={outdated}
            activity={page.sections.some((section) => section.isActivity && !section.isPruned)}
          />,
          document.body,
        )}
    </>
  )
}
