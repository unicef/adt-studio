import { Trans } from "@lingui/react/macro"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { cn } from "@/lib/utils"
import { EditorTabs } from "./EditorTabs"
import { FileTree } from "./FileTree"
import { ReaderPreviewPane } from "./ReaderPreviewPane"
import { SourceEditor } from "./SourceEditor"
import type { ReaderWorkspaceState } from "./use-reader-workspace"

export function ReaderWorkspace({ workspace }: { workspace: ReaderWorkspaceState }) {
  const { label, tree, previewActive } = workspace
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0">
      <ResizablePanel id="readerFiles" defaultSize="20%" minSize="200px" maxSize="35%" className="h-full border-r bg-muted/30">
        {tree.isPending ? (
          <p className="p-3 text-xs text-muted-foreground"><Trans>Loading files...</Trans></p>
        ) : tree.isError ? (
          <p role="alert" className="p-3 text-xs text-red-700">{tree.error.message}</p>
        ) : (
          <FileTree
            entries={tree.data.files}
            selected={previewActive ? null : workspace.selected}
            dirty={workspace.buffers}
            onSelect={(path) => workspace.open(path)}
          />
        )}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="readerMain" defaultSize="80%" minSize="320px" className="flex h-full min-h-0 flex-col">
        <EditorTabs workspace={workspace} />
        <div className="relative min-h-0 flex-1">
          {label && (
            <div className={cn("absolute inset-0", !previewActive && "hidden")}>
              <ReaderPreviewPane workspace={workspace} label={label} />
            </div>
          )}
          <div className={cn("absolute inset-0", previewActive && "hidden")}>
            <SourceEditor workspace={workspace} />
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
