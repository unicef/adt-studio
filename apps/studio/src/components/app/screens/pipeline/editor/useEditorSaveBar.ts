import { useLingui } from "@lingui/react/macro"
import { toast } from "sonner"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { useIsDirty } from "./draftStore"
import type { StoryboardEditorSession } from "./useStoryboardEditor"

export function useEditorSaveBar(pageNumber: number, session: StoryboardEditorSession) {
  const { t } = useLingui()
  const dirty = useIsDirty(session.pageId)

  useFloatingSave({
    id: "storyboard-editor",
    dirty,
    saving: session.saving,
    stage: "storyboard",
    label: t`Page ${pageNumber} HTML`,
    labelKey: session.pageId ?? "",
    onSave: () => {
      session.save().catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : t`Save failed`)
      })
    },
    onSaveStay: session.save,
    onDiscard: session.discard,
  })
}
