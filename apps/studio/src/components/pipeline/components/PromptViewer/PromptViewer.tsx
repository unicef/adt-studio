import { useEffect, useState } from "react"
import Editor from "@monaco-editor/react"
import { GitCompare, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import type { PromptResponse } from "@/api/client"
import { api } from "@/api/client"
import { PromptVersionHistory } from "@/components/pipeline/stages/book/GlobalPromptsSettings/PromptVersionHistory"
import { Trans, useLingui } from "@lingui/react/macro"
import { LLM_MODEL_GROUPS, ModelSelect } from "../ModelSelect"
import { PromptLiquidGuideDialog } from "./PromptLiquidGuideDialog"
import {
  configurePromptEditor,
  PROMPT_EDITOR_LANGUAGE,
  PROMPT_EDITOR_OPTIONS,
  PROMPT_EDITOR_THEME,
} from "./promptEditor"
import {
  promptModelForSelectedModel,
  promptNameForSelectedModel,
} from "./promptModel"
import type { PromptViewerProps } from "./types"
import { useEffectiveDefaultModel } from "@/hooks/use-effective-default-model"

export function PromptViewer({
  promptName,
  bookLabel,
  title,
  description,
  draft: externalDraft,
  model,
  onModelChange,
  onContentChange,
  maxRetries,
  onMaxRetriesChange,
  modelPlaceholder,
  modelGroups = LLM_MODEL_GROUPS,
  enabled = true,
  hideModel = false,
  readOnly = false,
}: PromptViewerProps) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const effectiveDefaultModel = useEffectiveDefaultModel(bookLabel)
  const resolvedModelPlaceholder = modelPlaceholder ?? effectiveDefaultModel
  const promptModelId = hideModel
    ? null
    : promptModelForSelectedModel(model)

  const { data: promptData, isLoading } = useQuery({
    queryKey: ["prompts", promptName, bookLabel, promptModelId],
    queryFn: () => api.getPrompt(promptName, bookLabel, promptModelId),
    enabled,
  })

  const [draft, setDraft] = useState<string | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  useEffect(() => {
    setDraft(null)
  }, [promptData?.content, promptModelId])

  const currentContent = promptData?.content ?? ""
  const externalDraftContent = externalDraft?.modelId === promptModelId ? externalDraft.content : null
  const displayDraft = draft ?? externalDraftContent
  const displayContent = displayDraft ?? currentContent
  const hasUnsavedPromptDraft = displayDraft != null && displayDraft !== currentContent
  const hasBookPromptOverride = bookLabel != null && promptData?.source === "book"
  const expectedModelPromptName = promptModelId
    ? promptNameForSelectedModel(promptName, promptModelId)
    : null

  const isUsingModelFallback = Boolean(
    promptModelId
      && promptData?.content != null
      && promptData.resolvedName !== expectedModelPromptName
  )

  const onChange = (value: string) => {
    setDraft(value)
    onContentChange?.(value === currentContent ? null : value, promptModelId)
  }

  const handleModelChange = (nextModel: string) => {
    if (
      hasUnsavedPromptDraft
      && !window.confirm(t`Discard unsaved prompt changes?`)
    ) {
      return
    }

    const nextPromptModelId = promptModelForSelectedModel(nextModel)
    setDraft(null)
    onContentChange?.(null, nextPromptModelId)
    onModelChange?.(nextModel)
  }

  const handleCurrentVersionChanged = async (
    changedPromptName: string,
    changedModelId: string | null,
    prompt: PromptResponse,
  ) => {
    if (changedPromptName === promptName && changedModelId === promptModelId) {
      setDraft(null)
      onContentChange?.(null, promptModelId)
    }

    queryClient.setQueryData(["prompts", changedPromptName, bookLabel, changedModelId], prompt)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["prompts", changedPromptName, bookLabel, changedModelId] }),
      queryClient.invalidateQueries({ queryKey: ["prompt-versions", changedPromptName, changedModelId, bookLabel] }),
    ])
  }

  const resetBookPrompt = async () => {
    if (!bookLabel) return
    if (
      hasUnsavedPromptDraft
      && !window.confirm(t`Discard unsaved prompt changes?`)
    ) {
      return
    }

    const resetPrompt = await api.resetPrompt(promptName, promptModelId, bookLabel)
    setDraft(null)
    onContentChange?.(null, promptModelId)
    queryClient.setQueryData(["prompts", promptName, bookLabel, promptModelId], resetPrompt)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["prompts", promptName, bookLabel, promptModelId] }),
      queryClient.invalidateQueries({ queryKey: ["prompt-versions", promptName, promptModelId, bookLabel] }),
    ])
  }

  const editorBody = isLoading ? (
    <div className="p-4 text-sm text-muted-foreground">
      <Trans>Loading prompt...</Trans>
    </div>
  ) : promptData?.content != null ? (
    <Editor
      value={displayContent}
      language={PROMPT_EDITOR_LANGUAGE}
      theme={PROMPT_EDITOR_THEME}
      beforeMount={configurePromptEditor}
      height="100%"
      width="100%"
      onChange={(value) => onChange(value ?? "")}
      options={{
        ...PROMPT_EDITOR_OPTIONS,
        readOnly,
      }}
    />
  ) : (
    <div className="p-4 text-sm text-muted-foreground">
      <Trans>Prompt template not found.</Trans>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 w-full max-w-none flex-col gap-3 p-4">
      <div className="shrink-0 space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {title}
        </h3>
        <p className="max-w-4xl text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="flex min-h-[560px] w-full flex-1 flex-col overflow-hidden rounded-md border bg-background">
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
          {!hideModel && (
            <>
              <div className="flex min-w-72 flex-1 items-center gap-2 sm:max-w-[28rem]">
                <Label className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t`Model`}
                </Label>
                <ModelSelect
                  value={model ?? ""}
                  onChange={handleModelChange}
                  placeholder={resolvedModelPlaceholder}
                  groups={modelGroups}
                  className="min-w-0 flex-1"
                  inputClassName="h-9 text-xs"
                />
              </div>

              {onMaxRetriesChange && (
                <div className="flex items-center gap-2">
                  <Label className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t`Retries`}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={maxRetries ?? ""}
                    onChange={(e) => onMaxRetriesChange(e.target.value)}
                    placeholder={String(DEFAULT_LLM_MAX_RETRIES)}
                    className="h-9 w-20 text-xs"
                  />
                </div>
              )}

              {isUsingModelFallback && expectedModelPromptName && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="h-6 cursor-help border-amber-200 bg-amber-50 px-2 text-[11px] font-medium text-amber-800 hover:bg-amber-50"
                    >
                      <Trans>Using fallback</Trans>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    variant="light"
                    className="block max-w-[320px] space-y-1.5 p-3 text-left"
                  >
                    <p className="text-xs font-medium text-foreground">
                      <Trans>Model-specific prompt not found</Trans>
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      <Trans>
                        This model is using the base prompt because {expectedModelPromptName} does not exist yet. Saving changes while this model is selected will create a prompt variant for it.
                      </Trans>
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          )}

          <div className="ml-auto">
            {hasBookPromptOverride && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mr-2 h-8"
                onClick={resetBookPrompt}
              >
                <RotateCcw className="size-4" />
                <Trans>Reset</Trans>
              </Button>
            )}
            {bookLabel && (
              <Button
                type="button"
                variant={isHistoryOpen ? "secondary" : "outline"}
                size="sm"
                className="mr-2 h-8"
                aria-pressed={isHistoryOpen}
                onClick={() => setIsHistoryOpen((isOpen) => !isOpen)}
              >
                <GitCompare className="size-4" />
                <Trans>Versions</Trans>
              </Button>
            )}
            <PromptLiquidGuideDialog promptName={promptName} content={displayContent} />
          </div>
        </div>

        <div className="min-h-[520px] flex-1 overflow-hidden">
          {bookLabel && isHistoryOpen ? (
            <ResizablePanelGroup
              orientation="horizontal"
              defaultLayout={{ promptEditorBody: 58, promptVersions: 42 }}
              className="min-h-0"
            >
              <ResizablePanel
                id="promptEditorBody"
                defaultSize="58%"
                minSize="450px"
              >
                {editorBody}
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel
                id="promptVersions"
                defaultSize="42%"
                minSize="360px"
                maxSize="65%"
              >
                <PromptVersionHistory
                  promptName={promptName}
                  bookLabel={bookLabel}
                  modelId={promptModelId}
                  currentContent={currentContent}
                  editedContent={displayContent}
                  disabled={isLoading || promptData?.content == null}
                  hasUnsavedChanges={hasUnsavedPromptDraft}
                  onCurrentVersionChanged={handleCurrentVersionChanged}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            editorBody
          )}
        </div>
      </div>
    </div>
  )
}
