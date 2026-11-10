import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual"
import { TranslateRow, type TranslateRowProps } from "./TranslateRow"
import type { ReviewItem } from "./review/reviewState"
import type { TranslateRow as TranslateRowData } from "./translateState"
import type { RowSave } from "./useTranslationSave"

const ROW_ESTIMATE = 104

type SharedRowProps = Omit<TranslateRowProps, "row" | "place" | "translatedImageId" | "save" | "review" | "applied" | "accepting">

export interface ScrollRequest {
  id: string
  nonce: number
}

export interface TranslateRowListProps extends SharedRowProps {
  /**
   * The scroll viewport, owned by the step's body. Passed as an element rather
   * than a ref: it is an *ancestor* of this list, and React attaches refs
   * bottom-up, so a ref would still read null when the virtualizer first looks
   * for it and nothing would render.
   */
  scrollElement: HTMLDivElement | null
  rows: TranslateRowData[]
  placeOf: (id: string) => string
  translatedImageOf: (id: string) => string | undefined
  saves: ReadonlyMap<string, RowSave>
  reviewOf: (id: string) => ReviewItem | undefined
  appliedIds: ReadonlyMap<string, unknown>
  accepting: string | null
  scrollTo?: ScrollRequest | null
}

function useListOffset(scrollElement: HTMLDivElement | null, list: HTMLDivElement | null): number {
  const [offset, setOffset] = useState(0)
  useLayoutEffect(() => {
    if (!scrollElement || !list) return
    const measure = () => {
      const next = list.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop
      setOffset((current) => (Math.abs(current - next) < 0.5 ? current : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    const content = scrollElement.firstElementChild
    if (content) observer.observe(content)
    observer.observe(scrollElement)
    return () => observer.disconnect()
  }, [scrollElement, list])
  return offset
}

/**
 * The virtualized string list, split out of the step for the same reason as the
 * speech clip list: `useVirtualizer` re-renders its host on every scroll frame,
 * and the step's hook stack (catalog, config, book, mutations) has no business
 * re-running while someone drags a scrollbar. Notices and filters scroll with
 * the list above it, so it offsets itself by their height.
 */
export function TranslateRowList({
  scrollElement,
  rows,
  placeOf,
  translatedImageOf,
  saves,
  reviewOf,
  appliedIds,
  accepting,
  scrollTo,
  ...shared
}: TranslateRowListProps) {
  const [list, setList] = useState<HTMLDivElement | null>(null)
  const offset = useListOffset(scrollElement, list)
  const focused = useRef<number | null>(null)
  const rangeExtractor = useCallback((range: Range) => {
    const indexes = defaultRangeExtractor(range)
    const keep = focused.current
    if (keep === null || keep >= range.count || indexes.includes(keep)) return indexes
    return [...indexes, keep].sort((left, right) => left - right)
  }, [])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 6,
    scrollMargin: offset,
    rangeExtractor,
    getItemKey: (index) => rows[index]?.id ?? index,
  })

  const handled = useRef(0)
  useEffect(() => {
    if (!scrollTo || scrollTo.nonce === handled.current) return
    const index = rows.findIndex((row) => row.id === scrollTo.id)
    if (index < 0) return
    handled.current = scrollTo.nonce
    virtualizer.scrollToIndex(index, { align: "center" })
  }, [scrollTo, rows, virtualizer])

  return (
    <div
      ref={setList}
      onFocus={(event) => {
        const index = event.target.closest<HTMLElement>("[data-index]")?.dataset.index
        focused.current = index === undefined ? null : Number(index)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focused.current = null
      }}
      style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index]
        return (
          <div
            key={row.id}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="pb-2"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            <TranslateRow
              {...shared}
              row={row}
              place={placeOf(row.id)}
              translatedImageId={row.isImage ? translatedImageOf(row.id) : undefined}
              save={saves.get(row.id)}
              review={reviewOf(row.id)}
              applied={appliedIds.has(row.id)}
              accepting={accepting === row.id}
            />
          </div>
        )
      })}
    </div>
  )
}
