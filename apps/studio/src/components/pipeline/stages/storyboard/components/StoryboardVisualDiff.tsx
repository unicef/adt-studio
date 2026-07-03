import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, BASE_URL, type VersionEntry } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { BookPreviewFrame } from "./BookPreviewFrame"
import type { DeviceView } from "./style-editor/device-breakpoint"

type RenderingData = {
  sections?: Array<{
    sectionIndex?: number
    html?: string
  }>
}

type DiffSource =
  | {
      id: "pdf"
      kind: "image"
      label: string
      src: string
      current?: boolean
    }
  | {
      id: "current" | `version:${number}`
      kind: "html"
      label: string
      html: string
      current?: boolean
    }

interface StoryboardVisualDiffProps {
  bookLabel: string
  pageId: string
  sectionIndex: number
  currentHtml: string
  currentVersion: number | null
  hasPageImage: boolean
  bodyFontFamily?: string
  renderWidth: number
  deviceView: DeviceView
}

function getSectionHtml(data: unknown, sectionIndex: number): string | null {
  const rendering = data as RenderingData | null | undefined
  const sections = rendering?.sections
  if (!Array.isArray(sections)) return null

  const byIndex = sections.find((section) => section.sectionIndex === sectionIndex)
  const fallback = sections[sectionIndex]
  const html = byIndex?.html ?? fallback?.html
  return typeof html === "string" && html.trim() ? html : null
}

function pageImageUrl(bookLabel: string, pageId: string): string {
  return `${BASE_URL}/books/${encodeURIComponent(bookLabel)}/images/${encodeURIComponent(`${pageId}_page`)}`
}

