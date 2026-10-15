import { useId, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { ArrowRight, Plus, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FRIENDLY_STAGE_LABEL_MESSAGES, getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/sonner"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"

export const SUGGESTED_OUTPUTS = ["captions", "speech", "translate", "easy-read", "sign-language", "validation"]

export const READER_COPY: Record<string, MessageDescriptor> = {
  captions: msg`Written descriptions of every picture, read out by screen readers. Add Read aloud to hear the whole book spoken.`,
  quizzes: msg`Short comprehension questions between pages.`,
  glossary: msg`Key words explained where they appear.`,
  toc: msg`A table of contents readers can jump through.`,
  "easy-read": msg`A simpler version of every text that readers can switch on.`,
  "sign-language": msg`Sign-language videos for deaf readers, played next to each section. You upload the videos.`,
  translate: msg`Translate the book into other languages, like Portuguese or Spanish. Read aloud uses it to know which language to speak.`,
  speech: msg`Every text read aloud, with words highlighted as they are spoken.`,
  validation: msg`An accessibility check of the finished book. Readers never see it.`,
}

const CHECKS = new Set(["validation"])

export interface AddOutputsPopoverProps {
  suggested?: boolean
  available: DockItem[]
  removable: DockItem[]
  emphasize: boolean
  onAdd: (slug: string) => void
  onRemove: (slug: string) => void
  onOpenChange?: (open: boolean) => void
  onShowSuggestions?: () => void
}

export function outputName(slug: string, i18n: { _: (descriptor: MessageDescriptor) => string }): string {
  const name = FRIENDLY_STAGE_LABEL_MESSAGES[slug]
  return name ? i18n._(name) : getStageLabelI18n(slug)
}

function OutputRow({ item, onAdd, friendly }: { item: DockItem; onAdd: (slug: string) => void; friendly: boolean }) {
  const { t, i18n } = useLingui()
  const copy = READER_COPY[item.slug]
  const display = friendly ? outputName(item.slug, i18n) : getStageLabelI18n(item.slug)
  const formal = getStageLabelI18n(item.slug)
  return (
    <button
      type="button"
      onClick={() => onAdd(item.slug)}
      className="group flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-muted"
    >
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-white" style={{ background: item.hex }}>
        <item.icon className="size-3.5" strokeWidth={2.4} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold">
          {display}
          {friendly && display !== formal && <span className="text-[10.5px] font-normal text-muted-foreground">{formal}</span>}
          {item.lockedBy && item.lockedBy !== "storyboard" && (
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
              {friendly ? t`adds ${outputName(item.lockedBy, i18n)}` : t`needs ${getStageLabelI18n(item.lockedBy)}`}
            </span>
          )}
        </span>
        {copy && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{i18n._(copy)}</span>}
      </span>
      <span className="mt-1 flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150 group-hover:border-brand-300 group-hover:text-brand-700 dark:group-hover:border-brand-500/50 dark:group-hover:text-brand-300">
        <Trans>Add</Trans>
        <ArrowRight className="size-3 transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </button>
  )
}

export function AddOutputsPopover({ suggested = false, available, removable, emphasize, onAdd, onRemove, onOpenChange, onShowSuggestions }: AddOutputsPopoverProps) {
  const [open, setOpen] = useState(false)
  const changeOpen = (next: boolean) => {
    if (next) toast.dismiss()
    setOpen(next)
    onOpenChange?.(next)
  }
  const { t, i18n } = useLingui()
  const suggestions = suggested
    ? SUGGESTED_OUTPUTS.map((slug) => available.find((item) => item.slug === slug)).filter((item): item is DockItem => !!item)
    : []
  const headingId = useId()
  const contentRef = useRef<HTMLDivElement>(null)
  const forReaders = available.filter((item) => !CHECKS.has(item.slug) && !suggestions.includes(item))
  const checks = available.filter((item) => CHECKS.has(item.slug) && !suggestions.includes(item))

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-outputs-trigger
          aria-label={t`Add outputs`}
          className={cn(
            "relative flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-[background-color,color,transform] duration-200 active:scale-95",
            emphasize
              ? "bg-brand-700 text-white hover:bg-brand-800 dark:bg-foreground dark:text-background dark:hover:bg-foreground/90"
              : "bg-muted text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground data-[state=open]:bg-foreground/10 data-[state=open]:text-foreground",
          )}
        >
          {emphasize && (
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-brand-400/60 motion-safe:animate-ping [animation-duration:2.4s] [animation-iteration-count:3]" />
          )}
          <Plus className="size-[17px]" strokeWidth={2.4} />
          <Trans>Outputs</Trans>
        </button>
      </PopoverTrigger>
      <PopoverContent ref={contentRef} aria-labelledby={headingId} side="top" align="end" sideOffset={10} className="w-[380px] rounded-2xl p-2">
        <div className="px-2 pb-2 pt-1">
          <div id={headingId} className="text-[13px] font-semibold">
            <Trans>Outputs</Trans>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
            <Trans>What readers get on top of the pages. Add one to set it up — nothing runs until you press Run.</Trans>
          </p>
          {onShowSuggestions && (
            <button
              type="button"
              onClick={() => {
                onShowSuggestions()
                changeOpen(false)
              }}
              className="mt-1.5 text-[11.5px] font-medium text-brand-700 underline-offset-2 transition-colors hover:underline dark:text-brand-300"
            >
              <Trans>Help me choose for my readers</Trans>
            </button>
          )}
        </div>

        {removable.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1.5 px-2 pb-2">
            {removable.map((item) => (
              <span key={item.slug} className="flex items-center gap-1 rounded-full border py-0.5 pl-2 pr-0.5 text-[11.5px] font-medium">
                <span className="size-2 rounded-full" style={{ background: item.hex }} />
                {suggested ? outputName(item.slug, i18n) : getStageLabelI18n(item.slug)}
                <button
                  type="button"
                  onClick={() => {
                    onRemove(item.slug)
                    requestAnimationFrame(() => contentRef.current?.querySelector<HTMLButtonElement>("button")?.focus())
                  }}
                  aria-label={t`Remove ${suggested ? outputName(item.slug, i18n) : getStageLabelI18n(item.slug)}`}
                  className="grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {available.length === 0 ? (
          <p className="px-2 py-4 text-center text-[12px] text-muted-foreground">
            <Trans>Every output is already in this book.</Trans>
          </p>
        ) : (
          <div className="flex max-h-[min(520px,calc(100vh-200px))] flex-col gap-2 overflow-y-auto pb-3 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]">
            {suggestions.length > 0 && (
              <div className="rounded-xl bg-brand-50/60 p-1 dark:bg-brand-500/10">
                <div className="px-2 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-brand-700 dark:text-brand-300">
                  <Trans>Suggested for accessible books</Trans>
                </div>
                {suggestions.map((item) => (
                  <OutputRow key={item.slug} item={item} onAdd={onAdd} friendly />
                ))}
              </div>
            )}
            {forReaders.length > 0 && (
              <div>
                <div className="px-2 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                  <Trans>For readers</Trans>
                </div>
                {forReaders.map((item) => (
                  <OutputRow key={item.slug} item={item} onAdd={onAdd} friendly={suggested} />
                ))}
              </div>
            )}
            {checks.length > 0 && (
              <div>
                <div className="px-2 pb-1 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                  <Trans>Checks</Trans>
                </div>
                {checks.map((item) => (
                  <OutputRow key={item.slug} item={item} onAdd={onAdd} friendly={suggested} />
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
