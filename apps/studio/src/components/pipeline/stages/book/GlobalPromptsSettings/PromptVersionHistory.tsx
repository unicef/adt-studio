import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, GitCompare } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { PromptResponse, PromptVersionSummary } from "@/api/client"
import { api } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { Trans, useLingui } from "@lingui/react/macro"
import { buildPromptLineDiff, type PromptDiffRow } from "./promptVersionDiff"

// eslint-disable-next-line lingui/no-unlocalized-strings -- Internal selection key, not user-visible copy.
const UNSAVED_VERSION_KEY = "__unsaved__"

type PromptVersionHistoryProps = {
  promptName: string
  bookLabel?: string
  modelId: string | null
  currentContent: string
  editedContent: string
  disabled: boolean
  hasUnsavedChanges: boolean
  className?: string
  onCurrentVersionChanged: (
    promptName: string,
    modelId: string | null,
    prompt: PromptResponse,
  ) => Promise<void> | void
}

type ActivatePromptVersionVariables = {
  promptName: string
  bookLabel?: string
  modelId: string | null
  version: string
}

export function PromptVersionHistory({
  promptName,
  bookLabel,
  modelId,
  currentContent,
  editedContent,
  disabled,
  hasUnsavedChanges,
  className,
  onCurrentVersionChanged,
}: PromptVersionHistoryProps) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [selectedVersionName, setSelectedVersionName] = useState<string | null>(null)

  const versionsQuery = useQuery({
    queryKey: ["prompt-versions", promptName, modelId, bookLabel],
    queryFn: () => api.listPromptVersions(promptName, modelId, bookLabel),
    enabled: !disabled && promptName.length > 0,
  })

  const versions = versionsQuery.data?.versions ?? []
  const baselineContent = versionsQuery.data?.fallbackContent ?? currentContent
  const isUnsavedSelected = hasUnsavedChanges && selectedVersionName === UNSAVED_VERSION_KEY
  const selectedVersion = useMemo(
    () => versions.find((version) => version.version === selectedVersionName) ?? versions[0] ?? null,
    [selectedVersionName, versions],
  )
  const selectedContent = isUnsavedSelected
    ? editedContent
    : selectedVersion?.content ?? currentContent
  const diffRows = useMemo(
    () => buildPromptLineDiff(baselineContent, selectedContent),
    [baselineContent, selectedContent],
  )
  const hasDiff = diffRows.some((row) => row.kind !== "unchanged")

  useEffect(() => {
    if (hasUnsavedChanges) {
      setSelectedVersionName(UNSAVED_VERSION_KEY)
      return
    }
    setSelectedVersionName(versionsQuery.data?.currentVersion ?? versions[0]?.version ?? null)
  }, [hasUnsavedChanges, promptName, modelId, versionsQuery.data?.currentVersion, versions])

  const activateMutation = useMutation({
    mutationFn: ({ promptName, bookLabel, modelId, version }: ActivatePromptVersionVariables) =>
      api.setPromptVersionCurrent(promptName, version, modelId, bookLabel),
    onSuccess: async (prompt, variables) => {
      await onCurrentVersionChanged(variables.promptName, variables.modelId, prompt)
      await queryClient.invalidateQueries({
        queryKey: ["prompt-versions", variables.promptName, variables.modelId, variables.bookLabel],
      })
      toast.success(t`Prompt version selected.`)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t`Unable to select prompt version.`,
      )
    },
  })

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      {versionsQuery.isLoading ? (
        <PromptVersionHistorySkeleton />
      ) : versions.length === 0 && !hasUnsavedChanges ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
          <Trans>No saved prompt versions yet.</Trans>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
              <GitCompare className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                <Trans>Diff against fallback</Trans>
              </span>
              {isUnsavedSelected ? (
                <Badge variant="outline" className="h-5 rounded-full px-2 text-[11px]">
                  <Trans>Unsaved changes</Trans>
                </Badge>
              ) : selectedVersion?.isCurrent ? (
                <Badge variant="secondary" className="h-5 rounded-full px-2 text-[11px]">
                  <Trans>Current</Trans>
                </Badge>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto h-7"
                disabled={
                  !selectedVersion
                  || isUnsavedSelected
                  || selectedVersion.isCurrent
                  || activateMutation.isPending
                  || hasUnsavedChanges
                }
                onClick={() => {
                  if (selectedVersion) {
                    activateMutation.mutate({
                      promptName,
                      bookLabel,
                      modelId,
                      version: selectedVersion.version,
                    })
                  }
                }}
              >
                <CheckCircle2 className="size-3.5" />
                <Trans>Use as current</Trans>
              </Button>
            </div>

            {!hasDiff ? (
              <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
                <Trans>No differences from the fallback prompt.</Trans>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto bg-background">
                <div className="min-w-max py-2 font-mono text-xs">
                  {diffRows.map((row, index) => (
                    <DiffLine key={`${row.kind}-${index}`} row={row} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-60 shrink-0 overflow-y-auto border-l p-2">
            <div className="flex flex-col gap-1">
              {hasUnsavedChanges ? (
                <UnsavedVersionListItem
                  selected={isUnsavedSelected}
                  onSelect={() => setSelectedVersionName(UNSAVED_VERSION_KEY)}
                />
              ) : null}
              {versions.map((version) => (
                <VersionListItem
                  key={version.version}
                  version={version}
                  selected={selectedVersion?.version === version.version}
                  onSelect={() => setSelectedVersionName(version.version)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function VersionListItem({
  version,
  selected,
  onSelect,
}: {
  version: PromptVersionSummary
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground",
      )}
      onClick={onSelect}
    >
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="truncate font-medium text-foreground">
          {formatVersionDate(version.createdAt)}
        </span>
        {version.isCurrent ? (
          <Badge variant="secondary" className="ml-auto h-5 shrink-0 rounded-full px-2 text-[11px]">
            <Trans>Current</Trans>
          </Badge>
        ) : null}
      </span>
      <span className="block max-w-full truncate font-mono text-[11px]">
        {version.version}
      </span>
    </button>
  )
}

function UnsavedVersionListItem({
  selected,
  onSelect,
}: {
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full min-w-0 flex-col gap-1 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground",
      )}
      onClick={onSelect}
    >
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="truncate font-medium text-foreground">
          <Trans>Unsaved changes</Trans>
        </span>
        <Badge variant="outline" className="ml-auto h-5 shrink-0 rounded-full px-2 text-[11px]">
          <Trans>Draft</Trans>
        </Badge>
      </span>
      <span className="block max-w-full truncate text-[11px]">
        <Trans>Compared with fallback prompt.</Trans>
      </span>
    </button>
  )
}

function DiffLine({ row }: { row: PromptDiffRow }) {
  const marker = row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " "
  const lineNumber = row.kind === "removed" ? row.oldLineNumber : row.newLineNumber

  return (
    <div
      className={cn(
        "grid grid-cols-[4rem_1.5rem_minmax(40rem,1fr)] px-3 leading-5",
        row.kind === "added" && "bg-emerald-50 text-emerald-950",
        row.kind === "removed" && "bg-rose-50 text-rose-950",
      )}
    >
      <span className="select-none pr-3 text-right text-muted-foreground">
        {lineNumber ?? ""}
      </span>
      <span className="select-none text-center text-muted-foreground">{marker}</span>
      <pre className="m-0 min-w-0 whitespace-pre-wrap break-words font-mono">
        {row.value || " "}
      </pre>
    </div>
  )
}

function PromptVersionHistorySkeleton() {
  return (
    <div className="flex min-h-0 flex-1" aria-hidden="true">
      <div className="min-w-0 flex-1 p-3">
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-3 animate-pulse rounded-sm bg-muted-foreground/10" />
          ))}
        </div>
      </div>
      <div className="w-60 shrink-0 border-l p-2">
        <div className="flex flex-col gap-1">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-md px-2 py-2">
              <div className="h-3 w-40 animate-pulse rounded-sm bg-muted-foreground/15" />
              <div className="mt-2 h-2.5 w-52 animate-pulse rounded-sm bg-muted-foreground/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatVersionDate(createdAt: string | null): string {
  if (!createdAt) return ""
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return createdAt
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date)
}
