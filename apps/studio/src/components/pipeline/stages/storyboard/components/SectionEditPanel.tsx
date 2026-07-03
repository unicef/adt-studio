import { useState, type ReactNode } from "react"
import { ImagePlus, Loader2, RefreshCw, X } from "lucide-react"
import { SectionActionsDropdown } from "./SectionActionsDropdown"
import { SectionTreeEditor } from "@/components/section-tree-editor/SectionTreeEditor"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PageSectioningSection } from "@adt/types"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import {
  getSectionTypeLabel,
  getSectionTypeDescription,
} from "@/lib/section-constants"

function getSectionTypeDisplayLabel(value: string): string {
  return getSectionTypeLabel(value) || value.replace(/_/g, " ")
}

function getSectionTypeDisplayDescription(
  value: string,
  configDesc: string
): string {
  return getSectionTypeDescription(value) ?? configDesc
}

interface SectionEditPanelProps {
  open: boolean
  onClose: () => void
  section: PageSectioningSection
  sectionIndex: number
  sectionCount: number
  bookLabel: string
  sectionTypes?: Record<string, string>
  textTypes?: Record<string, string>
  groupTypes?: Record<string, string>
  activityAnswers?: Record<string, string | boolean | number>
  onChangeSectionType: (type: string) => void
  onToggleSectionPruned: () => void
  onSectionChange: (next: PageSectioningSection) => void
  onLeafTextEdited: (nodeId: string, text: string) => void
  onLeafDuplicated: (sourceNodeId: string, newNodeId: string) => void
  onLeafDeleted: (nodeId: string) => void
  onStructuralChange: () => void
  onMergeSection: (dir: "prev" | "next") => void
  onMergeCrossPage?: (dir: "prev" | "next") => void
  hasPrevPage?: boolean
  hasNextPage?: boolean
  onCloneSection: () => void
  onDeleteSection: () => void
  onRerender: (prompt?: string) => void
  onAddImage: () => void
  onUpdateAnswer: (itemKey: string, value: string) => void
  versionPickerNode: ReactNode
  pipelineRunning?: boolean
  merging: boolean
  cloning: boolean
  deleting: boolean
  saving: boolean
  rerendering: boolean
  dirty: boolean
  renderingDirty: boolean
  hasApiKey: boolean
}

