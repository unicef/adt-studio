import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { ArrowRight, Check, Loader2, Plus, UsersRound } from "lucide-react"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { FEATURE_SECTIONS } from "./features"
import { Status } from "./parts"
import { useGroupNames, useStepFacts } from "./stepFacts"
import { ALL_ART, ArtImage, artSrc } from "./StepDetail"
import { EASE_SPRING, SKIN, focusRingClassName, primaryCtaClassName, toneTextClassName } from "./style"

export interface RichEntry {
  item: DockItem
  added: boolean
  section: string
}

export interface AddMenuRichProps {
  entries: RichEntry[]
  activeSlug: string | null | undefined
  notices: Partial<Record<string, string>>
  activate: (entry: RichEntry) => void
}

const ESSENTIAL = "captions"

export function buildEntries(present: DockItem[], addable: DockItem[], inBook: (slug: string) => boolean): RichEntry[] {
  return FEATURE_SECTIONS.flatMap((section) =>
    section.slugs.flatMap((slug) => {
      const item = present.find((candidate) => candidate.slug === slug) ?? addable.find((candidate) => candidate.slug === slug)
      return item ? [{ item, added: inBook(slug), section: section.key }] : []
    }),
  )
}

function usePreload() {
  useEffect(() => {
    for (const src of ALL_ART) {
      const image = new Image()
      image.decoding = "async"
      image.src = src
    }
  }, [])
}

function needsAttention(entry: RichEntry): boolean {
  const { state, pending } = entry.item
  return entry.added && (state === "error" || state === "running" || state === "queued" || pending > 0)
}

function useCopy() {
  const { t } = useLingui()
  return {
    reason: t`Screen readers announce each picture's content instead of skipping it.`,
    last: t`Best done last`,
    lastWhy: t`They translate and read aloud everything else.`,
    stateLabel: (entry: RichEntry) => {
      const { state, pending } = entry.item
      if (!entry.added) return t`not in the book yet`
      if (state === "error") return t`failed`
      if (state === "running" || state === "queued") return t`running`
      if (pending > 0) return t`${plural(pending, { one: "# to review", other: "# to review" })}`
      return t`ready`
    },
  }
}

function Art({ slug, className }: { slug: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-[#f6f3ee] dark:bg-[#1c1c20] dark:ring-1 dark:ring-inset dark:ring-white/[0.06]", className)}>
      {artSrc(slug, "card") && <ArtImage slug={slug} shape="card" />}
    </div>
  )
}

function StateMark({ entry, here }: { entry: RichEntry; here: boolean }) {
  const copy = useCopy()
  const { state, pending } = entry.item
  const sr = <span className="sr-only">{copy.stateLabel(entry)}</span>
  if (here)
    return (
      <>
        <span aria-hidden className="size-2 rounded-full bg-[color-mix(in_srgb,var(--tone)_80%,black)]" style={{ ["--tone" as string]: entry.item.hex }} />
        {sr}
      </>
    )
  if (!entry.added)
    return (
      <>
        <Plus aria-hidden className={cn("size-3.5", SKIN.muted)} strokeWidth={2.4} />
        {sr}
      </>
    )
  if (state === "error")
    return (
      <>
        <span aria-hidden className="grid size-4 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white">!</span>
        {sr}
      </>
    )
  if (state === "running" || state === "queued")
    return (
      <>
        <Loader2 aria-hidden className="size-3.5 animate-spin text-sky-600 motion-reduce:animate-none dark:text-sky-300" strokeWidth={2.4} />
        {sr}
      </>
    )
  if (pending > 0)
    return (
      <>
        <span aria-hidden className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold tabular-nums text-white">
          {pending}
        </span>
        {sr}
      </>
    )
  return (
    <>
      <Check aria-hidden className={cn("size-3.5", SKIN.muted)} strokeWidth={2.4} />
      {sr}
    </>
  )
}

function Cta({
  entry,
  here,
  onClick,
  size = "md",
  autoFocus = false,
  buttonRef,
}: {
  entry: RichEntry
  here: boolean
  onClick: () => void
  size?: "sm" | "md"
  autoFocus?: boolean
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  if (here) return null
  return (
    <button
      ref={buttonRef}
      type="button"
      autoFocus={autoFocus}
      onClick={onClick}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] font-semibold transition-[background-color,scale] duration-150 ease-out active:scale-[0.97]",
        focusRingClassName,
        size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[12.5px]",
        entry.added ? "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200" : primaryCtaClassName,
      )}
    >
      {entry.added ? (
        <>
          <Trans>Open</Trans>
          <ArrowRight className="size-3.5" strokeWidth={2.25} />
        </>
      ) : (
        <>
          <Plus className="size-3.5" strokeWidth={2.5} />
          <Trans>Set up</Trans>
        </>
      )}
    </button>
  )
}