export function StoryboardVisualDiff({
  bookLabel,
  pageId,
  sectionIndex,
  currentHtml,
  currentVersion,
  hasPageImage,
  bodyFontFamily,
  renderWidth,
  deviceView,
}: StoryboardVisualDiffProps) {
  const { t } = useLingui()
  const [split, setSplit] = useState(50)
  const [leftId, setLeftId] = useState<string | null>(null)
  const [rightId, setRightId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [leftHeight, setLeftHeight] = useState(0)
  const [rightHeight, setRightHeight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const leftMeasureRef = useRef<HTMLDivElement>(null)
  const rightMeasureRef = useRef<HTMLDivElement>(null)

  const versionsQuery = useQuery({
    queryKey: ["storyboard", "visual-diff", bookLabel, pageId, currentVersion],
    queryFn: () => api.getVersionHistory(bookLabel, "web-rendering", pageId, true),
    enabled: !!bookLabel && !!pageId,
    staleTime: 30_000,
  })

  const sources = useMemo<DiffSource[]>(() => {
    const next: DiffSource[] = []
    if (hasPageImage) {
      next.push({
        id: "pdf",
        kind: "image",
        label: t`PDF page`,
        src: pageImageUrl(bookLabel, pageId),
      })
    }

    if (currentHtml.trim()) {
      const versionLabel =
        currentVersion == null
          ? t`Current`
          : t`Version ${String(currentVersion)}`
      next.push({
        id: "current",
        kind: "html",
        label: versionLabel,
        html: currentHtml,
        current: true,
      })
    }

    const versionSources = (versionsQuery.data?.versions ?? [])
      .slice()
      .sort((a, b) => a.version - b.version)
      .filter((entry) => entry.version !== currentVersion)
      .flatMap((entry: VersionEntry): DiffSource[] => {
        const html = getSectionHtml(entry.data, sectionIndex)
        if (!html) return []
        return [{
          id: `version:${entry.version}`,
          kind: "html",
          label: t`Version ${String(entry.version)}`,
          html,
        }]
      })

    return [...next, ...versionSources]
  }, [
    bookLabel,
    currentHtml,
    currentVersion,
    hasPageImage,
    pageId,
    sectionIndex,
    t,
    versionsQuery.data?.versions,
  ])

  useEffect(() => {
    if (sources.length === 0) {
      setLeftId(null)
      setRightId(null)
      return
    }

    setLeftId((previous) => {
      if (previous && sources.some((source) => source.id === previous)) return previous
      return sources.find((source) => source.id === "pdf")?.id ?? sources[0]?.id ?? null
    })

    setRightId((previous) => {
      if (previous && sources.some((source) => source.id === previous)) return previous
      return sources.find((source) => source.id === "current")?.id ?? sources.at(-1)?.id ?? null
    })
  }, [sources])

  useEffect(() => {
    const leftNode = leftMeasureRef.current
    const rightNode = rightMeasureRef.current
    if (!leftNode || !rightNode) return

    const update = () => {
      setLeftHeight(leftNode.getBoundingClientRect().height)
      setRightHeight(rightNode.getBoundingClientRect().height)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(leftNode)
    observer.observe(rightNode)
    return () => observer.disconnect()
  }, [leftId, rightId, sources])

  const updateSplitFromClientX = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const next = ((clientX - rect.left) / rect.width) * 100
    setSplit(Math.min(95, Math.max(5, next)))
  }, [])

  useEffect(() => {
    if (!dragging) return

    const onMove = (event: PointerEvent) => {
      updateSplitFromClientX(event.clientX)
    }
    const onUp = () => setDragging(false)

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp, { once: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [dragging, updateSplitFromClientX])

  const leftSource = sources.find((source) => source.id === leftId) ?? null
  const rightSource = sources.find((source) => source.id === rightId) ?? null
  const comparisonHeight = Math.max(520, Math.ceil(leftHeight), Math.ceil(rightHeight))

  const renderSourceLabel = (source: DiffSource) => (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{source.label}</span>
      {source.current && (
        <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
          {t`Current`}
        </Badge>
      )}
    </span>
  )

  const renderSource = (source: DiffSource | null) => {
    if (!source) {
      return (
        <div className="flex min-h-130 items-center justify-center rounded border border-dashed bg-muted/30 text-sm text-muted-foreground">
          {t`No source selected`}
        </div>
      )
    }

    if (source.kind === "image") {
      return (
        <div className="flex w-full justify-center bg-background">
          <img
            src={source.src}
            alt={source.label}
            className="block h-auto max-w-full"
            draggable={false}
          />
        </div>
      )
    }

    return (
      <BookPreviewFrame
        html={source.html}
        bookLabel={bookLabel}
        className="w-full bg-background"
        editable={false}
        applyBodyBackground
        renderWidth={renderWidth}
        deviceView={deviceView}
        bodyFontFamily={bodyFontFamily}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky border top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg bg-background/95 p-2 backdrop-blur">
        <div className="flex min-w-45 flex-1 items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t`Left`}</span>
          <Select value={leftId ?? undefined} onValueChange={setLeftId}>
            <SelectTrigger className="h-8 min-w-35 text-xs">
              {leftSource ? renderSourceLabel(leftSource) : <SelectValue />}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {renderSourceLabel(source)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-45 flex-1 items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t`Right`}</span>
          <Select value={rightId ?? undefined} onValueChange={setRightId}>
            <SelectTrigger className="h-8 min-w-35 text-xs">
              {rightSource ? renderSourceLabel(rightSource) : <SelectValue />}
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {renderSourceLabel(source)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-45 items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t`Split`}</span>
          <Slider
            value={[split]}
            min={5}
            max={95}
            step={1}
            onValueChange={(value) => setSplit(value[0] ?? 50)}
            aria-label={t`Compare split`}
            className="w-32"
          />
        </div>

        {versionsQuery.isLoading && (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {t`Loading versions`}
          </Badge>
        )}
      </div>

      {sources.length === 0 ? (
        <div className="flex min-h-130 items-center justify-center rounded-lg bg-muted/30 text-sm text-muted-foreground">
          {t`No comparable sources available`}
        </div>
      ) : (
        <div
          ref={containerRef}
          className={cn(
            "relative overflow-hidden rounded-lg border bg-muted/20",
            dragging && "cursor-col-resize select-none",
          )}
          style={{ height: comparisonHeight }}
        >
          <div ref={rightMeasureRef} className="pointer-events-none absolute inset-x-0 top-0">
            {renderSource(rightSource)}
          </div>
          <div
            ref={leftMeasureRef}
            className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
          >
            {renderSource(leftSource)}
          </div>

          {leftSource && (
            <div className="pointer-events-none absolute left-3 top-3 rounded border bg-background/85 px-2 py-1 text-xs font-medium">
              {renderSourceLabel(leftSource)}
            </div>
          )}
          {rightSource && (
            <div className="pointer-events-none absolute right-3 top-3 rounded border bg-background/85 px-2 py-1 text-xs font-medium">
              {renderSourceLabel(rightSource)}
            </div>
          )}

          <button
            type="button"
            className="absolute top-0 bottom-0 flex w-8 -translate-x-1/2 cursor-col-resize items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ left: `${split}%` }}
            aria-label={t`Drag to compare`}
            title={t`Drag to compare`}
            onPointerDown={(event) => {
              event.preventDefault()
              setDragging(true)
              updateSplitFromClientX(event.clientX)
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setSplit((value) => Math.max(5, value - 2))
              if (event.key === "ArrowRight") setSplit((value) => Math.min(95, value + 2))
            }}
          >
            <span className="h-full w-px bg-border" />
            <span className="absolute flex h-8 w-8 items-center justify-center rounded-full border bg-background">
              <span className="h-4 w-px bg-muted-foreground" />
              <span className="ml-1 h-4 w-px bg-muted-foreground" />
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