export function SectionEditPanel({
  open,
  onClose,
  section,
  sectionIndex,
  sectionCount,
  bookLabel,
  sectionTypes,
  textTypes,
  groupTypes,
  activityAnswers,
  onChangeSectionType,
  onToggleSectionPruned,
  onSectionChange,
  onLeafTextEdited,
  onLeafDuplicated,
  onLeafDeleted,
  onStructuralChange,
  onMergeSection,
  onMergeCrossPage,
  hasPrevPage,
  hasNextPage,
  onCloneSection,
  onDeleteSection,
  onRerender,
  onAddImage,
  onUpdateAnswer,
  versionPickerNode,
  pipelineRunning,
  merging,
  cloning,
  deleting,
  saving,
  rerendering,
  dirty,
  renderingDirty,
  hasApiKey,
}: SectionEditPanelProps) {
  const { t } = useLingui()
  const [rerenderOpen, setRerenderOpen] = useState(false)
  const [rerenderPrompt, setRerenderPrompt] = useState("")

  return (
    <div
      className={`absolute top-0 right-0 h-full w-[480px] flex flex-col bg-background border-l shadow-lg transition-transform duration-200 ease-in-out z-30 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Panel header */}
      <div className="border-b">
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wider">{t`Content`}</span>
          {sectionTypes ? (
            <Select
              value={section.sectionType}
              onValueChange={onChangeSectionType}
              disabled={pipelineRunning}
            >
              <SelectTrigger className="h-6 text-[10px] font-medium px-1.5 py-0 w-auto min-w-[80px] border-0 bg-muted/50">
                <SelectValue>
                  {getSectionTypeDisplayLabel(section.sectionType)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sectionTypes).map(([key, desc]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {getSectionTypeDisplayLabel(key)}
                    <span className="ml-1 text-muted-foreground text-[10px]">
                      {getSectionTypeDisplayDescription(key, desc)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="font-medium">
              {getSectionTypeDisplayLabel(section.sectionType)}
            </span>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRerenderOpen(!rerenderOpen)}
              disabled={
                rerendering ||
                pipelineRunning ||
                dirty ||
                renderingDirty ||
                saving ||
                !hasApiKey
              }
              className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
              title={
                pipelineRunning
                  ? t`Wait for storyboard to complete`
                  : !hasApiKey
                    ? t`API key required to re-render`
                    : dirty
                      ? t`Save changes before re-rendering`
                      : renderingDirty
                        ? t`Re-render (your edits will be preserved)`
                        : t`Re-render this section`
              }
            >
              {rerendering ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-blue-600" />
              )}
            </button>
            {rerenderOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-lg border bg-popover p-3 shadow-lg">
                <p className="text-xs font-medium mb-2">{t`Re-render section`}</p>
                <textarea
                  value={rerenderPrompt}
                  onChange={(e) => setRerenderPrompt(e.target.value)}
                  placeholder={t`Optional instructions for the LLM...`}
                  className="w-full text-xs rounded border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={3}
                />
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRerenderOpen(false)
                      setRerenderPrompt("")
                    }}
                    className="text-xs px-2 py-1 rounded hover:bg-accent transition-colors cursor-pointer"
                  >
                    {t`Cancel`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onRerender(rerenderPrompt.trim() || undefined)
                      setRerenderOpen(false)
                      setRerenderPrompt("")
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
                  >
                    {t`Re-render`}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <SectionActionsDropdown
              sectionIndex={sectionIndex}
              sectionCount={sectionCount}
              isPruned={section.isPruned}
              hasPrevPage={hasPrevPage}
              hasNextPage={hasNextPage}
              onTogglePrune={onToggleSectionPruned}
              onMerge={onMergeSection}
              onMergeCrossPage={onMergeCrossPage}
              onClone={onCloneSection}
              onDelete={onDeleteSection}
              disabled={
                merging ||
                cloning ||
                deleting ||
                dirty ||
                renderingDirty ||
                saving ||
                !!pipelineRunning
              }
            />
            {versionPickerNode}
            <button
              type="button"
              onClick={onClose}
              className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {!section.isPruned && (
          <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground border-t">
            <span className="font-medium uppercase tracking-wider">{t`Page`}</span>
            <span
              className="w-3.5 h-3.5 rounded border"
              style={{ backgroundColor: section.backgroundColor }}
              title={t`Background: ${section.backgroundColor}`}
            />
            <span className="text-[10px]">{section.backgroundColor}</span>
            <span
              className="w-3.5 h-3.5 rounded border ml-2"
              style={{ backgroundColor: section.textColor }}
              title={t`Text color: ${section.textColor}`}
            />
            <span className="text-[10px]">{section.textColor}</span>
          </div>
        )}
      </div>

      {pipelineRunning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 border-b text-xs text-violet-700">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          {t`Editing is disabled while the storyboard is running`}
        </div>
      )}

      <div className="overflow-auto flex-1 px-4 py-3 space-y-5">
        <SectionTreeEditor
          section={section}
          onChange={onSectionChange}
          bookLabel={bookLabel}
          textRoles={textTypes}
          containerStructures={groupTypes}
          disabled={!!pipelineRunning || saving}
          onLeafTextEdited={onLeafTextEdited}
          onLeafDuplicated={onLeafDuplicated}
          onLeafDeleted={onLeafDeleted}
          onStructuralChange={onStructuralChange}
        />

        {activityAnswers && Object.keys(activityAnswers).length > 0 && (
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {t`Answers`}
            </h3>
            <div className="space-y-1.5">
              {Object.entries(activityAnswers)
                .sort(([a], [b]) => {
                  const numA = parseInt(a.replace(/\D/g, ""), 10) || 0
                  const numB = parseInt(b.replace(/\D/g, ""), 10) || 0
                  return numA - numB
                })
                .map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 px-3 py-1.5 rounded border bg-amber-50/60"
                  >
                    <span className="shrink-0 text-[10px] font-medium text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                      {key}
                    </span>
                    <input
                      type="text"
                      value={String(value)}
                      onChange={(e) => onUpdateAnswer(key, e.target.value)}
                      disabled={pipelineRunning}
                      className="flex-1 min-w-0 text-xs rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-border hover:bg-white focus:border-ring focus:bg-white focus:outline-none focus:ring-1 focus:ring-ring transition-colors disabled:opacity-50 disabled:cursor-default"
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={onAddImage}
            disabled={pipelineRunning}
            className={cn(
              "flex items-center justify-center gap-1.5 w-full rounded border border-dashed py-3 text-xs transition-colors",
              pipelineRunning
                ? "border-muted-foreground/20 text-muted-foreground/50 cursor-default"
                : "border-muted-foreground/30 hover:border-muted-foreground/60 text-muted-foreground hover:text-foreground cursor-pointer"
            )}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {t`Add Image`}
          </button>
        </div>
      </div>
    </div>
  )
}