function BookSummary({ entries, onPick }: { entries: RichEntry[]; onPick: (entry: RichEntry) => void }) {
  const { t } = useLingui()
  const copy = useCopy()
  const added = entries.filter((entry) => entry.added)
  const attention = entries.filter(needsAttention)
  if (added.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      <span className={cn("text-[11px] font-medium", SKIN.muted)}>{t`${added.length} of ${entries.length} in your book`}</span>
      {attention.length > 0 && (
        <div className="flex items-center gap-1">
          {attention.map((entry) => (
            <button
              key={entry.item.slug}
              type="button"
              onClick={() => onPick(entry)}
              className={cn(
                "flex h-6 cursor-pointer items-center gap-1 rounded-full bg-white pr-1.5 pl-1 ring-1 ring-zinc-950/[0.08] transition-transform duration-150 ease-out hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 dark:bg-zinc-900 dark:ring-white/[0.1]",
                focusRingClassName,
              )}
            >
              <entry.item.icon aria-hidden className="size-3.5" strokeWidth={2.1} style={{ color: entry.item.hex }} />
              <StateMark entry={entry} here={false} />
              <span className="sr-only">
                {getStageLabelI18n(entry.item.slug)}, {copy.stateLabel(entry)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PreviewMenu({ entries, activeSlug, notices, activate }: AddMenuRichProps) {
  const { t } = useLingui()
  const copy = useCopy()
  const facts = useStepFacts()
  const groupName = useGroupNames()
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const ctaRef = useRef<HTMLButtonElement>(null)
  const intent = useRef<number | null>(null)
  const initial =
    entries.find((entry) => entry.item.slug === ESSENTIAL && !entry.added) ??
    entries.find((entry) => entry.added && (entry.item.state === "error" || entry.item.pending > 0)) ??
    entries[0]
  const [focused, setFocused] = useState<string>(initial?.item.slug ?? ESSENTIAL)
  const [bar, setBar] = useState<{ y: number; h: number } | null>(null)
  const current = entries.find((entry) => entry.item.slug === focused) ?? entries[0]

  useLayoutEffect(() => {
    const row = rowRefs.current[focused]
    if (row) setBar({ y: row.offsetTop, h: row.offsetHeight })
  }, [focused, entries.length])

  useEffect(() => () => {
    if (intent.current !== null) window.clearTimeout(intent.current)
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => rowRefs.current[initial?.item.slug ?? ESSENTIAL]?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [])

  const select = (slug: string) => {
    clearIntent()
    setFocused(slug)
    requestAnimationFrame(() => ctaRef.current?.focus())
  }

  const clearIntent = () => {
    if (intent.current === null) return
    window.clearTimeout(intent.current)
    intent.current = null
  }

  const focusSoon = (slug: string) => {
    clearIntent()
    intent.current = window.setTimeout(() => setFocused(slug), 60)
  }

  const focusAt = (index: number) => {
    clearIntent()
    const next = entries[(index + entries.length) % entries.length]
    setFocused(next.item.slug)
    rowRefs.current[next.item.slug]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      select(focused)
      return
    }
    const index = entries.findIndex((entry) => entry.item.slug === focused)
    const keys: Record<string, number> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: entries.length - 1 }
    if (!(event.key in keys)) return
    event.preventDefault()
    focusAt(keys[event.key])
  }

  const groupLabel = (key: string) => (key === "localization" ? t`Last: ${groupName(key)}` : groupName(key))
  const groups = FEATURE_SECTIONS.map((section) => ({ key: section.key, entries: entries.filter((entry) => entry.section === section.key) })).filter(
    (group) => group.entries.length > 0,
  )


  return (
    <div className="pb-1">
      <div className="flex h-9 items-center justify-between gap-3 px-2.5">
        <p className={cn("text-[13.5px] font-semibold tracking-[-0.01em]", SKIN.strong)}>
          <Trans>Add to your book</Trans>
        </p>
        <BookSummary entries={entries} onPick={activate} />
      </div>
      <div className="grid grid-cols-[252px_minmax(0,1fr)] gap-2">
        <div role="listbox" aria-label={t`Features`} onKeyDown={onKeyDown} className="relative flex flex-col">
          {bar && (
            <span
              aria-hidden
              className={cn("pointer-events-none absolute inset-x-0 top-0 rounded-[10px] transition-[translate,height] duration-200 motion-reduce:transition-none", EASE_SPRING, SKIN.rowHere)}
              style={{ translate: `0 ${bar.y}px`, height: bar.h }}
            />
          )}
          {groups.map((group) => {
            const heading = groupLabel(group.key)
            const headingId = `add-menu-${group.key}`
            return (
              <div key={group.key} role="group" aria-labelledby={headingId}>
                <p
                  id={headingId}
                  className={cn(
                    "px-2.5 pt-2 pb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]",
                    group.key === "essential" ? "text-amber-800 dark:text-amber-200" : SKIN.muted,
                  )}
                >
                  {heading}
                </p>
                {group.entries.map((entry) => {
                  const isFocused = entry.item.slug === focused
                  return (
                    <button
                      key={entry.item.slug}
                      ref={(element) => {
                        rowRefs.current[entry.item.slug] = element
                      }}
                      type="button"
                      role="option"
                      aria-selected={isFocused}
                      tabIndex={isFocused ? 0 : -1}
                      onPointerEnter={() => focusSoon(entry.item.slug)}
                      onPointerLeave={clearIntent}
                      onFocus={() => setFocused(entry.item.slug)}
                      onClick={() => select(entry.item.slug)}
                      onDoubleClick={() => activate(entry)}
                      className={cn("relative flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2 text-left", focusRingClassName)}
                    >
                      <span
                        className={cn("grid size-6 shrink-0 place-items-center rounded-[7px]", !entry.added && "border border-dashed")}
                        style={
                          entry.added
                            ? { background: `color-mix(in srgb, ${entry.item.hex} var(--dock-chip), transparent)` }
                            : { borderColor: `color-mix(in srgb, ${entry.item.hex} 45%, transparent)` }
                        }
                      >
                        <entry.item.icon className="size-3.5" strokeWidth={2} style={{ color: entry.item.hex }} />
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate text-[13px]", isFocused ? "font-semibold" : "font-medium", SKIN.strong)}>
                        {facts(entry.item.slug).label}
                      </span>
                      <span className="grid min-w-4 shrink-0 place-items-center">
                        <StateMark entry={entry} here={entry.item.slug === activeSlug} />
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div className="grid min-w-0 overflow-hidden rounded-[16px] bg-zinc-950/[0.025] dark:bg-white/[0.04]">
          {entries.map((entry) => {
            const visible = entry.item.slug === current?.item.slug
            const info = facts(entry.item.slug)
            const isHere = entry.item.slug === activeSlug
            const missing = entry.item.slug === ESSENTIAL && !entry.added
            return (
              <div
                key={entry.item.slug}
                aria-hidden={!visible}
                inert={!visible}
                className={cn(
                  "col-start-1 row-start-1 flex min-h-0 flex-col transition-opacity duration-150 ease-out motion-reduce:transition-none",
                  visible ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <Art slug={entry.item.slug} className="aspect-[2/1] w-full shrink-0" />
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className={cn("text-[14px] font-semibold tracking-[-0.01em]", SKIN.strong)}>{info.label}</p>
                  <p className={cn("text-[12.5px] leading-snug", SKIN.strong)}>
                    {missing ? copy.reason : entry.section === "localization" ? info.fit : info.description}
                  </p>
                  {info.helps && (
                    <p className={cn("flex items-start gap-1.5 text-[12px] leading-snug", SKIN.muted)}>
                      <UsersRound aria-hidden className="mt-px size-3.5 shrink-0 opacity-60" strokeWidth={2} />
                      <span>
                        <span className="font-semibold">{t`Who it helps:`}</span> {info.helps}
                      </span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {info.facts.map((fact) => (
                      <span
                        key={fact.text}
                        className="flex h-6 items-center gap-1 rounded-full bg-white px-2 text-[11.5px] text-zinc-700 ring-1 ring-zinc-950/[0.06] dark:bg-zinc-900 dark:text-white/75 dark:ring-white/[0.08]"
                      >
                        <fact.icon className="size-3.5" strokeWidth={1.9} style={{ color: entry.item.hex }} />
                        {fact.text}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    {notices[entry.item.slug] ? (
                      <span className="text-[11.5px] font-medium text-amber-700 dark:text-amber-300">{notices[entry.item.slug]}</span>
                    ) : isHere ? (
                      <span className={cn("text-[11.5px] font-medium", toneTextClassName)} style={{ ["--tone" as string]: entry.item.hex }}>
                        <Trans>You're here</Trans>
                      </span>
                    ) : entry.added ? (
                      <Status item={entry.item} />
                    ) : (
                      <span className={cn("text-[11.5px]", SKIN.muted)}>{info.joins}</span>
                    )}
                    <Cta entry={entry} here={isHere} onClick={() => activate(entry)} buttonRef={visible ? ctaRef : undefined} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function AddMenuRich(props: AddMenuRichProps) {
  const { t } = useLingui()
  usePreload()
  return (
    <div role="dialog" aria-label={t`Add to your book`} className="animate-in fade-in duration-200 ease-out motion-reduce:animate-none">
      <PreviewMenu {...props} />
    </div>
  )
}
