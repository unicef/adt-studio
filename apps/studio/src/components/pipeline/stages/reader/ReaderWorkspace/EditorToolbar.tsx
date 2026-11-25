import { Trans, useLingui } from "@lingui/react/macro"
import { useQuery } from "@tanstack/react-query"
import { GitCompare, History, RotateCcw, Save, Undo2 } from "lucide-react"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ReaderWorkspaceState } from "./use-reader-workspace"

interface EditorToolbarProps {
  workspace: ReaderWorkspaceState
  comparing: boolean
  onCompareChange: (comparing: boolean) => void
}

function VersionHistory({ workspace }: { workspace: ReaderWorkspaceState }) {
  const path = workspace.selected ?? ""
  const history = useQuery({
    queryKey: [...workspace.key, "history", path],
    queryFn: () => api.readerSourceHistory(workspace.prefix, path),
  })
  const versions = [...(history.data?.versions ?? [])].reverse()
  if (history.isPending) {
    return <p className="text-xs text-muted-foreground"><Trans>Loading history...</Trans></p>
  }
  if (versions.length === 0) {
    return <p className="text-xs text-muted-foreground"><Trans>No saved versions yet.</Trans></p>
  }
  return (
    <ul className="max-h-64 space-y-1 overflow-y-auto">
      {versions.map((entry, index) => (
        <li key={entry.version} className="flex items-center justify-between gap-2 text-xs">
          <span>
            <Trans>Version {entry.version}</Trans>
            {entry.deleted && <span className="ml-1 text-muted-foreground"><Trans>(reverted)</Trans></span>}
            {index === 0 && <span className="ml-1 text-muted-foreground"><Trans>(current)</Trans></span>}
          </span>
          {index > 0 && !entry.deleted && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={workspace.restore.isPending} onClick={() => workspace.restore.mutate({ path, version: entry.version })}>
              <Trans>Restore</Trans>
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function EditorToolbar({ workspace, comparing, onCompareChange }: EditorToolbarProps) {
  const { t } = useLingui()
  const path = workspace.selected ?? ""
  const dirty = path in workspace.buffers
  const layer = workspace.file.data?.layer
  const canRevert = layer === "book" || (workspace.label === null && layer === "global")
  const followingGlobal = workspace.label !== null && workspace.tree.data?.followsGlobal

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1">
      <span className="mr-auto truncate font-mono text-xs" title={path}>
        {path}
        {workspace.file.data?.outdated && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] text-amber-800">
            <Trans>Default changed since customized</Trans>
          </span>
        )}
      </span>
      <Button size="sm" variant={comparing ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => onCompareChange(!comparing)} title={t`Compare with the default version`}>
        <GitCompare className="h-3.5 w-3.5" />
        <Trans>Compare</Trans>
      </Button>
      {!followingGlobal && (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <History className="h-3.5 w-3.5" />
              <Trans>History</Trans>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <VersionHistory workspace={workspace} />
          </PopoverContent>
        </Popover>
      )}
      {canRevert && !dirty && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={workspace.revert.isPending} onClick={() => workspace.revert.mutate(path)} title={t`Go back to the default version of this file`}>
          <RotateCcw className="h-3.5 w-3.5" />
          <Trans>Revert to default</Trans>
        </Button>
      )}
      {dirty && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={workspace.discard}>
          <Undo2 className="h-3.5 w-3.5" />
          <Trans>Discard</Trans>
        </Button>
      )}
      <Button size="sm" className="h-7 px-2 text-xs" disabled={!dirty || workspace.save.isPending} onClick={() => workspace.save.mutate(path)}>
        <Save className="h-3.5 w-3.5" />
        <Trans>Save</Trans>
      </Button>
    </div>
  )
}
