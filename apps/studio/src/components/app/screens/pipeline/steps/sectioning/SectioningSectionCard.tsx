import { memo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PageSectioningSection } from "@adt/types"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { SectionTreeEditor } from "@/components/section-tree-editor/SectionTreeEditor"
import { SectionActionsDropdown } from "@/components/pipeline/stages/storyboard/components/SectionActionsDropdown"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getSectionTypeLabel, getSectionTypeDescription } from "@/lib/section-constants"
import { StepCard } from "../shared/ui"

export const SectioningSectionCard = memo(function SectioningSectionCard({
  label,
  section,
  index,
  count,
  accent,
  hasPrevPage,
  hasNextPage,
  edited,
  busy,
  structuralDisabled,
  dirty,
  sectionTypes,
  textRoles,
  containerStructures,
  onChange,
  onMerge,
  onMergeCrossPage,
  onRequestMerge,
  onRequestSplit,
  onRequestClone,
  onRequestDelete,
}: {
  label: string
  section: PageSectioningSection
  index: number
  count: number
  accent: string
  hasPrevPage: boolean
  hasNextPage: boolean
  edited: boolean
  busy: boolean
  structuralDisabled: boolean
  dirty: boolean
  sectionTypes?: Record<string, string>
  textRoles?: Record<string, string>
  containerStructures?: Record<string, string>
  onChange: (next: PageSectioningSection) => void
  onMerge: (sectionIndex: number, direction: "prev" | "next") => void
  onMergeCrossPage: (sectionIndex: number, direction: "prev" | "next") => void
  onRequestMerge: (label: string, action: () => void) => void
  onRequestSplit: (
    sectionIndex: number,
    at: { beforeNodeIndex: number } | { beforeNodeId: string },
  ) => void
  onRequestClone: (sectionIndex: number) => void
  onRequestDelete: (sectionIndex: number) => void
}) {
  const { t } = useLingui()

  const structuralDisabledReason = dirty
    ? t`Save or discard your edits first`
    : t`Please wait for the current operation to finish`

  const sectionMergeItems = [
    ...(index > 0
      ? [
          {
            label: t`Merge with previous`,
            onClick: () =>
              onRequestMerge(t`merge with previous section`, () => onMerge(index, "prev")),
          },
        ]
      : hasPrevPage
        ? [
            {
              label: t`Merge with last section of previous page`,
              onClick: () =>
                onRequestMerge(t`merge this section into the last section of the previous page`, () =>
                  onMergeCrossPage(index, "prev"),
                ),
            },
          ]
        : []),
    ...(index < count - 1
      ? [
          {
            label: t`Merge with next`,
            onClick: () => onRequestMerge(t`merge with next section`, () => onMerge(index, "next")),
          },
        ]
      : hasNextPage
        ? [
            {
              label: t`Merge with first section of next page`,
              onClick: () =>
                onRequestMerge(t`merge this section into the first section of the next page`, () =>
                  onMergeCrossPage(index, "next"),
                ),
            },
          ]
        : []),
  ]

  return (
    <StepCard accent={accent} muted={section.isPruned}>
      <div className="flex items-center gap-2">
        <span
          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]"
          style={{ background: tint(accent, 0.12), color: accent }}
        >
          {index + 1}
        </span>
        <span
          className="min-w-0 truncate font-mono text-[10.5px] text-muted-foreground"
          title={section.sectionId}
        >
          {section.sectionId}
        </span>
        {sectionTypes ? (
          <Select
            value={section.sectionType}
            onValueChange={(value) => onChange({ ...section, sectionType: value })}
            disabled={busy}
          >
            <SelectTrigger className="h-6 w-auto min-w-[80px] border-0 bg-muted/50 px-1.5 py-0 text-[10px] font-medium">
              <SelectValue>
                {getSectionTypeLabel(section.sectionType) ||
                  section.sectionType.replace(/_/g, " ")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(sectionTypes).map(([key, desc]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {getSectionTypeLabel(key) || key.replace(/_/g, " ")}
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {getSectionTypeDescription(key) ?? desc}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
            {section.sectionType}
          </span>
        )}
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full border"
          style={{ background: section.backgroundColor }}
          title={section.backgroundColor}
        />
        {section.isPruned && (
          <span className="text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
            <Trans>pruned</Trans>
          </span>
        )}
        {edited && (
          <span className="text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
            <Trans>edited</Trans>
          </span>
        )}
        <span className="ml-auto shrink-0">
          <SectionActionsDropdown
            sectionIndex={index}
            sectionCount={count}
            isPruned={section.isPruned}
            hasPrevPage={hasPrevPage}
            hasNextPage={hasNextPage}
            onTogglePrune={() => onChange({ ...section, isPruned: !section.isPruned })}
            onMerge={(direction) => onMerge(index, direction)}
            onMergeCrossPage={(direction) => onMergeCrossPage(index, direction)}
            onClone={() => onRequestClone(index)}
            onDelete={() => onRequestDelete(index)}
            onConfirmMerge={onRequestMerge}
            disabled={structuralDisabled}
            disabledReason={structuralDisabledReason}
            pruneDisabled={busy}
          />
        </span>
      </div>

      <div className="rounded-lg border bg-muted/20 p-3">
        <SectionTreeEditor
          section={section}
          onChange={onChange}
          bookLabel={label}
          textRoles={textRoles}
          containerStructures={containerStructures}
          disabled={busy}
          splitDisabledReason={dirty ? t`Save or discard your edits first` : busy ? t`Please wait for the current operation to finish` : undefined}
          onSplitBefore={(beforeNodeIndex) => onRequestSplit(index, { beforeNodeIndex })}
          onSplitSection={(beforeNodeId) => onRequestSplit(index, { beforeNodeId })}
          sectionMergeItems={sectionMergeItems}
        />
      </div>
    </StepCard>
  )
})
