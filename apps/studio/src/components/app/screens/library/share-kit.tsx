import { useLingui } from "@lingui/react/macro"
import { toast } from "@/components/ui/sonner"
import type { DetailBook } from "./BookDetailDialog"

export type Publication = NonNullable<DetailBook["publication"]>

export function shareState(publication: Publication) {
  const live = publication.state !== "expired" && publication.state !== "revoked"
  return { live, stopped: publication.state === "revoked", expired: publication.state === "expired" }
}

/** Clipboard writes fail on an insecure origin and in an unfocused window, so every copy says
 *  how it went rather than failing silently. */
export function useCopy() {
  const { t } = useLingui()
  return async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(done)
    } catch {
      toast.error(t`Couldn't copy — open the book's Sharing step and copy it there.`)
    }
  }
}
