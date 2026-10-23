import { memo } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2 } from "lucide-react"
import type { TocEntry, TocSection } from "@/api/client"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { ExpandableRow } from "../shared/list/ExpandableRow"
import { EditableText, RowAction } from "../shared/ui"
import { TocSectionPicker } from "./TocSectionPicker"
import { MAX_TOC_LEVEL, MIN_TOC_LEVEL } from "./tocRows"

export interface TocRowContext {
  hex: string
  locked: boolean
  sections: TocSection[]
  sectionsFailed: boolean
  onRetrySections: () => void
  isEdited: (entry: TocEntry) => boolean
  freshId: string | null
  flashId: string | null
  onPatch: (id: string, patch: Partial<TocEntry>) => void
  onShift: (id: string, delta: number) => void
  onAddAfter: (id: string, level: number) => void
  onRemove: (id: string) => void
  onPreview: (sectionId: string) => void
}

export const TocEntryRow = memo(function TocEntryRow({ entry, ctx }: { entry: TocEntry; ctx: TocRowContext }) {
  const { t } = useLingui()
  const { hex, locked } = ctx
  return (
    <ExpandableRow
      id={entry.id}
      accent={hex}
      expanded={false}
      flash={ctx.flashId === entry.id}
      edited={ctx.isEdited(entry)}
      summary={
        <span className="flex min-w-0 items-center gap-2" style={{ paddingInlineStart: (Math.max(entry.level, MIN_TOC_LEVEL) - 1) * 20 }}>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold"
            style={{ background: tint(hex, 0.12), color: hex }}
            aria-label={t`Level ${entry.level}`}
          >
            {t`L${entry.level}`}
          </span>
          <EditableText
            value={entry.title}
            ariaLabel={t`entry title`}
            placeholder={t`Untitled entry`}
            multiline={false}
            disabled={locked}
            startEditing={ctx.freshId === entry.id}
            edited={ctx.isEdited(entry)}
            accent={hex}
            onCommit={(title) => ctx.onPatch(entry.id, { title })}
            className="min-w-0 flex-1 text-[13px]"
          />
        </span>
      }
      actions={
        <>
          <TocSectionPicker
            value={entry.sectionId}
            sections={ctx.sections}
            hex={hex}
            disabled={locked}
            loadFailed={ctx.sectionsFailed}
            onRetry={ctx.onRetrySections}
            onChange={(sectionId, href) => ctx.onPatch(entry.id, { sectionId, href })}
          />
          <span className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-focus-within/row:opacity-100 group-hover/row:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
            <RowAction icon={ChevronLeft} label={t`Outdent`} disabled={locked || entry.level <= MIN_TOC_LEVEL} onClick={() => ctx.onShift(entry.id, -1)} />
            <RowAction icon={ChevronRight} label={t`Indent`} disabled={locked || entry.level >= MAX_TOC_LEVEL} onClick={() => ctx.onShift(entry.id, 1)} />
            <RowAction icon={Plus} label={t`Add entry below`} disabled={locked} onClick={() => ctx.onAddAfter(entry.id, entry.level)} />
            {entry.sectionId ? (
              <RowAction icon={ExternalLink} label={t`Open linked page in preview`} onClick={() => ctx.onPreview(entry.sectionId)} />
            ) : null}
            <RowAction icon={Trash2} label={t`Remove entry`} tone="danger" disabled={locked} onClick={() => ctx.onRemove(entry.id)} />
          </span>
        </>
      }
    />
  )
})
