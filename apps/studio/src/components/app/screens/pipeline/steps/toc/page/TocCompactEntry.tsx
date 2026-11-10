import { memo } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronLeft, ChevronRight, ExternalLink, Trash2 } from "lucide-react"
import type { TocEntry } from "@/api/client"
import { cn } from "@/lib/utils"
import { EditableText, RowAction } from "../../shared/ui"
import { TocLevelChip } from "../TocLevelChip"
import type { TocRowContext } from "../TocEntryRow"
import { TocSectionPicker } from "../TocSectionPicker"
import { MAX_TOC_LEVEL, MIN_TOC_LEVEL } from "../tocRows"

const INDENT_STEP = 12
const MAX_INDENT_LEVELS = 3

export const compactIndent = (level: number) => (Math.min(Math.max(level, MIN_TOC_LEVEL), MAX_INDENT_LEVELS) - 1) * INDENT_STEP

export const TocCompactEntry = memo(function TocCompactEntry({ entry, ctx }: { entry: TocEntry; ctx: TocRowContext }) {
  const { t } = useLingui()
  const { hex, locked } = ctx
  const edited = ctx.isEdited(entry)
  const indent = compactIndent(entry.level)

  return (
    <article
      data-toc-entry={entry.id}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-2.5 transition-[margin,border-color] duration-200 ease-out motion-reduce:transition-none",
        edited && "border-[color-mix(in_srgb,var(--chrome-hex)_35%,transparent)]",
      )}
      style={{ marginInlineStart: indent }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <TocLevelChip level={entry.level} hex={hex} />
        <EditableText
          value={entry.title}
          ariaLabel={t`entry title`}
          placeholder={t`Untitled entry`}
          multiline={false}
          disabled={locked}
          edited={edited}
          accent={hex}
          onCommit={(title) => ctx.onPatch(entry.id, { title })}
          className="min-w-0 flex-1 text-[13px] font-medium"
        />
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <TocSectionPicker
          value={entry.sectionId}
          sections={ctx.sections}
          hex={hex}
          disabled={locked}
          loadFailed={ctx.sectionsFailed}
          onRetry={ctx.onRetrySections}
          onChange={(sectionId, href) => ctx.onPatch(entry.id, { sectionId, href })}
          className="mr-auto min-w-0 max-w-full shrink"
        />
        <RowAction icon={ChevronLeft} label={t`Outdent`} disabled={locked || entry.level <= MIN_TOC_LEVEL} onClick={() => ctx.onShift(entry.id, -1)} />
        <RowAction icon={ChevronRight} label={t`Indent`} disabled={locked || entry.level >= MAX_TOC_LEVEL} onClick={() => ctx.onShift(entry.id, 1)} />
        {entry.sectionId ? <RowAction icon={ExternalLink} label={t`Open linked page in preview`} onClick={() => ctx.onPreview(entry.sectionId)} /> : null}
        <RowAction icon={Trash2} label={t`Remove entry`} tone="danger" disabled={locked} onClick={() => ctx.onRemove(entry.id)} />
      </div>
    </article>
  )
})
