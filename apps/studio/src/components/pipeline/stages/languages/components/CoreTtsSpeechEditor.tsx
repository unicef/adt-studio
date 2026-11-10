import { useEffect, useState } from "react"
import { Loader2, Pencil, Save } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type CoreTtsCatalogEntry } from "@/api/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const badgeClass =
  "ml-1.5 inline-flex rounded px-1 py-0.5 text-[9px] font-medium ring-1 ring-inset"

const quietBadgeClass =
  "inline-flex items-center rounded-full border bg-transparent px-2 py-0.5 text-[10.5px] font-normal text-muted-foreground"

export function CoreTtsBadges({ entry, quiet = false }: { entry?: CoreTtsCatalogEntry; quiet?: boolean }) {
  const { t } = useLingui()

  if (!entry) return null

  if (quiet) {
    return (
      <>
        {entry.transformations.includes("latex-to-speech") ? <span className={quietBadgeClass}>{t`Math read as words`}</span> : null}
        {entry.transformations.includes("language-normalization") ? <span className={quietBadgeClass}>{t`Adjusted for speech`}</span> : null}
        {entry.status === "failed" ? <span className={cn(quietBadgeClass, "border-destructive/40 text-destructive")}>{t`Couldn't prepare`}</span> : null}
        {entry.generation.mode === "manual" ? <span className={quietBadgeClass}>{t`Edited by you`}</span> : null}
      </>
    )
  }

  return (
    <>
      {entry.transformations.includes("latex-to-speech") ? (
        <span className={cn(badgeClass, "bg-violet-50 text-violet-700 ring-violet-200")}>{t`LaTeX converted`}</span>
      ) : null}
      {entry.transformations.includes("language-normalization") ? (
        <span className={cn(badgeClass, "bg-blue-50 text-blue-700 ring-blue-200")}>{t`Normalized`}</span>
      ) : null}
      {entry.status === "failed" ? (
        <span className={cn(badgeClass, "bg-red-50 text-red-700 ring-red-200")}>{t`Failed`}</span>
      ) : null}
      {entry.generation.mode === "manual" ? (
        <span className={cn(badgeClass, "bg-amber-50 text-amber-700 ring-amber-200")}>{t`Manually edited`}</span>
      ) : null}
    </>
  )
}

