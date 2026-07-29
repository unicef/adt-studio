import { useEffect, useMemo, useState } from "react"
import { FileText, Folder, FolderOpen } from "lucide-react"
import type { ModelGroup } from "@/components/pipeline/components/ModelSelect"
import { Badge } from "@/components/ui/badge"
import { promptNameForSelectedModel } from "@/components/pipeline/components/PromptViewer/promptModel"
import { cn } from "@/lib/utils"
import { Trans } from "@lingui/react/macro"
import { PromptFileActions } from "./PromptFileActions"
import { PromptFolderActions } from "./PromptFolderActions"
import {
  DEFAULT_MODEL,
  promptExistsForModel,
  promptFileNameForModel,
  promptTreeKey,
} from "./promptSettings"

type PromptSummary = {
  name: string
  variants: string[]
  variantSources?: Record<string, "file" | "version" | "file+version">
}

type PromptFileTreeProps = {
  prompts: PromptSummary[]
  modelGroups: ModelGroup[]
  filter: string
  selectedKey: string
  selectedModel: string
  defaultModelId: string
  deletingKey: string | null
  deletingModelId: string | null
  onSelectPrompt: (promptName: string, modelId: string) => void
  onCreatePromptFromTemplate: (
    promptName: string,
    sourceModelId: string,
    targetModelId: string,
  ) => Promise<unknown>
  onDeletePrompt: (promptName: string, modelId: string) => Promise<unknown>
  onDeleteModel: (modelId: string, promptNames: string[]) => Promise<unknown>
}

type ModelPromptFolder = {
  modelId: string
  allPromptNames: string[]
  hasProjectDefaultFiles: boolean
  prompts: Array<{
    name: string
    fileName: string
    isProjectDefault: boolean
  }>
}

