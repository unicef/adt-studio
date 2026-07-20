import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Scissors, Pencil, BookOpen, FolderUp, Puzzle, CircleDashed, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BookCover } from "../BookCover"
import { Pager } from "../ui/Pager"
import { SplitCard, type RawSplit } from "./handoffs/SplitCard"

const SPLITS: RawSplit[] = [
  {
    title: msg`World History: Modern Era`,
    authors: msg`K. Owens, R. Mehta`,
    lang: msg`EN`,
    bg: "#1e293b",
    fg: "#ffffff",
    accent: "#f59e0b",
    pub: msg`ATLAS EDUCATION`,
    pages: 388,
    parts: [
      { range: msg`Front matter + Ch. 1–3`, pages: msg`pg 1–96`, span: 96, state: "merged", when: msg`Merged yesterday` },
      { range: msg`Ch. 4–7`, pages: msg`pg 97–198`, span: 102, state: "self", when: msg`You're editing · 20m ago` },
      { range: msg`Ch. 8–11`, pages: msg`pg 199–312`, span: 114, state: "out", when: msg`Exported 3 days ago` },
      { range: msg`Back matter & index`, pages: msg`pg 313–388`, span: 76, state: "out", when: msg`Exported 3 days ago` },
    ],
  },
  {
    title: msg`Introduction to Biology`,
    authors: msg`S. Okafor`,
    lang: msg`EN`,
    bg: "#166534",
    fg: "#ffffff",
    accent: "#86efac",
    pub: msg`GREENLEAF ACADEMIC`,
    pages: 420,
    parts: [
      { range: msg`Front matter + Units 1–3`, pages: msg`pg 1–210`, span: 210, state: "merged", when: msg`Merged 4 days ago` },
      { range: msg`Units 4–6 + index`, pages: msg`pg 211–420`, span: 210, state: "merged", when: msg`Merged 3 days ago` },
    ],
  },
  {
    title: msg`Geometry, an introduction`,
    authors: msg`Lin Wei, J. Castro`,
    lang: msg`EN`,
    bg: "#1e40af",
    fg: "#ffffff",
    accent: "#7dd3fc",
    pub: msg`OPENBOOKS PRESS`,
    pages: 238,
    parts: [
      { range: msg`Ch. 1–4`, pages: msg`pg 1–80`, span: 80, state: "out", when: msg`Exported today` },
      { range: msg`Ch. 5–8`, pages: msg`pg 81–160`, span: 80, state: "out", when: msg`Exported today` },
      { range: msg`Ch. 9–12 + index`, pages: msg`pg 161–238`, span: 78, state: "out", when: msg`Exported today` },
    ],
  },
]

interface Contribution {
  partTitle: MessageDescriptor
  range: MessageDescriptor
  source: MessageDescriptor
  bg: string
  accent: string
  pub: MessageDescriptor
  note: MessageDescriptor
  stagesText: MessageDescriptor
  statusVariant: "warning" | "secondary"
  statusIcon: LucideIcon
  statusText: MessageDescriptor
}

const CONTRIB: Contribution[] = [
  { partTitle: msg`Histoire-Géographie 5e`, range: msg`pg 160–240`, source: msg`Histoire-Géographie 5e`, bg: "#3f3f46", accent: "#fbbf24", pub: msg`ÉDITIONS LUMIÈRE`, note: msg`received 2 days ago`, stagesText: msg`3 stages`, statusVariant: "warning", statusIcon: Pencil, statusText: msg`In progress` },
  { partTitle: msg`Química Orgánica`, range: msg`pg 1–90`, source: msg`Química Orgánica`, bg: "#5b21b6", accent: "#ddd6fe", pub: msg`EDITORIAL ANDINA`, note: msg`received yesterday`, stagesText: msg`1 stage`, statusVariant: "secondary", statusIcon: CircleDashed, statusText: msg`Not started` },
]

const PAGE_SIZE = 2
const sectionLabel = "text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground"

export function HandoffsScreen() {
  const { i18n } = useLingui()
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true })
  const [moved, setMoved] = useState<Record<number, boolean>>({})
  const [page, setPage] = useState(0)

  const visible = SPLITS.map((bk, i) => ({ bk, i })).filter((x) => !moved[x.i])
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pageItems = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="h-full overflow-auto bg-background px-8 pb-10 pt-[26px]">
      <div className="mb-5 flex items-end gap-3.5">
        <div>
          <div className="mb-1.5 text-2xl font-bold leading-none tracking-[-0.02em]">
            <Trans>Split & merge</Trans>
          </div>
          <div className="max-w-[600px] text-[13.5px] text-muted-foreground">
            <Trans>
              Split a book into page-range parts, export each as a <code>.zip</code> to hand off, then import the returned
              parts and merge them back into the source book.
            </Trans>
          </div>
        </div>
        <Button size="sm" className="ml-auto">
          <Scissors className="size-3.5" />
          <Trans>Split a book</Trans>
        </Button>
      </div>

      <div className={`mb-2.5 ${sectionLabel}`}>
        <Trans>Books you&apos;ve split</Trans>
      </div>

      {pageItems.map(({ bk, i }) => (
        <SplitCard
          key={i}
          bk={bk}
          open={!!open[i]}
          onToggle={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
          onMoveToLibrary={() => setMoved((m) => ({ ...m, [i]: true }))}
        />
      ))}

      <Pager page={safePage} totalPages={totalPages} totalItems={visible.length} pageSize={PAGE_SIZE} onChange={setPage} />

      <div className={`mb-1.5 mt-[26px] ${sectionLabel}`}>
        <Trans>Parts shared with you</Trans>
      </div>
      <div className="mb-3 text-[12.5px] text-muted-foreground">
        <Trans>
          Parts of other books someone sent you to process. Work through the pages, then export and return the{" "}
          <code>.zip</code>.
        </Trans>
      </div>

      {CONTRIB.map((c, i) => {
        const StatusIcon = c.statusIcon
        return (
          <div key={i} className="mb-3 flex items-center gap-4 rounded-2xl border bg-card px-5 py-4 shadow-sm">
            <div className="h-[55px] w-[42px] shrink-0 overflow-hidden rounded-[5px] shadow-sm">
              <BookCover
                title={i18n._(c.partTitle)}
                author={i18n._(c.pub)}
                cover={{ bg: c.bg, fg: "#ffffff", accent: c.accent, publisherShort: i18n._(c.pub), placeholder: false, real: true }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="text-[15px] font-semibold">{i18n._(c.partTitle)}</span>
                <Badge variant="secondary" className="gap-1.5 px-2 text-[10.5px]">
                  <Puzzle className="size-3" />
                  {i18n._(c.range)}
                </Badge>
              </div>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                <Trans>
                  Part of {i18n._(c.source)} · {i18n._(c.note)}
                </Trans>
              </div>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{i18n._(c.stagesText)}</span>
            <Badge variant={c.statusVariant} className="min-w-[112px] justify-center gap-1 px-2 text-[10.5px]">
              <StatusIcon className="size-3" />
              {i18n._(c.statusText)}
            </Badge>
            <Button variant="outline" size="sm">
              <BookOpen className="size-3.5" />
              <Trans>Open part</Trans>
            </Button>
            <Button size="sm">
              <FolderUp className="size-3.5" />
              <Trans>Export & return .zip</Trans>
            </Button>
          </div>
        )
      })}
    </div>
  )
}
