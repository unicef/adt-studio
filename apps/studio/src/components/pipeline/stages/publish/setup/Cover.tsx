import { useState } from "react"
import { getBookCoverUrl } from "@/api/client"
import { cn } from "@/lib/utils"

export interface ShareBook {
  label: string
  title: string
}

/** The book's own cover, or its initials when it has none — never a broken image. */
export function Cover({ book, className }: { book: ShareBook; className?: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <span
      aria-hidden="true"
      className={cn(
        "flex aspect-[3/4] items-center justify-center rounded-md border border-dashed bg-muted text-sm font-semibold text-muted-foreground/50",
        className,
      )}
    >
      {book.title.slice(0, 2).toUpperCase()}
    </span>
  ) : (
    <img
      src={getBookCoverUrl(book.label)}
      alt=""
      onError={() => setFailed(true)}
      className={cn("rounded-md object-contain shadow-md ring-1 ring-black/5", className)}
    />
  )
}
