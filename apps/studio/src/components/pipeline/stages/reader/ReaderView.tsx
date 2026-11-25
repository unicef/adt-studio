import { useEffect } from "react"
import { Trans } from "@lingui/react/macro"
import { Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/pipeline/components/LoadingState"
import { StageBlockedState } from "@/components/pipeline/components/StageBlockedState"
import { usePages } from "@/hooks/use-pages"
import { ReaderWorkspace } from "./ReaderWorkspace/ReaderWorkspace"
import { useReaderWorkspace } from "./ReaderWorkspace/use-reader-workspace"

export function ReaderView({ bookLabel }: { bookLabel: string }) {
  const { data: pages, isLoading } = usePages(bookLabel)
  const workspace = useReaderWorkspace(bookLabel)
  const dirty = Object.keys(workspace.buffers).length > 0

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  if (isLoading) return <LoadingState stageSlug="reader" label={<Trans>Loading reader...</Trans>} />
  if (!(pages ?? []).some((page) => page.hasRendering)) {
    return <StageBlockedState bookLabel={bookLabel} reason="storyboard-missing" stageLabel={<Trans>Reader</Trans>} />
  }

  const followsGlobal = workspace.tree.data?.followsGlobal
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b bg-background px-3 py-1.5 text-xs">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        {followsGlobal === false ? (
          <>
            <span><Trans>This book has its own reader. Global changes no longer reach it.</Trans></span>
            <Button size="sm" variant="outline" className="ml-auto h-7 px-2 text-xs" disabled={workspace.followGlobal.isPending} onClick={() => workspace.followGlobal.mutate()}>
              <Trans>Follow the global reader again</Trans>
            </Button>
          </>
        ) : (
          <span><Trans>This book follows the global reader. Saving a change gives it its own copy.</Trans></span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ReaderWorkspace workspace={workspace} />
      </div>
    </div>
  )
}
