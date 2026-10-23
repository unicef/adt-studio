import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { useListView } from "../shared/list/useListView"
import { PageDetailFrame } from "../shared/page-detail/PageDetailFrame"
import { GlossaryTermRow, type GlossaryRowContext } from "./GlossaryTermRow"
import type { GlossaryRow } from "./glossaryRows"

export function GlossaryPageDetail({
  label,
  pageId,
  pageNumber,
  rows,
  ctx,
  prevPageId,
  nextPageId,
  onStep,
  onClose,
}: {
  label: string
  pageId: string
  pageNumber: number
  rows: GlossaryRow[]
  ctx: GlossaryRowContext
  prevPageId: string | null
  nextPageId: string | null
  onStep: (pageId: string) => void
  onClose: () => void
}) {
  const { t } = useLingui()
  const view = useListView("glossary")
  const count = rows.length
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(count <= 3 ? rows.map((row) => row._key) : []))
  const onToggle = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <PageDetailFrame
      label={label}
      pageId={pageId}
      pageNumber={pageNumber}
      prevPageId={prevPageId}
      nextPageId={nextPageId}
      onStep={onStep}
      onClose={onClose}
      state={count === 0 ? "empty" : "ready"}
      emptyMessage={t`No glossary terms appear on this page.`}
      meta={t`${plural(count, { one: "# term on this page", other: "# terms on this page" })}`}
    >
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <GlossaryTermRow
            key={row._key}
            row={row}
            ctx={ctx}
            expanded={view === "cards" || expanded.has(row._key)}
            onToggle={view === "cards" ? undefined : () => onToggle(row._key)}
            flash={false}
          />
        ))}
      </div>
    </PageDetailFrame>
  )
}
