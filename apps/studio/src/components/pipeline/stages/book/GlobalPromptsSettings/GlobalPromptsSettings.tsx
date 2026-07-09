import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, GitCompare } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { PromptResponse } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFloatingSave } from "@/components/pipeline/components/floating-save";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toast } from "@/components/ui/sonner";
import { LLM_MODEL_GROUPS } from "@/components/pipeline/components/ModelSelect";
import { PromptLiquidGuideDialog } from "@/components/pipeline/components/PromptViewer/PromptLiquidGuideDialog";
import {
  promptModelForSelectedModel,
  promptNameForSelectedModel,
} from "@/components/pipeline/components/PromptViewer/promptModel";
import { Trans, useLingui } from "@lingui/react/macro";
import { PromptEditorPane } from "./PromptEditorPane";
import { PromptFileTree } from "./PromptFileTree";
import { PromptModelActionsDialog } from "./PromptModelActionsDialog";
import {
  PromptFileTreeSkeleton,
  PromptStatusSkeleton,
  SelectedPromptHeaderSkeleton,
} from "./PromptSettingsSkeletons";
import { PromptStatusBadges } from "./PromptStatusBadges";
import { PromptVersionHistory } from "./PromptVersionHistory";
import {
  DEFAULT_MODEL,
  isDefaultPromptModelId,
  mergePromptModelGroups,
  modelIdsFromGroups,
  normalizePromptModelInput,
  promptFileNameForModel,
  promptTreeKey,
  updatePromptCaches,
} from "./promptSettings";

type DeletePromptVariables = {
  promptName: string;
  modelId: string;
};

type DeleteModelVariables = {
  modelId: string;
  promptNames: string[];
};

