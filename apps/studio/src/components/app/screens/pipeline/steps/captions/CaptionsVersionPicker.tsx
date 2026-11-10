import { useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { VersionDiffDescriptor } from "@/components/pipeline/components/VersionCompareDialog"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { StepVersionPicker } from "../shared/StepVersionPicker"
import { CaptionDiffItem } from "./CaptionDiffItem"

export function CaptionsVersionPicker({
  label,
  pageId,
  currentVersion,
  saving,
  dirty,
  onRestored,
  triggerClassName,
  triggerLabel,
}: {
  label: string
  pageId: string
  currentVersion: number | null
  saving: boolean
  dirty: boolean
  onRestored: () => void
  triggerClassName?: string
  triggerLabel?: string
}) {
  const { t } = useLingui()
  const diff = useMemo<VersionDiffDescriptor>(
    () => ({
      items: (data) => (data as { captions?: CaptionEntry[] } | null)?.captions ?? [],
      keyOf: (item) => (item as CaptionEntry).imageId,
      diffText: (item) => (item as CaptionEntry).caption ?? "",
      searchText: (item) => `${(item as CaptionEntry).imageId} ${(item as CaptionEntry).caption ?? ""}`,
      searchPlaceholder: t`Search descriptions or image IDs…`,
      hideUnchanged: true,
      renderItem: (item, ctx) => <CaptionDiffItem label={label} cap={item as CaptionEntry} diff={ctx?.diff} />,
    }),
    [label, t],
  )
  return (
    <StepVersionPicker
      label={label}
      step="image-captioning"
      itemId={pageId}
      currentVersion={currentVersion}
      isSaving={saving}
      dirty={dirty}
      onRestored={onRestored}
      diff={diff}
      triggerClassName={triggerClassName}
      triggerLabel={triggerLabel}
    />
  )
}
