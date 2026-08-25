import { memo } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2 } from "lucide-react"
import type { TocEntry, TocSection } from "@/api/client"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { EditableText, RowAction } from "../shared/ui"
import { TocSectionPicker } from "./TocSectionPicker"

export const MIN_TOC_LEVEL = 1
export const MAX_TOC_LEVEL = 6

const INDENT_PX = 26

export interface TocEntryRowProps {
  entry: TocEntry
  sections: TocSection[]
  hex: string
  isSaving: boolean
  onPatch: (id: string, changes: Partial<TocEntry>) => void
  onShiftLevel: (id: string, delta: number) => void
  onInsertAfter: (id: string, level: number) => void
  onRemove: (id: string) => void
  onPreview: (sectionId: string) => void
}

export const TocEntryRow = memo(function TocEntryRow({
  entry,
  sections,
  hex,
  isSaving,
  onPatch,
  onShiftLevel,
  onInsertAfter,
  onRemove,
  onPreview,
}: TocEntryRowProps) {
  const { t } = useLingui()
  const depth = Math.min(Math.max(entry.level, MIN_TOC_LEVEL), MAX_TOC_LEVEL)

  return (
    <div
      className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 transition-colors"
      style={{ marginLeft: `${(depth - 1) * INDENT_PX}px` }}
    >
      <span
        className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]"
        style={{ background: tint(hex, 0.12), color: hex }}
      >
        {t`H${entry.level}`}
      </span>

      <EditableText
        value={entry.title}
        ariaLabel={t`entry title`}
        placeholder={t`Untitled entry`}
        multiline={false}
        isSaving={isSaving}
        onSave={(title) => onPatch(entry.id, { title })}
        className="min-w-0 flex-1 text-[12.5px]"
      />

      <TocSectionPicker
        value={entry.sectionId}
        sections={sections}
        hex={hex}
        onChange={(sectionId, href) => onPatch(entry.id, { sectionId, href })}
      />

      <div className="flex shrink-0 items-center gap-1">
        {entry.sectionId ? (
          <RowAction
            icon={ExternalLink}
            label={t`Open linked page in preview`}
            onClick={() => onPreview(entry.sectionId)}
          />
        ) : null}
        <RowAction
          icon={ChevronLeft}
          label={t`Decrease indent`}
          disabled={entry.level <= MIN_TOC_LEVEL}
          onClick={() => onShiftLevel(entry.id, -1)}
        />
        <RowAction
          icon={ChevronRight}
          label={t`Increase indent`}
          disabled={entry.level >= MAX_TOC_LEVEL}
          onClick={() => onShiftLevel(entry.id, 1)}
        />
        <RowAction
          icon={Plus}
          label={t`Add entry below`}
          onClick={() => onInsertAfter(entry.id, entry.level)}
        />
        <RowAction
          icon={Trash2}
          label={t`Remove entry`}
          tone="danger"
          onClick={() => onRemove(entry.id)}
        />
      </div>
    </div>
  )
})
