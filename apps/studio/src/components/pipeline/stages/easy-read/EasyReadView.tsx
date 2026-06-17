import { useQuery } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import { useBookRun } from "@/hooks/use-book-run"
import { StageRunCard } from "../../components/StageRunCard"
import { StageContentGuard } from "../../components/StageContentGuard"
import { EasyReadEditor } from "./EasyReadEditor"
import { useRunEasyRead } from "./use-run-easy-read"

export function EasyReadView({
  bookLabel,
  selectedPageId,
  onSelectPage,
}: {
  bookLabel: string
  selectedPageId?: string
  onSelectPage?: (pageId: string | null) => void
}) {
  const { t } = useLingui()
  const { runEasyRead, hasApiKey, isRunning } = useRunEasyRead(bookLabel)
  const { stageState } = useBookRun()
  const status = stageState("easy-read")
  const isDone = status === "done"
  const isStageRunning = status === "running" || status === "queued"
  const showRunCard = !isDone || isStageRunning

  const { data, isLoading } = useQuery({
    queryKey: ["books", bookLabel, "easy-read"],
    queryFn: () => api.getEasyRead(bookLabel),
    enabled: !!bookLabel,
  })
  const hasBlocks = (data?.blocks?.length ?? 0) > 0

  return (
    <StageContentGuard
      stageSlug="easy-read"
      isLoading={!showRunCard && isLoading}
      loadingLabel={t`Loading Easy Read...`}
      showRunCard={showRunCard || !hasBlocks}
      runCard={
        <StageRunCard
          stageSlug="easy-read"
          isRunning={isStageRunning}
          completed={isDone}
          onRun={() => void runEasyRead()}
          disabled={!hasApiKey || isRunning}
        />
      }
    >
      <EasyReadEditor
        bookLabel={bookLabel}
        selectedPageId={selectedPageId}
        onSelectPage={onSelectPage}
        isRunning={isRunning || isStageRunning}
        hasApiKey={hasApiKey}
        onRegenerate={() => void runEasyRead()}
      />
    </StageContentGuard>
  )
}
