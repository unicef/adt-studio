import { useState } from "react"
import { PromptPersistenceInfo } from "@/components/pipeline/components/PromptViewer/PromptPersistenceInfo"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileText, GitCompare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { PromptLiquidGuideDialog } from "@/components/pipeline/components/PromptViewer/PromptLiquidGuideDialog"
import { PromptEditorPane } from "@/components/pipeline/stages/book/GlobalPromptsSettings/PromptEditorPane"
import { PromptFileTree } from "@/components/pipeline/stages/book/GlobalPromptsSettings/PromptFileTree"
import { PromptModelActionsDialog } from "@/components/pipeline/stages/book/GlobalPromptsSettings/PromptModelActionsDialog"
import {
  PromptFileTreeSkeleton,
  PromptStatusSkeleton,
  SelectedPromptHeaderSkeleton,
} from "@/components/pipeline/stages/book/GlobalPromptsSettings/PromptSettingsSkeletons"
import { PromptStatusBadges } from "@/components/pipeline/stages/book/GlobalPromptsSettings/PromptStatusBadges"
import { PromptVersionHistory } from "@/components/pipeline/stages/book/GlobalPromptsSettings/PromptVersionHistory"
import { useGlobalPrompts } from "./globalPrompts"
import { SettingsHeading, SettingsLead } from "./ui"

export function PromptsSection() {
  const { t } = useLingui()
  const prompts = useGlobalPrompts()
  const [restoring, setRestoring] = useState(false)

  useFloatingSave({
    id: "global-prompts",
    dirty: !prompts.isPromptEditorLoading && prompts.isDirty,
    saving: prompts.isSavingPrompt || restoring,
    onDiscard: prompts.isDirty ? prompts.discardDraft : undefined,

    onSave: prompts.isDirty ? prompts.save : undefined,
  })

  const editor = (
    <PromptEditorPane
      readOnly={restoring}
      isLoading={prompts.isPromptEditorLoading}
      content={prompts.promptContent}
      displayContent={prompts.displayContent}
      onChange={prompts.setDraft}
    />
  )

  return (
    <>
      <div className="shrink-0">
        <SettingsHeading>
          <Trans>Global prompts</Trans>
        </SettingsHeading>
        <SettingsLead>
          <Trans>
            Edit fallback prompts used by every book. Saving creates a global
            prompt version; reset retains history and returns to the shipped
            default file.
          </Trans>
        </SettingsLead>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border bg-card">
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={{ promptTree: 24, promptEditor: 76 }}
          className="min-h-0"
        >
          <ResizablePanel
            id="promptTree"
            defaultSize="24%"
            minSize="240px"
            maxSize="42%"
            className="h-full min-w-[240px]"
          >
            <aside className="flex h-full w-full min-w-0 flex-col bg-muted/25">
              <div className="flex shrink-0 items-center gap-2 border-b px-3 py-[11px]">
                <Input
                  type="search"
                  value={prompts.treeFilter}
                  onChange={(event) => prompts.setTreeFilter(event.target.value)}
                  placeholder={t`Filter prompt files...`}
                  className="h-9 rounded-lg bg-background text-xs"
                />
                <PromptModelActionsDialog
                  modelGroups={prompts.modelGroups}
                  promptModels={prompts.promptModels}
                  promptSummaries={prompts.promptSummaries}
                  selectedModel={prompts.model}
                  onModelSelected={prompts.selectModel}
                />
              </div>
              {prompts.isPromptFilesLoading ? (
                <PromptFileTreeSkeleton />
              ) : (
                <PromptFileTree
                  prompts={prompts.promptSummaries}
                  modelGroups={prompts.modelGroups}
                  filter={prompts.treeFilter}
                  selectedKey={prompts.selectedTreeKey}
                  selectedModel={prompts.model}
                  defaultModelId={prompts.defaultModelId}
                  deletingKey={prompts.deletingTreeKey}
                  deletingModelId={prompts.deletingModelId}
                  onSelectPrompt={prompts.selectPromptFile}
                  onCreatePromptFromTemplate={prompts.createPromptFromTemplate}
                  onDeletePrompt={prompts.deletePrompt}
                  onDeleteModel={prompts.deleteModel}
                />
              )}
            </aside>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel id="promptEditor" minSize="480px" className="h-full min-w-0">
            <section className="flex h-full w-full min-w-0 flex-col">
              <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-[11px]">
                <div className="min-w-[260px] flex-1">
                  <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <Trans>Selected file</Trans>
                  </div>
                  {prompts.isPromptFilesLoading ? (
                    <SelectedPromptHeaderSkeleton />
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-600">
                        <FileText className="size-3.5" />
                      </span>
                      <span className="truncate font-mono text-[13px] font-medium">
                        {prompts.activePromptLabel}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {prompts.isPromptEditorLoading ? (
                    <PromptStatusSkeleton />
                  ) : (
                    <>
                      <PromptStatusBadges
                        isUsingFallback={prompts.isUsingFallback}
                        isDirty={prompts.isDirty}
                        source={prompts.promptState?.source}
                        logicalPath={prompts.promptState?.persistence.logicalPath}
                      />
                      {prompts.hasResettableVersion && (
                        <Button type="button" variant="outline" size="sm" disabled={prompts.isSavingPrompt || restoring} onClick={prompts.reset}>
                          <Trans>Reset</Trans>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant={prompts.isDiffOpen ? "secondary" : "outline"}
                        size="sm"
                        className="h-9 rounded-lg"
                        aria-pressed={prompts.isDiffOpen}
                        onClick={prompts.toggleDiff}
                      >
                        <GitCompare className="size-4" />
                        <Trans>Diff</Trans>
                      </Button>
                      <PromptLiquidGuideDialog
                        promptName={prompts.selectedPrompt}
                        content={prompts.displayContent}
                      />
                    </>
                  )}
                </div>
              </div>

              <PromptPersistenceInfo prompt={prompts.promptState} dirty={prompts.isDirty} conflict={prompts.conflict}
                onReload={prompts.reloadLatest} onKeepDraft={prompts.keepDraft} />
              <div className="min-h-0 flex-1">
                {prompts.isDiffOpen ? (
                  <ResizablePanelGroup
                    orientation="horizontal"
                    defaultLayout={{ promptEditorBody: 58, promptVersions: 42 }}
                    className="min-h-0"
                  >
                    <ResizablePanel id="promptEditorBody" defaultSize="58%" minSize="35%">
                      {editor}
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    <ResizablePanel
                      id="promptVersions"
                      defaultSize="45%"
                      minSize="45%"
                      maxSize="65%"
                    >
                      <PromptVersionHistory
                        promptName={prompts.selectedPrompt}
                        modelId={prompts.promptModelId}
                        revision={prompts.revision}
                        onPendingChange={setRestoring}
                        currentContent={prompts.currentContent}
                        editedContent={prompts.displayContent}
                        disabled={prompts.isPromptEditorLoading || prompts.promptContent == null}
                        hasUnsavedChanges={prompts.isDirty}
                        onCurrentVersionChanged={prompts.handleCurrentVersionChanged}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                ) : (
                  editor
                )}
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  )
}
