import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { publicationStateAt, type PublicationsOverview } from "@adt/types"
import { publicationsKey } from "@/hooks/use-publications"

const key = (label: string) => `adt:sharing-live:${label}`

/**
 * Whether the Sharing page should expect a live link while it is still asking — so the loader
 * takes the shape of the screen that is about to appear. It goes by what this machine saw last
 * time, then by the account's shelf if that is already cached; once the answer is in, it is
 * remembered for next time.
 */
export function useExpectsLiveLink(bookLabel: string, live: boolean | null): boolean {
  const queryClient = useQueryClient()
  const [expected] = useState(() => {
    const remembered = window.localStorage.getItem(key(bookLabel))
    if (remembered !== null) return remembered === "1"
    const shelf = queryClient.getQueryData<PublicationsOverview>(publicationsKey)
    return (shelf?.publications ?? []).some(
      (publication) => publication.book_label === bookLabel && publicationStateAt(publication) === "active",
    )
  })

  useEffect(() => {
    if (live === null) return
    window.localStorage.setItem(key(bookLabel), live ? "1" : "0")
  }, [bookLabel, live])

  return expected
}