export function CoreTtsSpeechEditor({
  bookLabel,
  language,
  displayText,
  entry,
  accent,
  editing: controlledEditing,
  onEditingChange,
  disabled = false,
}: {
  bookLabel: string
  language: string
  displayText: string
  entry?: CoreTtsCatalogEntry
  accent?: string
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  disabled?: boolean
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [ownEditing, setOwnEditing] = useState(entry?.status === "failed")
  const editing = (controlledEditing ?? ownEditing) && !disabled
  const setEditing = (next: boolean) => {
    setOwnEditing(next)
    onEditingChange?.(next)
  }
  const [value, setValue] = useState(entry?.speechText ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(entry?.speechText ?? "")
    setOwnEditing(entry?.status === "failed")
    setError(null)
  }, [entry?.generation.generatedAt, entry?.speechText, entry?.status])

  if (!entry) return null

  const save = async () => {
    if (!value.trim() || value === entry.speechText) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.updateCoreTtsEntry(bookLabel, language, entry.id, value)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "text-catalog"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "tts"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "tts-timestamps"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "step-status"],
        }),
      ])
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const speechDiffers =
    entry.speechText !== null && entry.speechText !== displayText

  if (accent) {
    return (
      <AccentSpeechEditor
        entry={entry}
        accent={accent}
        editing={editing}
        speechDiffers={speechDiffers}
        value={value}
        saving={saving}
        error={error}
        disabled={disabled}
        onChange={setValue}
        onEdit={() => setEditing(true)}
        onSave={() => void save()}
        onCancel={() => {
          setValue(entry.speechText ?? "")
          setEditing(false)
          setError(null)
        }}
      />
    )
  }

  if (!editing && !speechDiffers && entry.status !== "failed") {
    return (
      <div className="relative h-0">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute -top-5 right-0 inline-flex h-5 w-5 items-center justify-center rounded text-violet-600 opacity-0 transition-opacity hover:bg-violet-50 hover:opacity-100 focus:opacity-100 group-hover:opacity-60"
          title={t`Edit speech text`}
          aria-label={t`Edit speech text`}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="mt-0.5 border-l-2 border-violet-200 pl-2">
      {entry.status === "failed" && entry.failureReason ? (
        <p className="mb-1 text-[11px] text-red-700">{entry.failureReason}</p>
      ) : null}
      {editing ? (
        <div className="space-y-1">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={t`Prepared speech text`}
            placeholder={t`Enter prepared speech text`}
            rows={2}
            className="w-full resize-y rounded border border-violet-200 bg-violet-50/30 px-2 py-1 text-xs leading-relaxed focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
          />
          <div className="flex items-center gap-1.5">
            <Button size="sm" className="h-6 px-2 text-[10px]" disabled={saving || !value.trim()} onClick={() => void save()}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {t`Save speech text`}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={saving} onClick={() => { setValue(entry.speechText ?? ""); setEditing(false); setError(null) }}>
              {t`Cancel`}
            </Button>
          </div>
        </div>
      ) : speechDiffers && entry.speechText !== null ? (
        <div className="flex items-start gap-1">
          <button type="button" onClick={() => setEditing(true)} className="block min-w-0 flex-1 rounded px-1 py-0.5 text-left text-xs leading-relaxed text-violet-800 hover:bg-violet-50" title={t`Edit speech text`}>
            {entry.speechText}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-violet-600 opacity-50 hover:bg-violet-50 hover:opacity-100"
            title={t`Edit speech text`}
            aria-label={t`Edit speech text`}
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex h-5 w-5 items-center justify-center rounded text-violet-600 hover:bg-violet-50" title={t`Edit speech text`} aria-label={t`Edit speech text`}>
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {error ? <p className="mt-1 text-[10px] text-red-700">{error}</p> : null}
    </div>
  )
}

function AccentSpeechEditor({
  entry,
  accent,
  editing,
  speechDiffers,
  value,
  saving,
  error,
  disabled,
  onChange,
  onEdit,
  onSave,
  onCancel,
}: {
  entry: CoreTtsCatalogEntry
  accent: string
  editing: boolean
  speechDiffers: boolean
  value: string
  saving: boolean
  error: string | null
  disabled: boolean
  onChange: (value: string) => void
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
}) {
  const { t } = useLingui()
  const failed = entry.status === "failed"
  if (!editing && !speechDiffers && !failed && !error) return null
  return (
    <div
      className="mt-1 border-l-2 pl-2.5 animate-in fade-in duration-200 motion-reduce:animate-none"
      style={{ borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`, ["--speech-accent" as string]: accent }}
    >
      {failed && entry.failureReason ? <p className="mb-1 text-[12px] leading-snug text-destructive">{entry.failureReason}</p> : null}
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                onCancel()
              }
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                onSave()
              }
            }}
            autoFocus
            aria-label={t`What is read aloud`}
            placeholder={t`Write the words the voice should say`}
            rows={2}
            className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-[12.5px] leading-relaxed text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color-mix(in_srgb,var(--speech-accent)_55%,transparent)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--speech-accent)_18%,transparent)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving || !value.trim()}
              onClick={onSave}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-45"
              style={{ backgroundColor: accent }}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {t`Save what is read`}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onCancel}
              className="inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-45"
            >
              {t`Cancel`}
            </button>
          </div>
        </div>
      ) : entry.speechText !== null && speechDiffers ? (
        <button
          type="button"
          onClick={disabled ? undefined : onEdit}
          aria-disabled={disabled || undefined}
          title={t`Edit what is read aloud`}
          className="group/speech flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left text-[12.5px] leading-relaxed text-muted-foreground transition-colors hover:bg-muted aria-disabled:cursor-default aria-disabled:hover:bg-transparent"
        >
          <span className="sr-only">{t`Read aloud as:`}</span>
          <span className="min-w-0 flex-1">{entry.speechText}</span>
          {!disabled && <Pencil className="mt-1 size-3 shrink-0 opacity-0 transition-opacity group-hover/speech:opacity-100 group-focus-visible/speech:opacity-100" />}
        </button>
      ) : null}
      {error ? <p className="mt-1 text-[12px] text-destructive">{error}</p> : null}
    </div>
  )
}
