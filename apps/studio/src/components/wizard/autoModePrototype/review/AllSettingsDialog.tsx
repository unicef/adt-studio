import { useId, type ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import { Image, LayoutTemplate, RotateCcw, SlidersHorizontal, type LucideIcon } from "lucide-react"
import type { FigureExtractionMode } from "@adt/types"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Switch } from "@/components/ui/switch"
import { PRESETS } from "@/components/wizard/constants"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { cn } from "@/lib/utils"
import { SettingSelect } from "./SettingSelect"
import { SourceTag } from "./parts"
import type { AiPicks, Setting } from "./setup"

/** A layout setting: name (and where its value came from) on the left, the control and its description on the right. */
function Row({ label, labelId, tag, hint, children }: { label: ReactNode; labelId?: string; tag?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[190px_1fr] items-start gap-5 py-4">
      <div className="flex flex-col items-start gap-1.5 pt-2.5">
        <span id={labelId} className="text-[13.5px] font-medium leading-none">{label}</span>
        {tag}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {children}
        {hint && <p className="text-[12px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

/** A processing option: name and what it does on the left, its control on the right — a regular settings list row. */
function OptionRow({ label, hint, htmlFor, children }: { label: ReactNode; hint: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="cursor-pointer text-[13.5px] font-medium">
            {label}
          </label>
        ) : (
          <span className="text-[13.5px] font-medium">{label}</span>
        )}
        <span className="text-[12px] leading-snug text-muted-foreground">{hint}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Group({ icon: Icon, title, description, children }: { icon: LucideIcon; title: ReactNode; description: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <Icon className="size-4" />
        </span>
        <div className="flex flex-col">
          <h3 className="text-[14px] font-semibold leading-tight">{title}</h3>
          <p className="text-[12px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex flex-col divide-y rounded-2xl border bg-card px-4">{children}</div>
    </section>
  )
}

/**
 * "Open all settings" — every option the book will be created with, in one dialog, under the
 * wizard's own names: Visual Layout (Preset, Render Strategy, Page Grouping Mode, Section Mode) and
 * Content Processing (Activities, Figure Extraction, Image Segmentation, Smart Cropping). Changes
 * apply to the form straight away, so the review behind it updates too. "Restore AI setup" undoes
 * your changes (keeping what you answered in Decide): the AI's six decisions, and the preset's defaults for the rest.
 */
export function AllSettingsDialog({ open, onOpenChange, settings, set, title, picks }: { open: boolean; onOpenChange: (open: boolean) => void; settings: Setting[]; set: (key: Setting["key"], value: string) => void; title: string; picks: AiPicks }) {
  const { t } = useLingui()
  const uid = useId()
  const form = useWizardForm()
  const v = useStore(form.store, (s) => s.values)
  const byKey = (key: Setting["key"]) => settings.find((s) => s.key === key)
  const preset = byKey("type")
  const look = byKey("look")
  const pages = byKey("pages")
  const sections = byKey("sections")
  const hintOf = (s?: Setting) => s?.choices.find((c) => c.value === s.value)?.hint

  const basePreset = preset ? (preset.source === "changed" ? preset.ai : preset.value) : null
  const rec = PRESETS.find((p) => p.id === basePreset)?.recommendations ?? {}
  const recProcessing = { activitiesGenerator: picks.activitiesGenerator, imageSegmentation: rec.imageSegmentation ?? false, imageCropping: rec.imageCropping ?? false, figureExtraction: picks.figureExtraction }
  const processingChanged = v.activitiesGenerator !== recProcessing.activitiesGenerator || v.imageSegmentation !== recProcessing.imageSegmentation || v.imageCropping !== recProcessing.imageCropping || v.figureExtraction !== recProcessing.figureExtraction
  const changed = settings.some((s) => s.source === "changed") || processingChanged

  const restore = () => {
    if (preset?.source === "changed") set("type", preset.ai)
    settings.filter((s) => s.key !== "type" && s.source === "changed").forEach((s) => set(s.key, s.ai))
    form.setFieldValue("activitiesGenerator", recProcessing.activitiesGenerator)
    form.setFieldValue("imageSegmentation", recProcessing.imageSegmentation)
    form.setFieldValue("imageCropping", recProcessing.imageCropping)
    form.setFieldValue("figureExtraction", recProcessing.figureExtraction)
  }

  const segmented = (s: Setting | undefined) => s && <SegmentedControl options={s.choices.map((c) => ({ value: c.value, label: c.title }))} value={s.value} onValueChange={(value) => set(s.key, value)} className="h-10" />
  const field = (s: Setting | undefined) => s && <SettingSelect setting={s} labelledBy={`${uid}-${s.key}`} onPick={(value) => set(s.key, value)} className="h-10" />
  const tag = (s: Setting | undefined) => s && <SourceTag source={s.source} />

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[min(760px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden rounded-[24px] p-0">
        <div className="flex items-center gap-3 border-b px-6 pb-4 pr-16 pt-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-primary-foreground shadow-[0_6px_16px_-6px_rgba(43,127,255,0.8)]">
            <SlidersHorizontal className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-col">
            <DialogTitle className="text-[19px] font-bold tracking-[-0.015em]">
              <Trans>All settings</Trans>
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              <Trans>Everything {title} will be created with. Changes apply right away.</Trans>
            </DialogDescription>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto bg-muted/40 px-6 py-5">
          <Group icon={LayoutTemplate} title={<Trans>Visual Layout</Trans>} description={<Trans>How the pages are rebuilt and grouped.</Trans>}>
            <Row label={preset?.label} labelId={`${uid}-type`} tag={tag(preset)} hint={hintOf(preset)}>
              {field(preset)}
            </Row>
            <Row label={look?.label} labelId={`${uid}-look`} tag={tag(look)} hint={hintOf(look)}>
              {field(look)}
            </Row>
            <Row label={pages?.label} tag={tag(pages)} hint={hintOf(pages)}>
              {segmented(pages)}
            </Row>
            <Row label={sections?.label} tag={tag(sections)} hint={hintOf(sections)}>
              {segmented(sections)}
            </Row>
          </Group>

          <Group icon={Image} title={<Trans>Content Processing</Trans>} description={<Trans>What gets pulled out of each page. Set by the preset.</Trans>}>
            <OptionRow label={<Trans>Activities</Trans>} hint={<Trans>Turns exercises in the book into interactive activities.</Trans>} htmlFor={`${uid}-1`}>
              <Switch id={`${uid}-1`} checked={v.activitiesGenerator} onCheckedChange={(on) => form.setFieldValue("activitiesGenerator", on)} />
            </OptionRow>
            <OptionRow label={<Trans>Figure Extraction</Trans>} hint={<Trans>Finds figures and diagrams on each page.</Trans>}>
              <SegmentedControl
                options={[
                  { value: "auto", label: t`Auto` },
                  { value: "all", label: t`All` },
                  { value: "off", label: t`Off` },
                ]}
                value={v.figureExtraction}
                onValueChange={(value) => form.setFieldValue("figureExtraction", value as FigureExtractionMode)}
                className="h-9 w-[216px]"
              />
            </OptionRow>
            <OptionRow label={<Trans>Image Segmentation</Trans>} hint={<Trans>Splits images that contain several pictures.</Trans>} htmlFor={`${uid}-2`}>
              <Switch id={`${uid}-2`} checked={v.imageSegmentation} onCheckedChange={(on) => form.setFieldValue("imageSegmentation", on)} />
            </OptionRow>
            <OptionRow label={<Trans>Smart Cropping</Trans>} hint={<Trans>Trims empty borders around images.</Trans>} htmlFor={`${uid}-3`}>
              <Switch id={`${uid}-3`} checked={v.imageCropping} onCheckedChange={(on) => form.setFieldValue("imageCropping", on)} />
            </OptionRow>
          </Group>
        </div>

        <div className="flex items-center justify-end gap-4 border-t px-6 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={restore}
              disabled={!changed}
              aria-hidden={!changed}
              tabIndex={changed ? undefined : -1}
              className={cn("inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium text-muted-foreground transition-[opacity,background-color,color] duration-200 hover:bg-muted hover:text-foreground disabled:pointer-events-none", !changed && "opacity-0")}
            >
              <RotateCcw className="size-3.5" />
              <Trans>Restore AI setup</Trans>
            </button>
            <button type="button" onClick={() => onOpenChange(false)} className="inline-flex h-10 items-center rounded-full bg-brand-600 px-5 text-[14px] font-semibold text-primary-foreground transition-[transform,background-color] duration-200 hover:bg-brand-600/90 active:scale-[0.97]">
              <Trans>Done</Trans>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
