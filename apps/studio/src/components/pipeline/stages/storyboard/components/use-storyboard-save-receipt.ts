import { useRef, useState } from "react"
import type { StoryboardSaveResult } from "@adt/types"
import type { PageDetail } from "@/api/client"

export function applyStoryboardSave(page: PageDetail, saved: StoryboardSaveResult): PageDetail {
  return { ...page,
    sectioningTree: saved.sectioning === undefined ? page.sectioningTree : saved.sectioning,
    rendering: saved.rendering === undefined ? page.rendering : saved.rendering,
    versions: { ...page.versions,
      sectioning: saved.sectioningVersion === undefined ? page.versions.sectioning : saved.sectioningVersion,
      rendering: saved.renderingVersion === undefined ? page.versions.rendering : saved.renderingVersion,
    },
  }
}

/** Bridge only the query snapshot that preceded our acknowledgement. A fresh
 * query (including a restore to a lower version) remains authoritative. The
 * caller cancels in-flight reads before publishing this receipt to the cache. */
export function useStoryboardSaveReceipt(bookLabel: string, pageId: string, incomingPage: PageDetail) {
  const scope = JSON.stringify([bookLabel, pageId])
  const incoming = useRef({ scope, page: incomingPage })
  incoming.current = { scope, page: incomingPage }
  const [receipt, setReceipt] = useState<{ scope: string; observed: PageDetail; page: PageDetail } | null>(null)
  const page = receipt?.scope === scope && receipt.observed === incomingPage ? receipt.page : incomingPage
  const current = useRef(page)
  current.current = page
  const acknowledge = (saved: StoryboardSaveResult) => {
    if (incoming.current.scope !== scope) return
    const next = { scope, observed: incoming.current.page, page: applyStoryboardSave(current.current, saved) }
    current.current = next.page
    setReceipt(next)
  }
  return { page, current, acknowledge }
}
