import type { ReactNode } from "react"
import { Trans, Plural, useLingui } from "@lingui/react/macro"
import { Check, RotateCcw, Sparkles, LayoutGrid, Rows3, ArrowRight, ArrowUpRight, Pin, Plus } from "lucide-react"
import { CORE_STAGE_ORDER } from "@adt/types"
import { STAGES } from "@/components/pipeline/stage-config"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import { BookCover } from "../../BookCover"
import type { BookVM } from "../../data"

export interface HomeVariantProps {
  books: BookVM[]
  pinnedLabels?: Set<string>
  onOpen: (label: string) => void
  onContinue?: (label: string) => void
  onAddBook: () => void
  onOpenLibrary: () => void
}

export type ViewMode = "grid" | "list"

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const { t } = useLingui()
  const opt = (v: ViewMode, Icon: typeof LayoutGrid, label: string) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={value === v}
      onClick={() => onChange(v)}
      className={cn(
        "grid size-7 place-items-center rounded-md transition-colors",
        value === v ? "bg-card text-foreground ring-1 ring-border shadow-sm dark:bg-accent" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
    </button>
  )
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/60 p-0.5">
      {opt("grid", LayoutGrid, t`Grid view`)}
      {opt("list", Rows3, t`List view`)}
    </div>
  )
}

type StageDef = (typeof STAGES)[number]

const CORE_STAGE_SET = new Set<string>(CORE_STAGE_ORDER)
const BASE: StageDef[] = CORE_STAGE_ORDER.map((slug) => STAGES.find((stage) => stage.slug === slug)!)
const OPTIONAL: StageDef[] = STAGES.filter(
  (stage) => stage.slug !== "book" && !CORE_STAGE_SET.has(stage.slug),
)

export type Status = "new" | "in-progress" | "ready" | "rebuild"

export interface Progress {
  status: Status
  baseSteps: { stage: StageDef; done: boolean }[]
  baseFrontier: StageDef | null
  baseComplete: boolean
  optional: { stage: StageDef; done: boolean }[]
  optionalDone: { stage: StageDef; done: boolean }[]
}

export function progressFor(vm: BookVM): Progress {
  const done = new Set(vm.discs.map((d) => d.slug))
  const baseSteps = BASE.map((stage) => ({ stage, done: done.has(stage.slug) }))
  const baseFrontier = BASE.find((s) => !done.has(s.slug)) ?? null
  const baseComplete = !baseFrontier
  const optional = OPTIONAL.map((stage) => ({ stage, done: done.has(stage.slug) }))
  const optionalDone = optional.filter((o) => o.done)
  const status: Status = vm.needsRebuild ? "rebuild" : vm.isNew ? "new" : !baseComplete ? "in-progress" : "ready"
  return { status, baseSteps, baseFrontier, baseComplete, optional, optionalDone }
}

export function isActive(vm: BookVM): boolean {
  return ["in-progress", "rebuild"].includes(progressFor(vm).status)
}

export function pickResume(sortedByRecency: BookVM[]): BookVM | undefined {
  return (
    sortedByRecency.find((b) => isActive(b)) ??
    sortedByRecency.find((b) => progressFor(b).status !== "new") ??
    sortedByRecency[0]
  )
}

function StageIconCircle({ stage, faded }: { stage: StageDef; faded?: boolean }) {
  const Icon = stage.icon
  return (
    <span
      title={getStageLabelI18n(stage.slug)}
      className={cn("grid size-5 place-items-center rounded-full", faded && "bg-muted text-muted-foreground/40")}
      style={faded ? undefined : { background: `${stage.hex}1a`, color: stage.hex }}
    >
      <Icon className="size-3" strokeWidth={2} />
    </span>
  )
}

