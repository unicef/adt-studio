import { Image as ImageIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { VersionPicker } from "@/components/pipeline/components/VersionPicker"
import { PendingChip } from "@/components/pipeline/components/floating-save"
import type { CaptionEntry } from "@/components/pipeline/stages/captions/lib/types"
import { CaptionDiffItem } from "./CaptionDiffItem"
import type { CaptionEdits } from "./useCaptionEdits"

export function CaptionsVersionPicker({
  label,
  pageId,
  pageNumber,
  currentVersion,
  edits,
}: {
  label: string
  pageId: string
  pageNumber: number
  currentVersion: number | null
  edits: CaptionEdits
}) {
  const { t } = useLingui()
  return (
    <VersionPicker
      step="image-captioning"
      currentVersion={currentVersion}
      saving={edits.saving}
      dirty={edits.dirty}
      bookLabel={label}
      itemId={pageId}
      pendingLabel={
        <PendingChip icon={ImageIcon}>{t`Page ${String(pageNumber)} captions`}</PendingChip>
      }
      pendingLabelKey={`captions:${pageNumber}`}
      onRestored={edits.discard}
      onSave={edits.saveCaptions}
      onDiscard={edits.discard}
      diff={{
        items: (data) => (data as { captions?: CaptionEntry[] } | null)?.captions ?? [],
        keyOf: (item) => (item as CaptionEntry).imageId,
        diffText: (item) => (item as CaptionEntry).caption ?? "",
        hideUnchanged: true,
        renderItem: (item, ctx) => (
          <CaptionDiffItem label={label} cap={item as CaptionEntry} diff={ctx?.diff} />
        ),
      }}
    />
  )
}
