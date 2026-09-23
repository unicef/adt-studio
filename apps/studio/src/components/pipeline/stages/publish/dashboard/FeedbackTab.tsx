import { Trans } from "@lingui/react/macro"
import { MessageSquareText } from "lucide-react"
import type { DashboardData } from "./dashboard-data"
import { FeedbackActions, FeedbackComment } from "./FeedbackThread"
import { FeedbackList } from "./FeedbackList"
import { PanelEmpty, DashboardPanel, SkeletonRows } from "./DashboardPanel"
import {
  FeedbackDetailLoading,
  FeedbackFilters,
  FeedbackListEmpty,
  FeedbackUnavailable,
  OpenPageLink,
  PageSheet,
  ReplyComposer,
} from "./FeedbackParts"
import { useFeedbackWorkspace } from "./use-feedback-workspace"

/**
 * The Feedback tab: two panels, like the overview. The list stays on the left; the right panel
 * sets the page and the conversation side by side, so the author reads the comment with the page
 * in view and answers in place — feedback can't be answered without seeing the page. The
 * Storyboard is still one click away for when the answer is a change to the page.
 */
export function FeedbackTab({ data }: { data: DashboardData }) {
  const ws = useFeedbackWorkspace(data)
  if (data.status === "error") return <FeedbackUnavailable />
  const bookLabel = data.link.bookLabel
  const selected = ws.selected
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(250px,0.72fr)_minmax(0,2fr)] gap-4">
      <DashboardPanel title={<Trans>Feedback</Trans>} count={data.status === "ready" ? ws.waitingNow : undefined} tone="attention">
        <div className="flex h-full flex-col">
          <FeedbackFilters ws={ws} />
          {data.status === "loading" ? (
            <SkeletonRows rows={6} />
          ) : ws.list.length === 0 ? (
            <FeedbackListEmpty ws={ws} />
          ) : (
            <FeedbackList threads={ws.list} sort={ws.sort} selectedId={selected?.id ?? null} heldIds={ws.held} onSelect={ws.setSelectedId} />
          )}
        </div>
      </DashboardPanel>

      {ws.loading ? (
        <FeedbackDetailLoading />
      ) : selected ? (
        <DashboardPanel
          title={selected.pageLabel}
          action={<OpenPageLink bookLabel={bookLabel} thread={selected} />}
          footer={
            <FeedbackActions
              bookLabel={bookLabel}
              thread={selected}
              held={ws.held.has(selected.id)}
              resolveFailed={ws.failed.has(selected.id)}
              onResolve={() => ws.hold(selected.id)}
              onUndo={() => ws.undo(selected.id)}
              onReopen={() => data.resolve(selected.id, false)}
              onNext={ws.nextWaiting ? () => ws.setSelectedId(ws.nextWaiting!.id) : null}
            />
          }
        >
          <div className="@container h-full min-h-0">
          <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @4xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <PageSheet bookLabel={bookLabel} ws={ws} className="border-r" />
            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                <FeedbackComment thread={selected} held={ws.held.has(selected.id)} liveVersion={data.link.liveVersion} location={ws.locations.get(selected.id)} />
              </div>
              <div className="shrink-0 border-t p-3">
                <ReplyComposer key={selected.id} data={data} thread={selected} drafts={ws.drafts} />
              </div>
            </div>
          </div>
          </div>
        </DashboardPanel>
      ) : (
        <DashboardPanel title={<Trans>The page</Trans>}>
          <PanelEmpty
            icon={<MessageSquareText className="size-5" aria-hidden="true" />}
            title={ws.list.length === 0 ? <Trans>Nothing to open here</Trans> : <Trans>Pick a comment to answer it</Trans>}
            body={
              ws.list.length === 0 ? (
                <Trans>A comment you pick opens here, next to its page.</Trans>
              ) : (
                <Trans>Its page on one side, the conversation and a reply box on the other.</Trans>
              )
            }
          />
        </DashboardPanel>
      )}
    </div>
  )
}
