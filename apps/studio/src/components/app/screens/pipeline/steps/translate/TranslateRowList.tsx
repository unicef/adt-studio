import { useVirtualizer } from "@tanstack/react-virtual"
import { TranslateRow } from "./TranslateRow"
import type { TranslateRow as TranslateRowData } from "./translateState"

const ROW_ESTIMATE = 96

export interface TranslateRowListProps {
  /**
   * The scroll viewport, owned by the step's body. Passed as an element rather
   * than a ref: it is an *ancestor* of this list, and React attaches refs
   * bottom-up, so a ref would still read null when the virtualizer first looks
   * for it and nothing would render.
   */
  scrollElement: HTMLDivElement | null
  rows: TranslateRowData[]
  label: string
  hex: string
  language: string
  isBase: boolean
  isSaving: boolean
  onSave: (id: string, text: string) => void
  onOpenImage: (src: string) => void
}

/**
 * The virtualized string list, split out of the step for the same reason as the
 * speech clip list: `useVirtualizer` re-renders its host on every scroll frame,
 * and the step's hook stack (catalog, config, book, mutations) has no business
 * re-running while someone drags a scrollbar.
 */
export function TranslateRowList({
  scrollElement,
  rows,
  label,
  hex,
  language,
  isBase,
  isSaving,
  onSave,
  onOpenImage,
}: TranslateRowListProps) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 6,
    getItemKey: (index) => rows[index]?.id ?? index,
  })

  return (
    <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
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
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <TranslateRow
              row={row}
              label={label}
              hex={hex}
              language={language}
              isBase={isBase}
              isSaving={isSaving}
              onSave={onSave}
              onOpenImage={onOpenImage}
            />
          </div>
        )
      })}
    </div>
  )
}

