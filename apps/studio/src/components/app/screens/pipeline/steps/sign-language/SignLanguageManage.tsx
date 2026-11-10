import { useMemo, useState } from "react"
import type { SignLanguageVideo } from "@/api/client"
import { ManageSectionsDialog } from "@/components/pipeline/stages/sign-language/components/ManageSectionsDialog"
import type { FilterValue } from "@/components/pipeline/stages/sign-language/components/types"
import type { SignLanguageModel } from "./useSignLanguageModel"

export function SignLanguageManage({
  label,
  hex,
  model,
  open,
  onOpenChange,
  uploading,
  deletingId,
  onUpload,
  onAssign,
  onDelete,
  onPlay,
}: {
  label: string
  hex: string
  model: SignLanguageModel
  open: boolean
  onOpenChange: (open: boolean) => void
  uploading: boolean
  deletingId: string | null
  onUpload: (sectionId: string) => void
  onAssign: (videoId: string, sectionId: string | null) => void
  onDelete: (videoId: string) => void
  onPlay: (video: SignLanguageVideo) => void
}) {
  const [filter, setFilter] = useState<FilterValue>("missing")
  const { sections, videoBySection, covered, total } = model
  const entries = useMemo(() => {
    if (filter === "missing") return sections.filter((section) => !videoBySection.has(section.sectionId))
    if (filter === "covered") return sections.filter((section) => videoBySection.has(section.sectionId))
    return sections
  }, [filter, sections, videoBySection])

  return (
    <ManageSectionsDialog
      open={open}
      onOpenChange={onOpenChange}
      bookLabel={label}
      filter={filter}
      onFilterChange={setFilter}
      filteredEntries={entries}
      videoBySection={videoBySection}
      missingCount={total - covered}
      coveredSections={covered}
      totalSections={total}
      uploadPending={uploading}
      pendingDeleteId={deletingId}
      onUploadForSection={onUpload}
      onAssign={onAssign}
      onDelete={onDelete}
      onPlay={onPlay}
      accent={hex}
    />
  )
}
