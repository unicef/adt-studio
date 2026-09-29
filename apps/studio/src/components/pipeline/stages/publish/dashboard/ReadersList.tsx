import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { CalendarPlus, MessageSquare } from "lucide-react"
import { RelativeTime } from "@/components/publication-feedback/RelativeTime"
import { cn } from "@/lib/utils"
import { formatPublishDate } from "../expiry-options"
import type { DashReader } from "./dashboard-data"
import { initialOf } from "./helpers"

/** Everybody who gave a name, newest first, as a grid of cards: who, when they joined, and how
 *  much they have said. The grid fills the tab however many readers there are. */
export function ReadersList({ readers }: { readers: DashReader[] }) {
  const sorted = [...readers].sort((a, b) => Date.parse(b.joinedAt) - Date.parse(a.joinedAt))

  return (
    <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 p-4">
      {sorted.map((reader) => (
        <ReaderCard key={reader.id} reader={reader} />
      ))}
    </ul>
  )
}

function ReaderCard({ reader }: { reader: DashReader }) {
  const { i18n } = useLingui()
  const commented = reader.commentCount > 0
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-background p-4 transition-shadow duration-150 hover:shadow-sm motion-reduce:transition-none motion-safe:animate-in motion-safe:fade-in-0">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          style={{ backgroundColor: reader.color }}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        >
          {initialOf(reader.name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{reader.name}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title={formatPublishDate(reader.joinedAt, i18n.locale)}>
            <CalendarPlus className="size-3 shrink-0" aria-hidden="true" />
            <Trans>
              Joined <RelativeTime iso={reader.joinedAt} />
            </Trans>
          </span>
        </span>
      </div>
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs",
          commented ? "bg-muted/60 text-foreground" : "bg-muted/30 text-muted-foreground",
        )}
      >
        <span className="flex items-center gap-1.5 font-medium tabular-nums">
          <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
          {commented ? <Plural value={reader.commentCount} one="# comment" other="# comments" /> : <Trans>No comments yet</Trans>}
        </span>
        {commented ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            <Trans>
              last <RelativeTime iso={reader.lastCommentAt ?? reader.joinedAt} />
            </Trans>
          </span>
        ) : null}
      </div>
    </li>
  )
}
