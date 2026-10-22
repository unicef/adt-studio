import { useQueries } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { mergePages, VIEWPORTS, type ViewportKey } from "./helpers"
import { OriginalPage, PageColumn, PageFrame, Placeholder, SectionChips } from "./PageColumn"
import { PageControls } from "./PageControls"
import { useScrollSync } from "./useScrollSync"
import type { Workspace } from "../../hooks/useWorkspace"
import type { RunView } from "../../lib/run-view"
import type { BookPage } from "../../lib/types"
import { getPages } from "../../server/functions"
import { ReadingRuns } from "../dashboard/shared"

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest("input, select, textarea, [role=tablist]")))

function missingReason(page: BookPage | undefined, pageNumber: number) {
  if (!page) return `This conversion has no page ${pageNumber}.`
  if (!page.sectionTypes) return "This page has no web rendering in this conversion."
  return "The web rendering of this page has no sections."
}

export function PageComparison({ workspace, runs }: { workspace: Workspace; runs: RunView[] }) {
  const { booksDir, bookUrl, modified } = workspace
  const queries = useQueries({
    queries: runs.map((run) => ({
      queryKey: ["pages", booksDir, run.name, modified(run.name)],
      queryFn: () => getPages({ data: { booksDir, name: run.name } }),
    })),
  })
  const [pageNumber, setPageNumber] = useState<number | null>(null)
  const [viewport, setViewport] = useState<ViewportKey>("desktop")
  const [showOriginal, setShowOriginal] = useState(true)
  const [sync, setSync] = useState(true)
  const register = useScrollSync(sync)

  const pages = mergePages(queries.map((q) => q.data ?? []))
  const found = pages.findIndex((p) => p.pageNumber === pageNumber)
  const index = found === -1 ? 0 : found
  const page = pages[index]
  const goTo = (next: number) => {
    const target = pages[Math.min(Math.max(next, 0), pages.length - 1)]
    if (target) setPageNumber(target.pageNumber)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
      if (!step || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return
      event.preventDefault()
      goTo(index + step)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const failed = queries.find((q) => q.isError)
  if (failed) return <p className="text-sm text-bad">Could not read the pages: {errorMessage(failed.error)}</p>
  if (queries.some((q) => q.isPending)) return <ReadingRuns />
  if (!page) return <p className="text-sm text-muted">None of the selected conversions has extracted pages.</p>

  const viewportWidth = VIEWPORTS.find((v) => v.key === viewport)?.width ?? VIEWPORTS[0].width
  const originalIndex = page.byRun.findIndex((p) => p?.hasImage)
  const original = originalIndex === -1 ? null : page.byRun[originalIndex]
  const baseTypes = page.byRun[0]?.sectionTypes ?? null

  return (
    <div className="flex flex-col gap-4">
      <PageControls
        pages={pages}
        index={index}
        onIndex={goTo}
        viewport={viewport}
        onViewport={setViewport}
        showOriginal={showOriginal}
        onShowOriginal={setShowOriginal}
        canShowOriginal={original !== null}
        sync={sync}
        onSync={setSync}
      />
      <div className="grid auto-cols-[minmax(18rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {showOriginal && original && (
          <PageColumn title="Original PDF page" detail={<p className="text-xs text-muted">From {runs[originalIndex].name}</p>}>
            <OriginalPage src={bookUrl("/page-image", runs[originalIndex].name, { image: `${original.pageId}_page` })} alt={`Page ${page.pageNumber} of the source PDF`} />
          </PageColumn>
        )}
        {runs.map((run, i) => {
          const runPage = page.byRun[i]
          const src = runPage?.sectionTypes?.length ? bookUrl("/page", run.name, { page: runPage.pageId }) : null
          return (
            <PageColumn
              key={run.name}
              title={run.name}
              color={run.color}
              isBase={i === 0}
              href={src}
              detail={runPage?.sectionTypes && <SectionChips types={runPage.sectionTypes} baseline={i === 0 ? null : baseTypes} />}
            >
              {src ? (
                <PageFrame src={src} title={`${run.name}, page ${page.pageNumber}`} viewportWidth={viewportWidth} onWindow={(target) => register(run.name, target)} />
              ) : (
                <Placeholder>{missingReason(runPage, page.pageNumber)}</Placeholder>
              )}
            </PageColumn>
          )
        })}
      </div>
    </div>
  )
}
