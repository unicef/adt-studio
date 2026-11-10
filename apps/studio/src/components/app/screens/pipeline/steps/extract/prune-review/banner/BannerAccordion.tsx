import { useEffect, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { ArrowRight, Check, ChevronDown, ImageMinus, Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { FilteredThumb } from "../FilteredThumb"
import type { FilteredImage } from "../useFilteredImages"
import type { BannerModel } from "./bannerModel"
import { DismissButton, GHOST, LINK, PRIMARY } from "./BannerParts"
import { PictureContext } from "./PictureContext"
import { FocusView } from "./OpenViews"
import { useBannerCopy } from "./useBannerCopy"
import { LanguageNotice } from "../second-opinion/LanguageNotice"
import { VerdictMark } from "../second-opinion/AiThumbGrid"



export function BannerAccordion({ model, simulated, startOpen }: { model: BannerModel; simulated: boolean; startOpen: boolean }) {
  const { t } = useLingui()
  const copy = useBannerCopy(model)
  const [open, setOpen] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  useEffect(() => {
    if (startOpen) setOpen(true)
  }, [startOpen])
  const opinion = model.ai.opinion
  const flagged = [...model.needed, ...model.look]
  const answered = flagged.filter((item) => opinion.opinionOf(item) !== null)
  const aiDone = !opinion.running && answered.length > 0
  const byVerdict = (verdict: "keep" | "unsure" | "remove") => flagged.filter((item) => opinion.opinionOf(item)?.verdict === verdict)
  const groups: Array<{ key: string; title: string; items: FilteredImage[] }> = aiDone || opinion.running
    ? [
        { key: "keep", title: t`AI: bring back`, items: byVerdict("keep") },
        { key: "unsure", title: t`AI: not sure`, items: byVerdict("unsure") },
        { key: "remove", title: t`AI: fine to leave out`, items: byVerdict("remove") },
        { key: "open", title: opinion.running ? t`Waiting for the AI` : t`Not asked yet`, items: flagged.filter((item) => opinion.opinionOf(item) === null) },
      ]
    : [{ key: "all", title: t`Worth checking, most likely first`, items: flagged }]
  const ordered = groups.flatMap((group) => group.items)
  const keep = copy.tally.keep
  const phase = model.loading
    ? "loading"
    : copy.state === "fine"
      ? "fine"
      : copy.state === "finished"
        ? "finished"
        : opinion.running
          ? "ai-running"
          : copy.state === "progress"
            ? "checking"
            : aiDone
              ? "ai-done"
              : "before-ai"
  const attention = phase === "before-ai" || phase === "checking" || phase === "ai-running" || (phase === "ai-done" && keep + copy.tally.unsure > 0)
  const right = model.counts.right
  const title =
    phase === "loading"
      ? t`Checking the left-out pictures…`
      : phase === "fine"
        ? copy.fineText
        : phase === "finished"
          ? copy.finishedText
          : phase === "ai-running"
            ? t`The AI is looking at the ${copy.worth} pictures`
            : phase === "checking"
              ? t`Checking left-out pictures: ${copy.progressText}`
              : phase === "ai-done"
                ? keep > 0
                  ? t`${plural(keep, { one: "The AI suggests bringing back # picture", other: "The AI suggests bringing back # pictures" })}`
                  : t`The AI thinks the left-out pictures can stay out`
                : t`${plural(copy.worth, { one: "# left-out picture could matter to the book", other: "# left-out pictures could matter to the book" })}`
  const body =
    phase === "loading"
      ? null
      : phase === "fine"
        ? t`Nothing to do before Sectioning.`
        : phase === "finished"
          ? t`You can look at them again any time.`
          : phase === "ai-running"
            ? t`${opinion.progress?.done ?? 0} of ${opinion.progress?.total ?? copy.worth} checked. You can keep working; the answers appear as they arrive.`
            : phase === "checking"
              ? aiDone
                ? t`Carry on where you left off; the AI's picks come first.`
                : t`Carry on where you left off. Sectioning only uses the pictures you keep.`
              : phase === "ai-done"
                ? keep > 0
                  ? t`It is not sure about ${copy.tally.unsure} and thinks ${copy.tally.remove} can stay out. Check its picks; nothing changes until you decide.`
                  : t`It is not sure about ${copy.tally.unsure}. Check its picks; nothing changes until you decide.`
                : right > 0
                  ? t`The other ${right} look like dots, lines or plain shapes. Ask the AI to look at these on their pages, or show the pictures and decide yourself. Sectioning only uses the pictures you keep.`
                  : t`Ask the AI to look at them on their pages, or show the pictures and decide yourself. Sectioning only uses the pictures you keep.`
  const openOn = (item: FilteredImage) => {
    setOpen(true)
    setFocusKey(item.key)
  }

  const notice = aiDone ? <LanguageNotice label={model.label} hex={model.hex} opinion={opinion} scope={model.ai.scope} /> : null
  const toggle =
    ordered.length > 0 ? (
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        data-banner-toggle
      >
        {open ? t`Hide the pictures` : t`Show the pictures`}
        <ChevronDown className={cn("size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
    ) : null
  const outline = "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border bg-card px-3 text-[13px] font-medium text-foreground transition-colors duration-150 hover:bg-muted"
  const actions =
    phase === "loading" ? null : (
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {phase === "before-ai" && (
          <>
            <button type="button" onClick={model.ai.onAsk} className={PRIMARY} data-banner-ai="before" title={t`An AI model looks at each picture on its page and says if a reader needs it. Nothing changes until you decide.`}>
              <Sparkles className="size-3.5" aria-hidden />
              {t`Ask AI for a second look`}
            </button>
          </>
        )}
        {phase === "ai-running" && (
          <>
            {!simulated && (
              <button type="button" onClick={() => opinion.setView("live")} className={outline} data-banner-ai="running">
                <Loader2 className="size-3.5 animate-spin text-[var(--chrome-hex)] motion-reduce:animate-none" aria-hidden />
                {t`Show progress`}
              </button>
            )}
            {simulated && (
              <span className="flex h-9 items-center gap-1.5 px-1 text-[12.5px] text-muted-foreground" data-banner-ai="running">
                <Loader2 className="size-3.5 animate-spin text-[var(--chrome-hex)] motion-reduce:animate-none" aria-hidden />
                {t`AI is checking…`}
              </span>
            )}
          </>
        )}
        {phase === "ai-done" && keep + copy.tally.unsure > 0 && (
          <button type="button" onClick={model.onStart} className={PRIMARY} data-banner-ai="done">
            {t`Check the AI's picks`}
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        )}
        {phase === "checking" && (
          <button type="button" onClick={model.onStart} className={PRIMARY}>
            {t`Continue`}
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        )}
        {toggle}
        {phase === "checking" && !aiDone && (
          <button type="button" onClick={model.ai.onAsk} className={GHOST} data-banner-ai="before">
            {t`Ask AI for a second look`}
          </button>
        )}
        {opinion.error && !opinion.running && (
          <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-destructive" data-banner-ai="error">
            <span className="min-w-0 truncate" title={opinion.error}>
              {t`AI second look failed: ${opinion.error}`}
            </span>
            <button type="button" onClick={model.ai.onAsk} className={LINK}>
              {t`Try again`}
            </button>
          </span>
        )}
        {notice}
        {phase === "fine" && (
          <button type="button" onClick={() => model.onShowAll(!model.showAll)} className={GHOST}>
            {copy.showAllLabel}
          </button>
        )}
      </div>
    )

  const icon = (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl transition-colors duration-200",
        "size-10",
        attention ? "bg-[color-mix(in_srgb,var(--chrome-hex)_14%,transparent)] text-[var(--chrome-hex)]" : "bg-muted text-muted-foreground",
      )}
    >
      {phase === "loading" ? (
        <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : phase === "ai-running" || phase === "ai-done" ? (
        <Sparkles className="size-5" strokeWidth={2.2} aria-hidden />
      ) : attention ? (
        <ImageMinus className="size-5" strokeWidth={2.2} aria-hidden />
      ) : (
        <Check className="size-5" strokeWidth={2.2} aria-hidden />
      )}
    </span>
  )

  const notes = (
    <div className="flex flex-col gap-1 border-t pt-3 text-[12px] leading-relaxed text-muted-foreground">
      {right > 0 && (
        <p>
          {t`${right} more look right to leave out: ${copy.kinds}.`}{" "}
          <button type="button" onClick={() => model.onShowAll(!model.showAll)} className={LINK}>
            {copy.showAllLabel}
          </button>
        </p>
      )}
      <p>
        <Trans>Sectioning only uses the pictures you keep. Bringing one back saves a new version of that page.</Trans>
      </p>
    </div>
  )
  const openBody = (
    <div className="flex flex-col gap-4">
      <FocusView
        model={model}
        items={ordered}
        currentKey={focusKey}
        onPick={setFocusKey}
        renderDetail={(item, next) => <PictureContext model={model} item={item} onOpen={() => model.onOpen(item)} onDecided={next} />}
      />
      {notes}
    </div>
  )

  return (
    <section
      aria-label={t`Left-out pictures`}
      data-left-out-alert="accordion"
      data-banner-phase={phase}
      className="rounded-xl border bg-card animate-in fade-in duration-200 motion-reduce:animate-none"
    >
        <div className="flex items-start gap-4 px-5 py-4">
          {icon}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p key={phase} className="text-[15px] leading-snug font-semibold text-foreground animate-in fade-in duration-150 motion-reduce:animate-none" data-left-out-headline>
              {title}
            </p>
            {body && <p className="max-w-[72ch] text-[13px] leading-relaxed text-muted-foreground">{body}</p>}
            {actions}
          </div>
          <DismissButton model={model} className="-mt-1 -mr-2" />
        </div>

      <div className={cn("grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={!open} data-banner-open-layout="focus">
        <div className="overflow-hidden">
          <div className="border-t px-4 py-4">{openBody}</div>
        </div>
      </div>
    </section>
  )
}
