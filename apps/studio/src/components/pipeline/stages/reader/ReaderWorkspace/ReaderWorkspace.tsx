import { Trans } from "@lingui/react/macro"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { FileTree } from "./FileTree"
import { ReaderPreviewPane } from "./ReaderPreviewPane"
import { SourceEditor } from "./SourceEditor"
import type { ReaderWorkspaceState } from "./use-reader-workspace"

export function ReaderWorkspace({ workspace }: { workspace: ReaderWorkspaceState }) {
  const { label, tree } = workspace
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0">
      <ResizablePanel id="readerFiles" defaultSize="18%" minSize="180px" maxSize="35%" className="h-full border-r bg-muted/20">
        {tree.isPending ? (
          <p className="p-3 text-xs text-muted-foreground"><Trans>Loading files...</Trans></p>
        ) : tree.isError ? (
          <p role="alert" className="p-3 text-xs text-red-700">{tree.error.message}</p>
        ) : (
          <FileTree entries={tree.data.files} selected={workspace.selected} dirty={workspace.buffers} onSelect={(path) => workspace.open(path)} />
        )}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="readerEditor" defaultSize={label ? "44%" : "82%"} minSize="280px" className="h-full">
        <SourceEditor workspace={workspace} />
      </ResizablePanel>
      {label && (
        <>
          <ResizableHandle />
          <ResizablePanel id="readerPreview" defaultSize="38%" minSize="280px" className="h-full">
            <ReaderPreviewPane workspace={workspace} label={label} />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}
