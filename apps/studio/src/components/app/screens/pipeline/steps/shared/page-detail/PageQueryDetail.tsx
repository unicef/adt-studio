import type { ReactNode } from "react"
import { PageDetailFrame, type PageDetailFrameProps } from "./PageDetailFrame"
import { pageDetailState, refreshFailed, type PageQueryState } from "./pageDetailState"
import { PageRefreshFailed } from "./PageNotices"

export function PageQueryDetail({
  query,
  empty,
  children,
  notice,
  ...frame
}: Omit<PageDetailFrameProps, "state" | "onRetry" | "children"> & {
  query: PageQueryState
  empty: boolean
  children: ReactNode
}) {
  const retry = () => void query.refetch()
  return (
    <PageDetailFrame
      {...frame}
      state={pageDetailState(query, empty)}
      onRetry={retry}
      notice={
        <>
          {refreshFailed(query) && <PageRefreshFailed pageNumber={frame.pageNumber} onRetry={retry} />}
          {notice}
        </>
      }
    >
      {children}
    </PageDetailFrame>
  )
}
