import { useEffect, useMemo } from "react"
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
  const expected = useMemo(() => {
    const remembered = readRemembered(bookLabel)
    if (remembered !== null) return remembered
    const shelf = queryClient.getQueryData<PublicationsOverview>(publicationsKey)
    return (shelf?.publications ?? []).some(
      (publication) => publication.book_label === bookLabel && publicationStateAt(publication) === "active",
    )
  }, [bookLabel, queryClient])

  useEffect(() => {
    if (live === null) return
    try {
      window.localStorage.setItem(key(bookLabel), live ? "1" : "0")
    } catch {
      /* Storage can be refused; the hint is only a nicer loader. */
    }
  }, [bookLabel, live])

  return expected
}

function readRemembered(bookLabel: string): boolean | null {
  try {
    const value = window.localStorage.getItem(key(bookLabel))
    return value === null ? null : value === "1"
  } catch {
    return null
  }
}