export function StageBar({ vm, labels = false, className }: { vm: BookVM; labels?: boolean; className?: string }) {
  const { t } = useLingui()
  const p = progressFor(vm)

  if (!labels) {
    const max = 4
    const extra = Math.max(0, p.optionalDone.length - max)
    return (
      <div className={cn("flex items-center gap-1", className)}>
        {p.baseComplete ? (
          <span title={t`Base ready`} className="grid size-5 place-items-center rounded-full bg-stage-validation/12 text-stage-validation">
            <Check className="size-3" strokeWidth={2.5} />
          </span>
        ) : (
          p.baseSteps.map(({ stage, done }) => <StageIconCircle key={stage.slug} stage={stage} faded={!done} />)
        )}
        {p.optionalDone.length > 0 && <span aria-hidden className="mx-0.5 h-3.5 w-px bg-border" />}
        {p.optionalDone.slice(0, max).map(({ stage }) => (
          <StageIconCircle key={stage.slug} stage={stage} />
        ))}
        {extra > 0 && <span className="text-[10px] font-medium tabular-nums text-muted-foreground">+{extra}</span>}
      </div>
    )
  }

  const baseDone = p.baseSteps.filter((s) => s.done).length
  const extra = Math.max(0, p.optionalDone.length - 7)
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {p.baseSteps.map(({ stage, done }) => {
            const frontier = p.status === "in-progress" && p.baseFrontier?.slug === stage.slug
            return (
              <span
                key={stage.slug}
                title={getStageLabelI18n(stage.slug)}
                className={cn(
                  "h-1.5 w-6 rounded-full transition-colors",
                  !done && "bg-muted",
                  frontier && "bg-brand-500/25 ring-1 ring-brand-500/50",
                )}
                style={done ? { background: stage.hex } : undefined}
              />
            )
          })}
        </div>
        {p.optionalDone.length > 0 && (
          <>
            <span aria-hidden className="h-3 w-px bg-border" />
            <div className="flex items-center gap-1">
              {p.optionalDone.slice(0, 7).map(({ stage }) => (
                <span key={stage.slug} title={getStageLabelI18n(stage.slug)} className="size-2 rounded-full" style={{ background: stage.hex }} />
              ))}
              {extra > 0 && <span className="text-[10px] font-medium tabular-nums text-muted-foreground">+{extra}</span>}
            </div>
          </>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        {p.baseComplete ? (
          <span className="inline-flex items-center gap-1 font-medium text-stage-storyboard">
            <Check className="size-3" />
            <Trans>Base ready</Trans>
          </span>
        ) : (
          <span>
            <Trans>Base</Trans> {baseDone}/{BASE.length}
          </span>
        )}
        {p.optionalDone.length > 0 && (
          <span>
            · <Plural value={p.optionalDone.length} one="# output" other="# outputs" />
          </span>
        )}
      </div>
    </div>
  )
}

export function FrontierChip({ vm, className }: { vm: BookVM; className?: string }) {
  const p = progressFor(vm)
  const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"

  if (p.status === "new")
    return (
      <span className={cn(base, "bg-muted text-muted-foreground", className)}>
        <Sparkles className="size-3.5" />
        <Trans>Not started</Trans>
      </span>
    )
  if (p.status === "rebuild")
    return (
      <span className={cn(base, "bg-stage-toc-50 text-stage-toc", className)}>
        <RotateCcw className="size-3.5" />
        <Trans>Needs rebuild</Trans>
      </span>
    )
  if (p.status === "ready")
    return (
      <span className={cn(base, "bg-stage-validation-50 text-stage-validation", className)}>
        <Check className="size-3.5" />
        <Trans>Ready</Trans>
      </span>
    )

  const Icon = p.baseFrontier!.icon
  return (
    <span className={cn(base, "bg-card ring-1 ring-border", className)}>
      <Icon className="size-3.5" style={{ color: p.baseFrontier!.hex }} />
      <span className="text-foreground">
        <NextLabel label={getStageLabelI18n(p.baseFrontier!.slug)} />
      </span>
    </span>
  )
}

function NextLabel({ label }: { label: string }) {
  const { t } = useLingui()
  return (
    <>
      <span className="text-muted-foreground">{t`Next`}</span> · {label}
    </>
  )
}

export function GridCard({
  vm,
  onOpen,
  ring = false,
  badge,
}: {
  vm: BookVM
  onOpen: (label: string) => void
  ring?: boolean
  badge?: ReactNode
}) {
  return (
    <button type="button" onClick={() => onOpen(vm.label)} className="group block text-left focus-visible:outline-none">
      <div
        className={cn(
          "relative aspect-[3/4] overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5 transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-brand-500",
          ring && "ring-2 ring-brand-500",
        )}
      >
        <BookCover title={vm.displayTitle} author={vm.authors} cover={vm.cover} />
        {badge && <div className="absolute left-2 top-2">{badge}</div>}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="truncate text-[11.5px] font-semibold text-primary-foreground">
            <ContinueLabel vm={vm} />
          </span>
          <ArrowRight className="size-3.5 shrink-0 text-white" />
        </div>
      </div>
      <div className="mt-2.5">
        <div className="truncate text-[13px] font-semibold leading-tight">{vm.displayTitle}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {vm.authors} · {vm.pagesText}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <FrontierChip vm={vm} />
          <span className="shrink-0 text-[11px] text-muted-foreground">{vm.modified}</span>
        </div>
      </div>
    </button>
  )
}

export function ContinueLabel({ vm }: { vm: BookVM }) {
  const { t } = useLingui()
  const p = progressFor(vm)
  if (p.status === "new") return <Trans>Start</Trans>
  if (p.status === "ready") return <Trans>Open</Trans>
  if (p.status === "rebuild") return <Trans>Rebuild</Trans>
  return (
    <>
      {t`Continue`} <span className="opacity-70">· {getStageLabelI18n(p.baseFrontier!.slug)}</span>
    </>
  )
}

export type Filter = "all" | "active" | "splits" | "ready"

function matchesFilter(vm: BookVM, f: Filter): boolean {
  if (f === "active") return isActive(vm)
  if (f === "splits") return !!(vm.raw.split && !vm.raw.split.fullyMerged)
  if (f === "ready") return progressFor(vm).status === "ready"
  return true
}

export function filterBooks(books: BookVM[], f: Filter): BookVM[] {
  return books.filter((vm) => matchesFilter(vm, f))
}

export function sortByStatus(books: BookVM[]): BookVM[] {
  const rank = (vm: BookVM) => {
    const s = progressFor(vm).status
    return s === "rebuild" ? 0 : s === "in-progress" ? 1 : s === "new" ? 2 : 3
  }
  return [...books].sort(
    (a, b) => rank(a) - rank(b) || new Date(b.raw.modifiedAt).getTime() - new Date(a.raw.modifiedAt).getTime(),
  )
}

export function FilterChips({
  books,
  value,
  onChange,
  layout = "row",
}: {
  books: BookVM[]
  value: Filter
  onChange: (f: Filter) => void
  layout?: "row" | "column"
}) {
  const { t } = useLingui()
  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: t`All` },
    { key: "active", label: t`In progress` },
    { key: "splits", label: t`Splits` },
    { key: "ready", label: t`Ready` },
  ]
  return (
    <div className={cn(layout === "column" ? "flex flex-col gap-1" : "flex flex-wrap items-center gap-2")}>
      {chips.map((c) => {
        const count = filterBooks(books, c.key).length
        const active = value === c.key
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              layout === "column" && "w-full justify-between rounded-lg",
              active ? "border-transparent bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
            <span className={cn("tabular-nums", active ? "text-background/70" : "text-muted-foreground/70")}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ShelfCard({
  vm,
  onOpen,
  showAuthor = true,
  pinned = false,
  elevated = false,
  progress = false,
  badge,
}: {
  vm: BookVM
  onOpen: (label: string) => void
  showAuthor?: boolean
  pinned?: boolean
  elevated?: boolean
  progress?: boolean
  badge?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(vm.label)}
      className="group block text-left transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-visible:outline-none"
    >
      <div
        className={cn(
          "relative aspect-[3/4] overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5 transition-shadow duration-200 group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-brand-500 [&_img]:transition-transform [&_img]:duration-500 [&_img]:ease-[cubic-bezier(0.23,1,0.32,1)] motion-safe:group-hover:[&_img]:scale-[1.05]",
          elevated && "ring-2 ring-brand-500",
        )}
      >
        <BookCover title={vm.displayTitle} author={vm.authors} cover={vm.cover} fit="cover" />
        {badge && <div className="absolute left-2 top-2 z-10">{badge}</div>}
        {elevated && (
          <span className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10.5px] font-semibold text-primary-foreground backdrop-blur-sm">
            <ContinueLabel vm={vm} />
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-start gap-1.5">
        {pinned && <Pin className="mt-[3px] size-3 shrink-0 fill-current text-muted-foreground" />}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight">{vm.displayTitle}</div>
          {showAuthor && <div className="truncate text-[11.5px] text-muted-foreground">{vm.authors}</div>}
          {(elevated || progress) && <StageBar vm={vm} className="mt-2.5" />}
        </div>
      </div>
    </button>
  )
}

export function NewBookButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-colors duration-200 hover:bg-brand-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Plus className="size-4" />
      <Trans>New book</Trans>
    </button>
  )
}

export function AddBookTile({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group block text-left focus-visible:outline-none">
      <div className="grid aspect-[3/4] place-items-center rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors duration-200 group-hover:border-brand-400 group-hover:bg-brand-50 group-hover:text-brand-600 group-focus-visible:border-brand-500">
        <Plus className="size-6" />
      </div>
      <div className="mt-2.5 text-[13px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        <Trans>Add new book</Trans>
      </div>
    </button>
  )
}

export function StatusLabel({ vm, className }: { vm: BookVM; className?: string }) {
  const { t } = useLingui()
  const p = progressFor(vm)
  let text: string
  let color: string
  if (p.status === "new") {
    text = t`Not started`
    color = "text-muted-foreground"
  } else if (p.status === "rebuild") {
    text = t`Needs rebuild`
    color = "text-stage-toc"
  } else if (p.status === "ready") {
    text = t`Ready`
    color = "text-stage-validation"
  } else {
    text = `${t`Next`} · ${getStageLabelI18n(p.baseFrontier!.slug)}`
    color = "text-foreground"
  }
  return <span className={cn("text-[11px] font-medium", color, className)}>{text}</span>
}

export function OutputsPanel({ vm, className }: { vm: BookVM; className?: string }) {
  const p = progressFor(vm)
  return (
    <div className={cn("w-[228px] shrink-0", className)}>
      <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <Trans>What&apos;s inside</Trans>
      </div>
      {p.optionalDone.length === 0 ? (
        <p className="max-w-[22ch] text-[12.5px] leading-relaxed text-muted-foreground">
          <Trans>Outputs will appear here as you generate them.</Trans>
        </p>
      ) : (
        <ul className="space-y-2">
          {p.optionalDone.map(({ stage }) => {
            const Icon = stage.icon
            return (
              <li key={stage.slug} className="flex items-center gap-2.5 text-[13px]">
                <span className="grid size-6 shrink-0 place-items-center rounded-md" style={{ backgroundColor: `${stage.hex}1a`, color: stage.hex }}>
                  <Icon className="size-3.5" />
                </span>
                <span className="truncate text-foreground">{getStageLabelI18n(stage.slug)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function LibraryLink({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
    >
      <Trans>All {count} books in Library</Trans>
      <ArrowUpRight className="size-3.5" />
    </button>
  )
}

const CELL = "px-4 py-3 align-middle"

export function LibraryTable({ books, onOpen }: { books: BookVM[]; onOpen: (label: string) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b bg-muted/40 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
            <th className={cn(CELL, "font-medium")}>
              <Trans>Book</Trans>
            </th>
            <th className={cn(CELL, "w-[30%] font-medium")}>
              <Trans>Progress</Trans>
            </th>
            <th className={cn(CELL, "font-medium")}>
              <Trans>Pages</Trans>
            </th>
            <th className={cn(CELL, "font-medium")}>
              <Trans>Lang</Trans>
            </th>
            <th className={cn(CELL, "font-medium")}>
              <Trans>Last edited</Trans>
            </th>
          </tr>
        </thead>
        <tbody className="text-[13px]">
          {books.map((vm) => (
            <tr
              key={vm.label}
              onClick={() => onOpen(vm.label)}
              className="group cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40"
            >
              <td className={CELL}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpen(vm.label)
                  }}
                  className="flex w-full items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <div className="h-11 w-8 shrink-0 overflow-hidden rounded shadow-sm ring-1 ring-black/5">
                    <BookCover title={vm.displayTitle} author={vm.authors} cover={vm.cover} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold leading-tight">{vm.displayTitle}</div>
                    <div className="truncate text-[11.5px] text-muted-foreground">{vm.authors}</div>
                  </div>
                </button>
              </td>
              <td className={CELL}>
                <div className="flex items-center gap-2.5">
                  <StageBar vm={vm} className="min-w-[92px] flex-1" />
                  <FrontierChip vm={vm} />
                </div>
              </td>
              <td className={cn(CELL, "tabular-nums text-muted-foreground")}>{vm.pagesText}</td>
              <td className={cn(CELL, "font-mono text-[11.5px] text-muted-foreground")}>{vm.lang}</td>
              <td className={cn(CELL, "whitespace-nowrap text-muted-foreground")}>
                <span className="group-hover:hidden">{vm.modified}</span>
                <span className="hidden items-center gap-1 font-medium text-brand-700 group-hover:inline-flex">
                  <Trans>Continue</Trans>
                  <ArrowRight className="size-3.5" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
