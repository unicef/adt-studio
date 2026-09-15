import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import type { StoryboardEditorSession } from "./useStoryboardEditor"

export function useEditorSaveBar(page: PipelinePage | null, session: StoryboardEditorSession) {
  const { t } = useLingui()
  const pageNumber = page?.pageNumber ?? 0

  useFloatingSave({
    id: "storyboard-editor",
    dirty: session.dirty && !!page,
    saving: session.saving,
    stage: "storyboard",
    label: t`Page ${pageNumber} HTML`,
    labelKey: page?.pageId ?? "",
    onSave: () => {
      session.save().catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : t`Save failed`)
      })
    },
    onSaveStay: session.save,
    onDiscard: session.discard,
  })
}