export function GlobalPromptsSettings({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [treeFilter, setTreeFilter] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const currentSelectionRef = useRef<{
    promptName: string;
    modelId: string | null;
  }>({ promptName: "", modelId: null });

  const promptListQuery = useQuery({
    queryKey: ["prompts"],
    queryFn: api.listPrompts,
  });

  const promptSummaries = useMemo(
    () => promptListQuery.data?.prompts ?? [],
    [promptListQuery.data],
  );
  const promptModelsQuery = useQuery({
    queryKey: ["prompt-models"],
    queryFn: api.listPromptModels,
  });
  const promptModels = useMemo(
    () => promptModelsQuery.data?.models ?? [],
    [promptModelsQuery.data],
  );
  const modelGroups = useMemo(
    () => mergePromptModelGroups(LLM_MODEL_GROUPS, promptModels),
    [promptModels],
  );
  const staticModelIds = useMemo(
    () => new Set(modelIdsFromGroups(LLM_MODEL_GROUPS)),
    [],
  );

  useEffect(() => {
    if (!selectedPrompt && promptSummaries.length > 0) {
      const firstPrompt = promptSummaries[0].name;
      setSelectedPrompt(firstPrompt);
    }
  }, [promptSummaries, selectedPrompt]);

  const promptModelId = promptModelForSelectedModel(model);
  useEffect(() => {
    currentSelectionRef.current = { promptName: selectedPrompt, modelId: promptModelId };
  }, [selectedPrompt, promptModelId]);

  const promptQuery = useQuery({
    queryKey: ["prompts", selectedPrompt, undefined, promptModelId],
    queryFn: () => api.getPrompt(selectedPrompt, undefined, promptModelId),
    enabled: selectedPrompt.length > 0,
  });

  useEffect(() => {
    setDraft(null);
  }, [promptQuery.data?.content, promptModelId, selectedPrompt]);

  const currentContent = promptQuery.data?.content ?? "";
  const displayContent = draft ?? currentContent;
  const expectedModelPromptName = promptModelId
    ? promptNameForSelectedModel(selectedPrompt, promptModelId)
    : null;
  const isUsingFallback = Boolean(
    promptModelId &&
    promptQuery.data?.content != null &&
    promptQuery.data.resolvedName !== expectedModelPromptName,
  );
  const isEditedGlobalVersion = Boolean(promptQuery.data?.version);
  const isDirty = draft != null && draft !== currentContent;
  const hasResettableVersion = selectedPrompt.length > 0 && isEditedGlobalVersion;

  const canDiscardDraft = () => (
    !isDirty || window.confirm(t`Discard unsaved prompt changes?`)
  );

  const selectPromptFile = (promptName: string, modelId: string) => {
    if (!canDiscardDraft()) return;
    setSelectedPrompt(promptName);
    setModel(modelId);
    setDraft(null);
  };

  const selectModel = (modelId: string) => {
    if (!canDiscardDraft()) return;
    setModel(modelId);
    setDraft(null);
  };

  const handleCurrentVersionChanged = async (
    promptName: string,
    modelId: string | null,
    prompt: PromptResponse,
  ) => {
    if (
      currentSelectionRef.current.promptName === promptName
      && currentSelectionRef.current.modelId === modelId
    ) {
      setDraft(null);
    }
    updatePromptCaches(queryClient, promptName, modelId, prompt);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["prompts"] }),
      queryClient.invalidateQueries({ queryKey: ["prompt-versions", promptName, modelId] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updatePrompt(
        selectedPrompt,
        displayContent,
        undefined,
        promptModelId,
      ),
    onSuccess: async (saved) => {
      setDraft(null);
      updatePromptCaches(queryClient, selectedPrompt, promptModelId, saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions", selectedPrompt, promptModelId] }),
      ]);
      toast.success(t`Global prompt saved.`);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Unable to save global prompt.`,
      );
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetPrompt(selectedPrompt, promptModelId),
    onSuccess: async (resetPrompt) => {
      setDraft(null);
      updatePromptCaches(
        queryClient,
        selectedPrompt,
        promptModelId,
        resetPrompt,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions", selectedPrompt, promptModelId] }),
      ]);
      toast.success(t`Global prompt reset to default.`);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Unable to reset global prompt.`,
      );
    },
  });

  const deletePromptMutation = useMutation({
    mutationFn: ({ promptName, modelId }: DeletePromptVariables) => {
      if (modelId === DEFAULT_MODEL) {
        throw new Error(t`Default prompt files cannot be deleted.`);
      }
      return api.resetPrompt(promptName, promptModelForSelectedModel(modelId));
    },
    onSuccess: async (resetPrompt, { promptName, modelId }) => {
      const deletedPromptModelId = promptModelForSelectedModel(modelId);
      updatePromptCaches(
        queryClient,
        promptName,
        deletedPromptModelId,
        resetPrompt,
      );
      if (selectedPrompt === promptName && model === modelId) setDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions"] }),
      ]);
      toast.success(t`Prompt file deleted.`);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Unable to delete prompt file.`,
      );
    },
  });

  const deleteModelMutation = useMutation({
    mutationFn: async ({ modelId, promptNames }: DeleteModelVariables) => {
      if (modelId === DEFAULT_MODEL) {
        throw new Error(t`Default prompt folders cannot be deleted.`);
      }

      const deletedPromptModelId = promptModelForSelectedModel(modelId);
      if (deletedPromptModelId) {
        for (const promptName of promptNames) {
          await api.resetPrompt(promptName, deletedPromptModelId);
        }
      }

      if (promptModels.includes(modelId)) {
        const savedModels = await api.updatePromptModels(
          promptModels.filter((promptModel) => promptModel !== modelId),
        );
        queryClient.setQueryData(["prompt-models"], savedModels);
      }
    },
    onSuccess: async (_, { modelId }) => {
      if (model === modelId) {
        setModel(DEFAULT_MODEL);
        setDraft(null);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-models"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions"] }),
      ]);
      toast.success(t`Prompt folder deleted.`);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Unable to delete prompt folder.`,
      );
    },
  });

  const handleCreatePromptFromTemplate = async (
    promptName: string,
    sourceModelId: string,
    targetModelId: string,
  ) => {
    const normalizedTargetModel = normalizePromptModelInput(targetModelId);
    try {
      if (!normalizedTargetModel) {
        throw new Error(t`Enter a model id.`);
      }
      if (isDefaultPromptModelId(normalizedTargetModel)) {
        throw new Error(t`Default model cannot be used as a template target.`);
      }

      const sourcePrompt = await api.getPrompt(
        promptName,
        undefined,
        promptModelForSelectedModel(sourceModelId),
      );
      const targetPromptModelId = promptModelForSelectedModel(
        normalizedTargetModel,
      );
      const savedPrompt = await api.updatePrompt(
        promptName,
        sourcePrompt.content,
        undefined,
        targetPromptModelId,
      );

      if (
        targetPromptModelId &&
        !staticModelIds.has(normalizedTargetModel) &&
        !promptModels.includes(normalizedTargetModel)
      ) {
        const savedModels = await api.updatePromptModels(
          [...promptModels, normalizedTargetModel].sort((a, b) =>
            a.localeCompare(b),
          ),
        );
        queryClient.setQueryData(["prompt-models"], savedModels);
      }

      updatePromptCaches(
        queryClient,
        promptName,
        targetPromptModelId,
        savedPrompt,
      );
      setSelectedPrompt(promptName);
      setModel(normalizedTargetModel);
      setDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prompts"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-models"] }),
        queryClient.invalidateQueries({ queryKey: ["prompt-versions"] }),
      ]);
      toast.success(t`Prompt file created from template.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Unable to create prompt file from template.`,
      );
      throw error;
    }
  };

  const activePromptLabel =
    promptFileNameForModel(selectedPrompt, model);
  const selectedTreeKey = selectedPrompt
    ? promptTreeKey(model, selectedPrompt)
    : "";
  const deletingTreeKey =
    deletePromptMutation.isPending && deletePromptMutation.variables
      ? promptTreeKey(
          deletePromptMutation.variables.modelId,
          deletePromptMutation.variables.promptName,
        )
      : null;
  const deletingModelId =
    deleteModelMutation.isPending && deleteModelMutation.variables
      ? deleteModelMutation.variables.modelId
      : null;
  const isPromptFilesLoading =
    promptListQuery.isLoading || promptModelsQuery.isLoading;
  const isPromptEditorLoading = isPromptFilesLoading || promptQuery.isLoading;
  const isSavingPrompt = saveMutation.isPending || resetMutation.isPending;

  useFloatingSave({
    id: "global-prompts",
    dirty: !isPromptEditorLoading && (isDirty || hasResettableVersion),
    saving: isSavingPrompt,
    label: isDirty ? undefined : (
      <span className="text-[11px] font-medium text-foreground">
        <Trans>Custom prompt version</Trans>
      </span>
    ),
    labelKey: isDirty ? "unsaved" : "custom-version",
    onDiscard: isDirty ? () => setDraft(null) : undefined,
    onReset: hasResettableVersion ? () => resetMutation.mutate() : undefined,
    onSave: isDirty ? () => saveMutation.mutate() : undefined,
  });

  return (
    <div
      className={
        embedded
          ? "flex h-[72vh] min-h-130 flex-col gap-3 p-4"
          : "flex h-full min-h-[calc(100vh-2.5rem)] flex-col gap-4 p-4"
      }
    >
      <div className="shrink-0">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          <Trans>Global prompts</Trans>
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
          <Trans>
            Edit fallback prompts used by every book. Saving creates a global
            prompt version; reset removes the version and returns to the shipped
            default file.
          </Trans>
        </p>
      </div>

      <div
        className={
          embedded
            ? "min-h-0 flex-1 overflow-hidden rounded-md border bg-background"
            : "min-h-[640px] flex-1 overflow-hidden rounded-md border bg-background"
        }
      >
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={{ promptTree: 24, promptEditor: 76 }}
          className="min-h-0"
        >
          <ResizablePanel
            id="promptTree"
            defaultSize="24%"
            minSize="220px"
            maxSize="42%"
            className="h-full min-w-[220px]"
          >
            <aside className="flex h-full w-full min-w-0 flex-col bg-muted/20">
              <div className="flex gap-2 items-center shrink-0 border-b p-3">
                <Input
                  type="search"
                  value={treeFilter}
                  onChange={(event) => setTreeFilter(event.target.value)}
                  placeholder={t`Filter prompt files...`}
                  className="h-8 text-xs"
                />

                <PromptModelActionsDialog
                  modelGroups={modelGroups}
                  promptModels={promptModels}
                  promptSummaries={promptSummaries}
                  selectedModel={model}
                  onModelSelected={selectModel}
                />
              </div>
              {isPromptFilesLoading ? (
                <PromptFileTreeSkeleton />
              ) : (
                <PromptFileTree
                  prompts={promptSummaries}
                  modelGroups={modelGroups}
                  filter={treeFilter}
                  selectedKey={selectedTreeKey}
                  selectedModel={model}
                  deletingKey={deletingTreeKey}
                  deletingModelId={deletingModelId}
                  onSelectPrompt={selectPromptFile}
                  onCreatePromptFromTemplate={handleCreatePromptFromTemplate}
                  onDeletePrompt={(promptName, modelId) =>
                    deletePromptMutation.mutateAsync({ promptName, modelId })
                  }
                  onDeleteModel={(modelId, promptNames) =>
                    deleteModelMutation.mutateAsync({ modelId, promptNames })
                  }
                />
              )}
            </aside>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            id="promptEditor"
            minSize="480px"
            className="h-full min-w-0"
          >
            <section className="flex h-full w-full min-w-0 flex-col">
              <div className="flex shrink-0 flex-wrap items-end gap-3 border-b bg-muted/20 p-3">
                <div className="min-w-96 flex-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    <Trans>Selected file</Trans>
                  </Label>
                  {isPromptFilesLoading ? (
                    <SelectedPromptHeaderSkeleton />
                  ) : (
                    <div className="flex h-9 items-center gap-2 bg-background font-mono text-sm">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{activePromptLabel}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pb-0.5">
                  {isPromptEditorLoading ? (
                    <>
                      <PromptStatusSkeleton />
                      <div className="ml-auto" />
                    </>
                  ) : (
                    <>
                      <PromptStatusBadges
                        isUsingFallback={isUsingFallback}
                        isEditedGlobalVersion={isEditedGlobalVersion}
                      />
                      <Button
                        type="button"
                        variant={isDiffOpen ? "secondary" : "outline"}
                        size="sm"
                        className="ml-auto h-8"
                        aria-pressed={isDiffOpen}
                        onClick={() => setIsDiffOpen((isOpen) => !isOpen)}
                      >
                        <GitCompare className="size-4" />
                        <Trans>Diff</Trans>
                      </Button>
                      <PromptLiquidGuideDialog
                        promptName={selectedPrompt}
                        content={displayContent}
                      />
                    </>
                  )}
                </div>
              </div>

              <div
                className={
                  embedded
                    ? "min-h-0 flex-1"
                    : "min-h-[560px] flex-1"
                }
              >
                {isDiffOpen ? (
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
                      <PromptEditorPane
                        isLoading={isPromptEditorLoading}
                        content={promptQuery.data?.content}
                        displayContent={displayContent}
                        onChange={setDraft}
                      />
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel
                      id="promptVersions"
                      defaultSize="45%"
                      minSize="45%"
                      maxSize="65%"
                    >
                      <PromptVersionHistory
                        promptName={selectedPrompt}
                        modelId={promptModelId}
                        currentContent={currentContent}
                        editedContent={displayContent}
                        disabled={isPromptEditorLoading || promptQuery.data?.content == null}
                        hasUnsavedChanges={isDirty}
                        onCurrentVersionChanged={handleCurrentVersionChanged}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                ) : (
                  <PromptEditorPane
                    isLoading={isPromptEditorLoading}
                    content={promptQuery.data?.content}
                    displayContent={displayContent}
                    onChange={setDraft}
                  />
                )}
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
