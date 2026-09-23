import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { formatPublishDate } from "../expiry-options"
import type { DashReader } from "./dashboard-data"
import { initialOf } from "./helpers"

/** Everybody who gave a name, newest first, with how much each of them has said. */
export function ReadersList({ readers }: { readers: DashReader[] }) {
  const { i18n } = useLingui()
  const sorted = [...readers].sort((a, b) => Date.parse(b.joinedAt) - Date.parse(a.joinedAt))

  return (
    <ul className="flex list-none flex-col divide-y p-0">
      {sorted.map((reader) => (
        <li key={reader.id} className="flex items-center gap-2.5 px-4 py-2">
          <span
            aria-hidden="true"
            style={{ backgroundColor: reader.color }}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          >
            {initialOf(reader.name)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-xs font-medium text-foreground">{reader.name}</span>
            <span className="text-[11px] text-muted-foreground">
              <Trans>Joined {formatPublishDate(reader.joinedAt, i18n.locale)}</Trans>
            </span>
          </span>
          <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
            {reader.commentCount === 0 ? (
              <Trans>No comments</Trans>
            ) : (
              <>
                <Plural value={reader.commentCount} one="# comment" other="# comments" />
                <span className="block text-[10.5px] text-muted-foreground/80">
                  <Trans>last {formatPublishDate(reader.lastCommentAt ?? reader.joinedAt, i18n.locale)}</Trans>
                </span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
