import { OutputReview } from "../../../components/OutputReview"
import { useEffect, useState } from "react"
import { Loader2, Pencil, Save } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type CoreTtsCatalogEntry } from "@/api/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useFloatingSave } from "../../../components/floating-save"

const badgeClass =
  "ml-1.5 inline-flex rounded px-1 py-0.5 text-[9px] font-medium ring-1 ring-inset"

export function CoreTtsBadges({ entry }: { entry?: CoreTtsCatalogEntry }) {
  const { t } = useLingui()

  if (!entry) return null

  return (
    <>
      {entry.transformations.includes("latex-to-speech") ? (
        <span className={cn(badgeClass, "bg-violet-50 text-violet-700 ring-violet-200")}>{t`LaTeX converted`}</span>
      ) : null}
      {entry.transformations.includes("language-normalization") ? (
        <span className={cn(badgeClass, "bg-blue-50 text-blue-700 ring-blue-200")}>{t`Normalized`}</span>
      ) : null}
    </>
  )
}

export function CoreTtsSpeechEditor({
  bookLabel,
  language,
  displayText,
  entry,
  version,
  sourceSignature,
  showSpeechStatus = false,
  dirty = false,
  onEditingChange,
}: {
  bookLabel: string
  language: string
  displayText: string
  entry?: CoreTtsCatalogEntry
  version: number
  sourceSignature: string
  showSpeechStatus?: boolean
  dirty?: boolean
  onEditingChange?: (id: string, language: string, editing: boolean) => void
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [baseVersion, setBaseVersion] = useState(version)
  const [sourceBaseline, setSourceBaseline] = useState(sourceSignature)
  const hasPreparedText = !!entry?.speechText && (entry.changed || entry.generation.mode === "manual")
  const initialText = hasPreparedText ? (entry?.speechText ?? displayText) : displayText
  const [value, setValue] = useState(initialText)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entry?.id || !onEditingChange) return
    onEditingChange(entry.id, language, editing)
    return () => onEditingChange(entry.id, language, false)
  }, [entry?.id, language, editing, onEditingChange])

  useEffect(() => {
    if (editing) return
    setBaseVersion(version)
    setSourceBaseline(sourceSignature)
    setValue(initialText)
    setError(null)
  }, [entry?.generation.generatedAt, initialText, entry?.status, editing, version, sourceSignature])

  const save = async () => {
    if (!entry) return
    if (!value.trim() || value === entry.speechText) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.updateCoreTtsEntry(bookLabel, language, entry.id, value, baseVersion, sourceBaseline)
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
        queryClient.invalidateQueries({
          queryKey: ["books", bookLabel, "outputs"],
        }),
      ])
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      setSaving(false)
    }
  }

  useFloatingSave({
    id: `speech-text:${language}:${entry?.id ?? "absent"}`,
    dirty: editing,
    saving,
    stage: "translate",
    label: t`Speech text`,
    onSave: save,
    onSaveStay: save,
    onDiscard: () => { setValue(initialText); setEditing(false); setError(null) },
    saveDisabledReason: !value.trim() ? t`Enter prepared speech text` : undefined,
  })

  if (!entry) return null

  // A pass-through/fallback entry is not a separately prepared text. Editing
  // display text must not make its old copy suddenly appear as a speech area.
  const showPreparationReview = hasPreparedText || showSpeechStatus ||
    (entry.generation.mode === "generated" && entry.status === "failed")
  return (
    <div className={cn("mt-0.5", (hasPreparedText || editing) && "border-l-2 border-violet-200 pl-2")}>
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
            <Button size="sm" className="h-6 px-2 text-[10px]" disabled={saving || !value.trim()} onClick={() => { void save().catch(() => {}) }}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {t`Save speech text`}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={saving} onClick={() => { setValue(initialText); setEditing(false); setError(null) }}>
              {t`Cancel`}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {hasPreparedText && <p className="px-1 py-0.5 text-xs leading-relaxed text-violet-800">{entry.speechText}</p>}
          <div className="flex items-center justify-end gap-1">
            {showPreparationReview && <OutputReview bookLabel={bookLabel} id={entry.id} kinds={["preparation"]} language={language} dirty={dirty} description={entry.status === "failed" ? entry.failureReason : undefined} compact />}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-50 hover:bg-muted hover:text-violet-700 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={t`Edit speech text`}
              aria-label={t`Edit speech text`}
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
      {error ? <p className="mt-1 text-[10px] text-red-700">{error}</p> : null}
    </div>
  )
}
