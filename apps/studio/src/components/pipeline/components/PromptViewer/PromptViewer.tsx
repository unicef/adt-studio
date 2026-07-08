import { useEffect, useState } from "react"
import Editor from "@monaco-editor/react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useQuery } from "@tanstack/react-query"
import { DEFAULT_LLM_MAX_RETRIES } from "@adt/types"
import { api } from "@/api/client"
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

export function PromptViewer({
  promptName,
  bookLabel,
  title,
  description,
  model,
  onModelChange,
  onContentChange,
  maxRetries,
  onMaxRetriesChange,
  modelPlaceholder = "openai:gpt-5.4",
  modelGroups = LLM_MODEL_GROUPS,
  enabled = true,
  hideModel = false,
  readOnly = false,
}: PromptViewerProps) {
  const { t } = useLingui()
  const promptModelId = hideModel ? null : promptModelForSelectedModel(model)

  const { data: promptData, isLoading } = useQuery({
    queryKey: ["prompts", promptName, bookLabel, promptModelId],
    queryFn: () => api.getPrompt(promptName, bookLabel, promptModelId),
    enabled,
  })

  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    setDraft(null)
    onContentChange?.(null, promptModelId)
  }, [promptData?.content, promptModelId])

  const currentContent = promptData?.content ?? ""
  const displayContent = draft ?? currentContent
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
                  onChange={(v) => onModelChange?.(v)}
                  placeholder={modelPlaceholder}
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
            <PromptLiquidGuideDialog promptName={promptName} content={displayContent} />
          </div>
        </div>

        <div className="min-h-[520px] flex-1 overflow-hidden">
          {isLoading ? (
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
          )}
        </div>
      </div>
    </div>
  )
}