export function PromptFileTree({
  prompts,
  modelGroups,
  filter,
  selectedKey,
  selectedModel,
  defaultModelId,
  deletingKey,
  deletingModelId,
  onSelectPrompt,
  onCreatePromptFromTemplate,
  onDeletePrompt,
  onDeleteModel,
}: PromptFileTreeProps) {
  const [openFolders, setOpenFolders] = useState<Set<string>>(
    () => new Set([defaultModelId || DEFAULT_MODEL]),
  )
  const normalizedFilter = filter.trim().toLowerCase()

  const modelFolders = useMemo<ModelPromptFolder[]>(
    () => modelGroups.flatMap((group) =>
      group.models.map((model) => {
        const modelId = `${group.provider}:${model}`
        const existingPrompts = prompts.filter((prompt) => (
          promptExistsForModel(prompt, modelId)
        ))
        const projectDefaultPrompts = existingPrompts.filter((prompt) => (
          isProjectDefaultPromptVariant(prompt, modelId)
        ))
        return {
          modelId,
          allPromptNames: existingPrompts.map((prompt) => prompt.name),
          hasProjectDefaultFiles: projectDefaultPrompts.length > 0,
          prompts: existingPrompts.map((prompt) => ({
            name: prompt.name,
            fileName: promptFileNameForModel(prompt.name, modelId),
            isProjectDefault: isProjectDefaultPromptVariant(
              prompt,
              modelId,
            ),
          })),
        }
      }),
    ),
    [modelGroups, prompts],
  )

  const visibleFolders = useMemo(
    () => modelFolders
      .map((folder) => {
        if (!normalizedFilter) return folder
        const modelMatches = folder.modelId.toLowerCase().includes(normalizedFilter)
        const visiblePrompts = folder.prompts.filter((prompt) => (
          modelMatches
            || prompt.fileName.toLowerCase().includes(normalizedFilter)
        ))
        return { ...folder, prompts: visiblePrompts }
      })
      .filter((folder) => (
        folder.prompts.length > 0
          || folder.modelId === selectedModel
          || (normalizedFilter.length > 0 && folder.modelId.toLowerCase().includes(normalizedFilter))
      )),
    [modelFolders, normalizedFilter, selectedModel],
  )

  useEffect(() => {
    setOpenFolders((current) => new Set([
      ...current,
      selectedModel || defaultModelId || DEFAULT_MODEL,
    ]))
  }, [defaultModelId, selectedModel])

  useEffect(() => {
    if (!normalizedFilter) return
    setOpenFolders(new Set(visibleFolders.map((folder) => folder.modelId)))
  }, [normalizedFilter, visibleFolders])

  if (visibleFolders.length === 0) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        <Trans>No prompt files found.</Trans>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-2">
      <div className="flex flex-col gap-0.5">
        {visibleFolders.map((folder) => {
          const isOpen = openFolders.has(folder.modelId) || normalizedFilter.length > 0
          const FolderIcon = isOpen ? FolderOpen : Folder
          const isDefaultFolder = folder.modelId === defaultModelId
          const isSelectedFolder = selectedModel === folder.modelId
          const canDeleteFolder = !isDefaultFolder && !folder.hasProjectDefaultFiles
          return (
            <div key={folder.modelId}>
              <div
                className={cn(
                  "group flex w-full min-w-0 items-center rounded text-xs font-medium hover:bg-muted",
                  isSelectedFolder && "bg-muted/70",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                  onClick={() => {
                    setOpenFolders((current) => {
                      const next = new Set(current)
                      if (next.has(folder.modelId)) next.delete(folder.modelId)
                      else next.add(folder.modelId)
                      return next
                    })
                  }}
                  aria-expanded={isOpen}
                >
                  <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono">{folder.modelId}</span>
                </button>
                {isDefaultFolder && (
                  <Badge variant="secondary" className="ml-auto shrink-0 px-1.5 py-0 text-[10px] font-medium">
                    <Trans>Default</Trans>
                  </Badge>
                )}
                {canDeleteFolder && (
                  <PromptFolderActions
                    modelId={folder.modelId}
                    isActive={isSelectedFolder || deletingModelId === folder.modelId}
                    isDeleting={deletingModelId === folder.modelId}
                    onDelete={() => onDeleteModel(folder.modelId, folder.allPromptNames)}
                  />
                )}
              </div>

              {isOpen && (
                <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l pl-2">
                  {folder.prompts.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      <Trans>No prompt files for this model.</Trans>
                    </div>
                  )}
                  {folder.prompts.map((prompt) => {
                    const itemKey = promptTreeKey(folder.modelId, prompt.name)
                    const isSelectedFile = selectedKey === itemKey
                    return (
                      <div
                        key={itemKey}
                        className={cn(
                          "group flex w-full min-w-0 items-center rounded text-xs hover:bg-muted",
                          isSelectedFile && "bg-primary/10 text-primary hover:bg-primary/10",
                        )}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                          onClick={() => onSelectPrompt(prompt.name, folder.modelId)}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-mono">{prompt.fileName}</span>
                        </button>
                        <PromptFileActions
                          promptName={prompt.name}
                          fileName={prompt.fileName}
                          modelGroups={modelGroups}
                          defaultTargetModel={selectedModel || defaultModelId}
                          isActive={isSelectedFile || deletingKey === itemKey}
                          isDeleting={deletingKey === itemKey}
                          canDelete={!prompt.isProjectDefault}
                          onCreateFromTemplate={(targetModelId) =>
                            onCreatePromptFromTemplate(prompt.name, folder.modelId, targetModelId)}
                          onDelete={() => onDeletePrompt(prompt.name, folder.modelId)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function isProjectDefaultPromptVariant(
  prompt: PromptSummary,
  modelId: string,
): boolean {
  if (modelId === DEFAULT_MODEL) return true
  const variantName = promptNameForSelectedModel(prompt.name, modelId)
  if (!prompt.variants.includes(variantName)) return false
  const source = prompt.variantSources?.[variantName]
  return source === "file" || source === "file+version"
}
