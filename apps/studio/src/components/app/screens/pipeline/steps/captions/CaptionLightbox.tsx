import { useMemo } from "react"
import type { PageDetail } from "@/api/client"
import { Lightbox } from "@/components/pipeline/stages/captions/components/Lightbox"
import type { CaptionEntry, LightboxEntry } from "@/components/pipeline/stages/captions/lib/types"
import type { CaptionEdits } from "./useCaptionEdits"

export function CaptionLightbox({
  label,
  page,
  items,
  index,
  edits,
  locked,
  hex,
  onClose,
  onNavigate,
}: {
  label: string
  page: PageDetail
  items: readonly CaptionEntry[]
  index: number
  edits: CaptionEdits
  locked: boolean
  hex: string
  onClose: () => void
  onNavigate: (next: number) => void
}) {
  const entries: LightboxEntry[] = useMemo(
    () => items.map((cap) => ({ cap, pageId: page.pageId, pageNumber: page.pageNumber })),
    [items, page.pageId, page.pageNumber],
  )
  if (entries.length === 0) return null
  return (
    <Lightbox
      bookLabel={label}
      entries={entries}
      index={Math.min(index, entries.length - 1)}
      dirty={edits.dirty}
      saving={edits.saving}
      readOnly={locked}
      accent={hex}
      onClose={onClose}
      onNavigate={onNavigate}
      onCaptionChange={(entry, caption) => edits.setCaption(entry.cap.imageId, caption)}
      onToggleDecorative={(entry) => edits.setDecorative(entry.cap.imageId, entry.cap.decorative !== true)}
      onSave={() => void edits.save().catch(() => undefined)}
      onDiscard={edits.discard}
    />
  )
}
