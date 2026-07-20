import { useLingui, Trans, Plural } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import { ChevronDown, CheckCheck, Pencil, Send, Check, User, Clock, FolderDown, BookOpen, GitMerge, Library } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { BookCover } from "../../BookCover"
import type { CoverSpec } from "../../data"

export type PartState = "merged" | "self" | "out"

export interface RawPart {
  range: MessageDescriptor
  pages: MessageDescriptor
  span: number
  state: PartState
  when: MessageDescriptor
}
export interface RawSplit {
  title: MessageDescriptor
  authors: MessageDescriptor
  lang: MessageDescriptor
  bg: string
  fg: string
  accent: string
  pub: MessageDescriptor
  pages: number
  parts: RawPart[]
}

const CENTERED_BADGE = "min-w-[132px] justify-center gap-1 px-2 text-[10.5px]"

export interface SplitCardProps {
  bk: RawSplit
  open: boolean
  onToggle: () => void
  onMoveToLibrary: () => void
}

export function SplitCard({ bk, open, onToggle, onMoveToLibrary }: SplitCardProps) {
  const { i18n } = useLingui()

  const total = bk.parts.reduce((a, p) => a + p.span, 0)
  const sumBy = (st: PartState) => bk.parts.filter((p) => p.state === st).reduce((a, p) => a + p.span, 0)
  const mergedPages = sumBy("merged")
  const selfPages = sumBy("self")
  const outPages = total - mergedPages - selfPages
  const mergedCount = bk.parts.filter((p) => p.state === "merged").length
  const totalCount = bk.parts.length
  const outCount = bk.parts.filter((p) => p.state === "out").length
  const assembled = mergedCount === totalCount

  const cover: CoverSpec = { bg: bk.bg, fg: bk.fg, accent: bk.accent, publisherShort: i18n._(bk.pub), placeholder: false, real: true }

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted">
        <div className="h-[61px] w-[46px] shrink-0 overflow-hidden rounded-[5px] shadow-sm">
          <BookCover title={i18n._(bk.title)} author={i18n._(bk.authors)} cover={cover} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{i18n._(bk.title)}</h3>
            <Badge variant="outline" className="gap-1 px-2 text-[10.5px]">
              {i18n._(bk.lang)}
            </Badge>
            <Badge variant={assembled ? "success" : "warning"} className="gap-1 px-2 text-[10.5px]">
              {assembled ? <CheckCheck className="size-3" /> : <Clock className="size-3" />}
              {assembled ? <Trans>Assembled</Trans> : <Trans>In progress</Trans>}
            </Badge>
          </div>
          <div className="my-1 mb-2.5 text-[12.5px] text-muted-foreground">
            <Trans>
              {bk.pages} pages · split into {totalCount} parts
            </Trans>
          </div>
          <div className="flex h-2 max-w-[440px] gap-0.5 overflow-hidden rounded-full bg-muted">
            <div style={{ width: `${((mergedPages / total) * 100).toFixed(1)}%` }} className="bg-brand-600" />
            <div style={{ width: `${((selfPages / total) * 100).toFixed(1)}%` }} className="bg-brand-400" />
            <div style={{ width: `${((outPages / total) * 100).toFixed(1)}%` }} className="bg-brand-300" />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xl font-bold tabular-nums">
            {mergedCount}/{totalCount}
          </div>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <Trans>merged</Trans>
          </div>
        </div>
        <ChevronDown className={cn("size-[18px] shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div>
          {bk.parts.map((p, pi) => {
            const merged = p.state === "merged"
            const self = p.state === "self"
            const Icon = merged ? CheckCheck : self ? Pencil : Send
            const BadgeIcon = merged ? Check : self ? User : Clock
            return (
              <div key={pi} className="flex items-center gap-3.5 border-t px-5 py-3.5 hover:bg-muted">
                <div className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-semibold">{i18n._(p.range)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{i18n._(p.pages)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{i18n._(p.when)}</div>
                </div>
                <Badge variant={merged ? "success" : self ? "info" : "warning"} className={CENTERED_BADGE}>
                  <BadgeIcon className="size-3" />
                  {merged ? <Trans>Merged back</Trans> : self ? <Trans>You&apos;re on it</Trans> : <Trans>Awaiting return</Trans>}
                </Badge>
                {p.state === "out" && (
                  <Button variant="outline" size="sm" className="min-w-[150px]">
                    <FolderDown className="size-3.5" />
                    <Trans>Import returned .zip</Trans>
                  </Button>
                )}
                {merged && (
                  <Button variant="outline" size="sm" className="min-w-[150px] text-muted-foreground">
                    <BookOpen className="size-3.5" />
                    <Trans>View in book</Trans>
                  </Button>
                )}
                {self && (
                  <Button size="sm" className="min-w-[150px]">
                    <BookOpen className="size-3.5" />
                    <Trans>Open part</Trans>
                  </Button>
                )}
              </div>
            )
          })}

          {assembled ? (
            <div className="flex items-center gap-3.5 border-t border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/30">
              <CheckCheck className="size-5 text-emerald-700 dark:text-emerald-400" />
              <div className="flex-1">
                <div className="text-[13.5px] font-semibold text-emerald-800 dark:text-emerald-300">
                  <Trans>All parts merged — book assembled</Trans>
                </div>
                <div className="text-xs text-emerald-700 dark:text-emerald-400">
                  <Trans>Every page has been returned and merged back. Move it out of Split & merge into your Library.</Trans>
                </div>
              </div>
              <Button variant="outline" size="sm">
                <BookOpen className="size-3.5" />
                <Trans>Open book</Trans>
              </Button>
              <Button size="sm" onClick={onMoveToLibrary}>
                <Library className="size-3.5" />
                <Trans>Move to Library</Trans>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3.5 border-t border-brand-200 bg-brand-50 px-5 py-4">
              <GitMerge className="size-5 text-brand-700" />
              <div className="flex-1">
                <div className="text-[13.5px] font-semibold text-brand-800">
                  <Trans>
                    {mergedCount} of {totalCount} parts merged back
                  </Trans>
                </div>
                <div className="text-xs text-brand-700">
                  <Plural
                    value={outCount}
                    one="Import the # remaining part when it comes back, then merge everything into the source book."
                    other="Import the # remaining parts when they come back, then merge everything into the source book."
                  />
                </div>
              </div>
              <Button variant="outline" size="sm">
                <FolderDown className="size-3.5" />
                <Trans>Import a part .zip</Trans>
              </Button>
              <Button size="sm" disabled={outCount > 0}>
                <GitMerge className="size-3.5" />
                <Trans>Merge all parts</Trans>
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
