import { MessagesSquare, Search } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type Sort = "recent" | "feedback" | "size" | "title"

export interface Query {
  search: string
  sort: Sort
  unresolvedOnly: boolean
}

export const EMPTY_QUERY: Query = { search: "", sort: "recent", unresolvedOnly: false }

/**
 * Search, sort, and the one filter worth a control of its own.
 *
 * There is no all/live/stopped switch: every card states its own status, so a tab strip would
 * hide two thirds of the shelf to answer a question the shelf already answers. There is no
 * "showing N of M" either — the grid is the count.
 */
export function PublicationsToolbar({
  query,
  onQuery,
}: {
  query: Query
  onQuery: (next: Query) => void
}) {
  const { t } = useLingui()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={query.search}
        onChange={(event) => onQuery({ ...query, search: event.target.value })}
        placeholder={t`Search by title`}
        aria-label={t`Search shared books`}
        prependIcon={<Search className="size-4" aria-hidden="true" />}
        wrapperClassName="h-9 min-w-48 flex-1"
        className="h-9 text-sm"
      />

      <Select value={query.sort} onValueChange={(sort) => onQuery({ ...query, sort: sort as Sort })}>
        <SelectTrigger className="h-9 w-44 text-xs" aria-label={t`Sort shared books`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">{t`Recently updated`}</SelectItem>
          <SelectItem value="feedback">{t`Most open feedback`}</SelectItem>
          <SelectItem value="size">{t`Largest first`}</SelectItem>
          <SelectItem value="title">{t`Title A–Z`}</SelectItem>
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant={query.unresolvedOnly ? "secondary" : "outline"}
        size="sm"
        aria-pressed={query.unresolvedOnly}
        onClick={() => onQuery({ ...query, unresolvedOnly: !query.unresolvedOnly })}
        className="h-9 gap-1.5 text-xs"
      >
        <MessagesSquare className="size-3.5" aria-hidden="true" />
        <Trans>Only with open feedback</Trans>
      </Button>
    </div>
  )
}
