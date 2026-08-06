import { useState } from "react"
import { BookLock, BookOpen } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { getBookCoverUrl } from "@/api/client"

interface PublicationCoverProps {
  label: string
  title: string
  /** A book that is no longer on this machine has no cover to serve: the API answers `404`
   *  and the placeholder is the honest picture, so the request is not made at all. */
  bookExists: boolean
}

/**
 * The book's own first page, straight from the local book directory.
 *
 * The published snapshot in R2 carries a copy of the same image, but reaching for that one
 * would mean a network round trip per row *and* a hole in the access-code gate, so a
 * publication whose book has left this computer gets the placeholder instead.
 */
export function PublicationCover({ label, title, bookExists }: PublicationCoverProps) {
  const { t } = useLingui()
  const [failed, setFailed] = useState(false)
  const showCover = bookExists && !failed
  const Placeholder = bookExists ? BookOpen : BookLock

  return (
    <div className="flex h-20 w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted mh:h-16 mh:w-[44px]">
      {showCover ? (
        <img
          src={getBookCoverUrl(label)}
          alt={t`Cover of ${title}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover object-top duration-300 motion-safe:animate-in motion-safe:fade-in-0"
        />
      ) : (
        <Placeholder className="size-5 text-muted-foreground/70" aria-hidden="true" />
      )}
    </div>
  )
}
