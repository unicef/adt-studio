import { useEffect, useState } from "react"
import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { PencilLine, Settings2, Sparkles, UserRound } from "lucide-react"
import { LanguagePicker } from "@/components/LanguagePicker"
import { ProjectNameField } from "@/components/wizard/step1BasicInfo/ProjectNameField"
import { createProjectLabelSchema } from "@/components/wizard/step1BasicInfo/projectLabelSchema"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { useBooks } from "@/hooks/use-books"
import { normalizeLocale } from "@/lib/languages"
import { cn } from "@/lib/utils"
import { useBookPages } from "../loader/useBookPages"
import { Book3D } from "../upload/Book3D"
import type { Processing, Setting } from "./setup"


export type ReviewProps = { settings: Setting[]; set: (key: Setting["key"], value: string) => void; processing: Processing[]; title: string; numPages: number; cover?: string; onBack: () => void; onCreate: () => void; onAllSettings: () => void }

/** One line for the whole list, so rows only need a tag when they differ from the AI's pick. */
export function PickedByAi({ settings }: { settings: Setting[] }) {
  const n = settings.filter((s) => s.source === "ai").length
  const total = settings.length
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700 ring-1 ring-brand-200">
      <Sparkles className="size-3" />
      {n === total ? <Trans>Picked by AI</Trans> : <Trans>{n} of {total} picked by AI</Trans>}
    </span>
  )
}

/** Where a value came from, shown only when it isn't the AI's own pick (unless `showAi`): the user's answer to the AI's question, or a later change. */
export function SourceTag({ source, className, showAi }: { source: Setting["source"]; className?: string; showAi?: boolean }) {
  if (source === "asked")
    return (
      <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-500/30", className)}>
        <UserRound className="size-3" />
        <Trans>You chose</Trans>
      </span>
    )
  if (source === "changed")
    return (
      <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-500/30", className)}>
        <PencilLine className="size-3" />
        <Trans>Changed</Trans>
      </span>
    )
  if (!showAi) return null
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200", className)}>
      <Sparkles className="size-3" />
      <Trans>AI pick</Trans>
    </span>
  )
}

/** The cover in a fixed box, so the standing book can't push the layout when its image loads. */
export function CoverBox({ src, title, size = 260, glow = true }: { src?: string; title: string; size?: number; glow?: boolean }) {
  const [loaded, setLoaded] = useState<string>()
  useEffect(() => {
    if (!src) return
    const img = new Image()
    img.onload = () => setLoaded(src)
    img.src = src
  }, [src])
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ height: size + 20, width: size + 20 }}>
      {glow && <div aria-hidden className="absolute inset-6 rounded-full bg-brand-400/30 blur-3xl motion-reduce:hidden" />}
      {loaded ? (
        <div key={loaded} className="absolute inset-0 grid place-items-center animate-[am-fade-up_0.6s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
          <Book3D src={loaded} alt={title} height={size} maxWidth={size} settle />
        </div>
      ) : (
        <div aria-hidden className="absolute rounded-md bg-card/70 motion-safe:animate-pulse" style={{ height: size, width: Math.round(size * 0.72) }} />
      )}
    </div>
  )
}

/** Cover, a mid-book page for previews, page count and a display title for the current book. */
export function useBookFacts() {
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const label = useStore(form.store, (s) => s.values.label)
  const cover = useBookPages(file, { first: 1, count: 1, width: 900 })
  const title = label ? label.charAt(0).toUpperCase() + label.slice(1).replace(/[-_]+/g, " ") : ""
  return { file, title, cover: cover.pages[1], numPages: cover.numPages }
}

const EDITING_LABEL = msg`Editing Language`
const EDITING_HINT = msg`Leave empty to use the book language.`
const OUTPUT_LABEL = msg`Output Languages`
const OUTPUT_HINT = msg`Leave empty to output only in the book language.`

/** The real wizard's Project Name field, with the same validation (unique, slug-safe). */
export function NameField() {
  const form = useWizardForm()
  const { data: books } = useBooks()
  const existing = books?.map((b: { label: string }) => b.label) ?? []
  return (
    <form.Field name="label" validators={{ onChange: createProjectLabelSchema(existing) }}>
      {(field) => <ProjectNameField value={field.state.value} onChange={field.handleChange} onBlur={field.handleBlur} errors={field.state.meta.errors} />}
    </form.Field>
  )
}

/** The real wizard's Editing Language and Output Languages pickers (step 4), same labels and hints. */
export function LanguageFields({ only }: { only?: "editing" | "output" }) {
  const form = useWizardForm()
  const { i18n } = useLingui()
  const editingLanguage = useStore(form.store, (s) => s.values.editingLanguage)
  const outputLanguages = useStore(form.store, (s) => s.values.outputLanguages)
  const outputSet = new Set(outputLanguages.map(normalizeLocale))
  const toggle = (code: string) => {
    const n = normalizeLocale(code)
    form.setFieldValue("outputLanguages", outputSet.has(n) ? outputLanguages.filter((l) => normalizeLocale(l) !== n) : [...outputLanguages, code])
  }
  return (
    <>
      {only !== "output" && <LanguagePicker label={i18n._(EDITING_LABEL)} hint={i18n._(EDITING_HINT)} selected={editingLanguage} onSelect={(code) => form.setFieldValue("editingLanguage", code)} size="default" />}
      {only !== "editing" && <LanguagePicker label={i18n._(OUTPUT_LABEL)} hint={i18n._(OUTPUT_HINT)} selected={outputSet} onSelect={toggle} multiple size="default" />}
    </>
  )
}

/** Whether the book can be created (a valid, unique Project Name); `create` focuses the name field when it can't. */
export function useCreate(onCreate: () => void) {
  const form = useWizardForm()
  const { data: books } = useBooks()
  const label = useStore(form.store, (s) => s.values.label)
  const ok = createProjectLabelSchema(books?.map((b: { label: string }) => b.label) ?? []).safeParse(label).success
  return () => {
    if (ok) onCreate()
    else document.getElementById("wizard-project-name")?.focus()
  }
}

/** Content Processing as the preset set it: a compact, read-only list (changed in all settings). */
export function ProcessingList({ processing, className }: { processing: Processing[]; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-x-4 gap-y-1.5", className)}>
      {processing.map((p) => (
        <li key={p.key} className="flex items-center justify-between gap-2 text-[12.5px]">
          <span className="truncate text-muted-foreground">{p.label}</span>
          <span className={cn("inline-flex shrink-0 items-center gap-1 font-semibold", p.on ? "text-foreground" : "text-muted-foreground/70")}>
            <span className={cn("size-1.5 rounded-full", p.on ? "bg-emerald-500" : "bg-muted-foreground/40")} />
            {p.value}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AllSettingsLink({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-50", className)}>
      <Settings2 className="size-4" />
      <Trans>Open all settings</Trans>
    </button>
  )
}
