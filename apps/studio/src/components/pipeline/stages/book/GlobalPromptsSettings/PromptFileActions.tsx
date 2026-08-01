import { useEffect, useMemo, useState } from "react"
import { Copy, MoreHorizontal, Trash2 } from "lucide-react"
import { ModelSelect, type ModelGroup } from "@/components/pipeline/components/ModelSelect"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  isDefaultPromptModelId,
  modelIdsFromGroups,
  normalizePromptModelInput,
  promptFileNameForModel,
  removeDefaultPromptModelGroups,
} from "./promptSettings"

type PromptFileActionsProps = {
  promptName: string
  fileName: string
  modelGroups: ModelGroup[]
  defaultTargetModel: string
  isActive: boolean
  isDeleting: boolean
  canDelete: boolean
  onCreateFromTemplate: (targetModel: string) => Promise<unknown>
  onDelete: () => Promise<unknown>
}

export function PromptFileActions({
  promptName,
  fileName,
  modelGroups,
  defaultTargetModel,
  isActive,
  isDeleting,
  canDelete,
  onCreateFromTemplate,
  onDelete,
}: PromptFileActionsProps) {
  const { t } = useLingui()
  const templateModelGroups = useMemo(
    () => removeDefaultPromptModelGroups(modelGroups),
    [modelGroups],
  )
  const firstTemplateModel = useMemo(
    () => modelIdsFromGroups(templateModelGroups)[0] ?? "",
    [templateModelGroups],
  )
  const initialTargetModel = isDefaultPromptModelId(defaultTargetModel)
    ? firstTemplateModel
    : defaultTargetModel
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [targetModel, setTargetModel] = useState(initialTargetModel)
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)

  useEffect(() => {
    if (templateOpen) setTargetModel(initialTargetModel)
  }, [initialTargetModel, templateOpen])

  const normalizedTargetModel = normalizePromptModelInput(targetModel)
  const isDefaultTargetModel = isDefaultPromptModelId(normalizedTargetModel)
  const canCreateFromTemplate = normalizedTargetModel.length > 0
    && !isDefaultTargetModel
    && !isCreatingTemplate
  const targetFileName = normalizedTargetModel && !isDefaultTargetModel
    ? promptFileNameForModel(promptName, normalizedTargetModel)
    : ""

  const handleDelete = async () => {
    await onDelete()
    setConfirmOpen(false)
  }

  const handleCreateFromTemplate = async () => {
    if (!normalizedTargetModel || isDefaultTargetModel) return

    setIsCreatingTemplate(true)
    try {
      await onCreateFromTemplate(normalizedTargetModel)
      setTemplateOpen(false)
    } catch {
      // The parent shows the actionable error toast and keeps the dialog open.
    } finally {
      setIsCreatingTemplate(false)
    }
  }

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={[
              "h-7 w-7 shrink-0 text-muted-foreground transition-opacity hover:text-foreground",
              isActive
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
            ].join(" ")}
            aria-label={t`File actions`}
            title={t`File actions`}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 rounded-md p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start px-2 text-xs"
            onClick={() => {
              setPopoverOpen(false)
              setTemplateOpen(true)
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            <Trans>Use as template</Trans>
          </Button>
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start px-2 text-xs text-destructive hover:text-destructive"
              disabled={isDeleting}
              onClick={() => {
                setPopoverOpen(false)
                setConfirmOpen(true)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <Trans>Delete file</Trans>
            </Button>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={confirmOpen} onOpenChange={(open) => !isDeleting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Delete prompt file?</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                This removes the global version for this prompt file. Shipped fallback files remain available.
              </Trans>
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-xs">
            {fileName}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isDeleting}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Trans>Deleting...</Trans> : <Trans>Delete</Trans>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templateOpen} onOpenChange={(open) => !isCreatingTemplate && setTemplateOpen(open)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              <Trans>Create prompt file from template</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                Choose the target model. The new global prompt file will use this file content and the normal model-specific prompt name.
              </Trans>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                <Trans>Source file</Trans>
              </Label>
              <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-xs">
                {fileName}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                <Trans>Target model</Trans>
              </Label>
              <ModelSelect
                value={targetModel}
                onChange={setTargetModel}
                placeholder={firstTemplateModel}
                groups={templateModelGroups}
                inputClassName="h-9 text-xs"
              />
              {isDefaultTargetModel && (
                <p className="text-xs text-destructive">
                  <Trans>Default model cannot be used as a template target.</Trans>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                <Trans>Target file</Trans>
              </Label>
              <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-xs">
                {targetFileName || "-"}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTemplateOpen(false)}
              disabled={isCreatingTemplate}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              type="button"
              onClick={handleCreateFromTemplate}
              disabled={!canCreateFromTemplate}
            >
              {isCreatingTemplate ? <Trans>Creating...</Trans> : <Trans>Create file</Trans>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
