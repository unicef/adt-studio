import { useEffect, useState } from "react"
import { Loader2, Save } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api, type CoreTtsCatalogEntry } from "@/api/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CoreTtsSpeechEditor({
  bookLabel,
  language,
  displayText,
  entry,
}: {
  bookLabel: string
  language: string
  displayText: string
  entry?: CoreTtsCatalogEntry
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(entry?.status === "failed")
  const [value, setValue] = useState(entry?.speechText ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setValue(entry?.speechText ?? "")
    setEditing(entry?.status === "failed")
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
      ])
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const badgeClass =
    "rounded px-1.5 py-0.5 text-[9px] font-medium ring-1 ring-inset"
  const hasBadges =
    entry.transformations.length > 0 ||
    entry.status === "failed" ||
    entry.generation.mode === "manual"
  const speechDiffers =
    entry.speechText !== null && entry.speechText !== displayText

  return (
    <div className="mt-1.5 border-l-2 border-violet-200 pl-2">
      {hasBadges ? (
        <div className="mb-1 flex flex-wrap gap-1">
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
        </div>
      ) : null}
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
        <button type="button" onClick={() => setEditing(true)} className="block w-full rounded px-1 py-0.5 text-left text-xs leading-relaxed text-violet-800 hover:bg-violet-50" title={t`Edit speech text`}>
          {entry.speechText}
        </button>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="text-[10px] font-medium text-violet-600 hover:text-violet-800">
          {t`Edit speech text`}
        </button>
      )}
      {error ? <p className="mt-1 text-[10px] text-red-700">{error}</p> : null}
    </div>
  )
}
