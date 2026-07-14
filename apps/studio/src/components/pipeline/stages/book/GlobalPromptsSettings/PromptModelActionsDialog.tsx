import { useEffect, useMemo, useState } from "react"
import { Copy, Plus } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/sonner"
import { ModelSelect, LLM_MODEL_GROUPS, type ModelGroup } from "@/components/pipeline/components/ModelSelect"
import { promptModelForSelectedModel } from "@/components/pipeline/components/PromptViewer/promptModel"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  isDefaultPromptModelId,
  modelIdsFromGroups,
  normalizePromptModelInput,
  promptExistsForModel,
  removeDefaultPromptModelGroups,
} from "./promptSettings"

type PromptSummary = {
  name: string
  variants: string[]
}

type PromptModelActionsDialogProps = {
  modelGroups: ModelGroup[]
  promptModels: string[]
  promptSummaries: PromptSummary[]
  selectedModel: string
  onModelSelected: (modelId: string) => void
}

export function PromptModelActionsDialog({
  modelGroups,
  promptModels,
  promptSummaries,
  selectedModel,
  onModelSelected,
}: PromptModelActionsDialogProps) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const selectableModelGroups = useMemo(
    () => removeDefaultPromptModelGroups(modelGroups),
    [modelGroups],
  )
  const firstSelectableModel = useMemo(
    () => modelIdsFromGroups(selectableModelGroups)[0] ?? "",
    [selectableModelGroups],
  )
  const initialTargetModel = isDefaultPromptModelId(selectedModel)
    ? firstSelectableModel
    : selectedModel
  const [open, setOpen] = useState(false)
  const [targetModel, setTargetModel] = useState(initialTargetModel)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (open) setTargetModel(initialTargetModel)
  }, [initialTargetModel, open])

  const normalizedTargetModel = normalizePromptModelInput(targetModel)
  const targetPromptModelId = promptModelForSelectedModel(normalizedTargetModel)
  const staticModelIds = useMemo(() => new Set(modelIdsFromGroups(LLM_MODEL_GROUPS)), [])
  const missingPrompts = useMemo(
    () => promptSummaries.filter((prompt) => (
      !promptExistsForModel(prompt, normalizedTargetModel)
    )),
    [normalizedTargetModel, promptSummaries],
  )
  const isDefaultModel = isDefaultPromptModelId(normalizedTargetModel)
  const canCreate = normalizedTargetModel.length > 0
    && !isDefaultModel
    && !isCreating
    && missingPrompts.length > 0

  const saveModel = async (modelId: string) => {
    if (staticModelIds.has(modelId)) return

    const existing = new Set(promptModels.map(normalizePromptModelInput))
    existing.add(modelId)
    const saved = await api.updatePromptModels([...existing].sort((a, b) => a.localeCompare(b)))
    queryClient.setQueryData(["prompt-models"], saved)
    await queryClient.invalidateQueries({ queryKey: ["prompt-models"] })
  }

  const createPromptFiles = async () => {
    if (!normalizedTargetModel) {
      toast.error(t`Enter a model id.`)
      return
    }
    if (isDefaultModel || !targetPromptModelId) {
      toast.error(t`This model already has prompt files for every base prompt.`)
      return
    }

    setIsCreating(true)
    try {
      await saveModel(normalizedTargetModel)

      let created = 0
      for (const prompt of missingPrompts) {
        const basePrompt = await api.getPrompt(prompt.name, undefined, null)
        await api.updatePrompt(prompt.name, basePrompt.content, undefined, targetPromptModelId)
        created += 1
      }

      await queryClient.invalidateQueries({ queryKey: ["prompts"] })
      onModelSelected(normalizedTargetModel)
      toast.success(t`Created ${created} prompt files for ${normalizedTargetModel}.`)
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Unable to create prompt files.`)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs">
          <Plus className="h-3.5 w-3.5" />
          <Trans>Models</Trans>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Create model prompt files</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Choose an existing model or type a new provider:model id. Creating files stores the model in global prompt settings and copies the current base prompt content into missing model-specific versions.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              <Trans>Target model</Trans>
            </Label>
            <ModelSelect
              value={targetModel}
              onChange={setTargetModel}
              placeholder={firstSelectableModel}
              groups={selectableModelGroups}
              inputClassName="h-9 text-xs"
            />
          </div>

          <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            {isDefaultModel ? (
              <Trans>This model already has prompt files for every base prompt.</Trans>
            ) : missingPrompts.length === 0 ? (
              <Trans>This model already has prompt files for every base prompt.</Trans>
            ) : (
              <Trans>
                {missingPrompts.length} missing prompt files will be created. Existing files are left unchanged.
              </Trans>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={createPromptFiles} disabled={!canCreate}>
            <Copy className="h-3.5 w-3.5" />
            {isCreating ? <Trans>Creating...</Trans> : <Trans>Create files</Trans>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
