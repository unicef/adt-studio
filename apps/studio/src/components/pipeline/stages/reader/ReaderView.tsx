import { useEffect } from "react"
import { createPortal } from "react-dom"
import { Trans } from "@lingui/react/macro"
import { StageBlockedState } from "@/components/pipeline/components/StageBlockedState"
import { LoadingState } from "@/components/pipeline/components/LoadingState"
import { useStepHeader } from "@/components/pipeline/components/StepViewRouter"
import { useAllPagesPruned } from "@/hooks/use-all-pages-pruned"
import { usePages } from "@/hooks/use-pages"
import { useDeviceView } from "../storyboard/components/style-editor/device-breakpoint"
import { useReaderUiDraft } from "./hooks/use-reader-ui-draft"
import { useReaderPreview } from "./hooks/use-reader-preview"
import { HeaderControls } from "./components/HeaderControls"
import { ReaderInspector } from "./components/ReaderInspector"

/**
 * The Reader step: design the reader chrome (adt-runtime) for this book —
 * shadcn colour tokens, radius, typeface, dock position and panel layout —
 * against a live preview of the packaged book. Sits before Preview; whatever
 * is saved here is what Preview, Sharing and Export package.
 */
export function ReaderView({ bookLabel }: { bookLabel: string }) {
  const { data: pages, isLoading: pagesLoading } = usePages(bookLabel)
  const { allPruned, isLoading: prunedLoading } = useAllPagesPruned(bookLabel)
  const hasRendering = (pages ?? []).some((page) => page.hasRendering)
  const draft = useReaderUiDraft(bookLabel)
  const preview = useReaderPreview(bookLabel, draft.value, hasRendering && !allPruned)
  // eslint-disable-next-line lingui/no-unlocalized-strings -- storage scope key, not UI copy
  const [device, setDevice] = useDeviceView(`${bookLabel}:reader`, "desktop")
  const { headerSlotEl } = useStepHeader()

  // Leaving with unsaved edits would silently drop them.
  useEffect(() => {
    if (!draft.dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [draft.dirty])

  if (pagesLoading || prunedLoading || draft.isLoading) {
    return <LoadingState stageSlug="reader" label={<Trans>Loading reader settings...</Trans>} />
  }
  if (!hasRendering) {
    return <StageBlockedState bookLabel={bookLabel} reason="storyboard-missing" stageLabel={<Trans>Reader</Trans>} />
  }
  if (allPruned) {
    return <StageBlockedState bookLabel={bookLabel} reason="all-pruned" stageLabel={<Trans>Reader</Trans>} />
  }

  return (
    <div className="h-full min-h-0">
      {headerSlotEl
        ? createPortal(
            <HeaderControls device={device} onDeviceChange={setDevice} />,
            headerSlotEl,
          )
        : null}
      <ReaderInspector draft={draft} preview={preview} device={device} />
    </div>
  )
}
