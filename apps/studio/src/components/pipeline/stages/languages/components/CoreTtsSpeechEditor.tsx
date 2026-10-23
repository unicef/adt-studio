import { OutputReview } from "../../../components/OutputReview"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  restoring = false,
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
  restoring?: boolean
  onEditingChange?: (id: string, language: string, editing: boolean) => void
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [editing, setEditingState] = useState(false)
  const editingRef = useRef(false)
  const setEditing = useCallback((next: boolean) => {
    editingRef.current = next
    setEditingState(next)
  }, [])
  const baseline = useRef({ baseVersion: version, sourceSignature, speechText: entry?.speechText })
  const hasPreparedText = !!entry?.speechText && (entry.changed || entry.generation.mode === "manual")
  const initialText = hasPreparedText ? (entry?.speechText ?? displayText) : displayText
  const [value, setValueState] = useState(initialText)
  const valueRef = useRef(initialText)
  const setValue = useCallback((next: string) => {
    valueRef.current = next
    setValueState(next)
  }, [])
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const scope = useMemo(() => ({ bookLabel, language, id: entry?.id }), [bookLabel, language, entry?.id])
  const scopeRef = useRef(scope)
  scopeRef.current = scope

  useEffect(() => {
    setEditing(false)
    savingRef.current = false
    setSaving(false)
  }, [scope, setEditing])

  useEffect(() => {
    if (!entry?.id || !onEditingChange) return
    onEditingChange(entry.id, language, editing || saving)
    return () => onEditingChange(entry.id, language, false)
  }, [entry?.id, language, editing, saving, onEditingChange])

  useEffect(() => {
    if (editingRef.current || savingRef.current) return
    baseline.current = { baseVersion: version, sourceSignature, speechText: entry?.speechText }
    setValue(initialText)
    setError(null)
  }, [entry?.generation.generatedAt, entry?.speechText, initialText, entry?.status, editing, saving, version, sourceSignature, scope, setValue])

  const save = async (forNavigation = false) => {
    if (restoring) throw new Error(t`Please wait for the current operation to finish`)
    if (savingRef.current) {
      if (forNavigation) throw new Error(t`A save is still in progress. Wait for it to finish before leaving.`)
      return
    }
    if (!entry) return
    const submittedText = valueRef.current
    if (!submittedText.trim() || submittedText === baseline.current.speechText) {
      setEditing(false)
      return
    }
    const submittedScope = scope
    const submittedBaseline = baseline.current
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const result = await api.updateCoreTtsEntry(bookLabel, language, entry.id, submittedText, submittedBaseline.baseVersion, submittedBaseline.sourceSignature)
      // Only our own acknowledgment advances the retained draft's guard.
      // Refetches or another entry's response must not certify a successor.
      if (scopeRef.current === submittedScope) {
        baseline.current = { ...submittedBaseline, baseVersion: result.version, speechText: submittedText }
        if (valueRef.current === submittedText) setEditing(false)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "text-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "tts"] }),
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "tts-timestamps"] }),
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "step-status"] }),
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "outputs"] }),
      ])
    } catch (err) {
      if (scopeRef.current === submittedScope) setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      if (scopeRef.current === submittedScope) {
        savingRef.current = false
        setSaving(false)
      }
    }
    if (forNavigation && scopeRef.current === submittedScope && editingRef.current) {
      const message = t`Newer edits are still unsaved. Save them before leaving.`
      setError(message)
      throw new Error(message)
    }
  }

  useFloatingSave({
    id: `speech-text:${language}:${entry?.id ?? "absent"}`,
    dirty: editing,
    saving,
    stage: "translate",
    label: t`Speech text`,
    onSave: () => save(),
    onSaveStay: () => save(true),
    onDiscard: () => { setValue(initialText); setEditing(false); setError(null) },
    saveDisabledReason: restoring ? t`Please wait for the current operation to finish` : !value.trim() ? t`Enter prepared speech text` : undefined,
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
            onChange={(event) => { if (!restoring) setValue(event.target.value) }}
            disabled={restoring}
            aria-label={t`Prepared speech text`}
            placeholder={t`Enter prepared speech text`}
            rows={2}
            className="w-full resize-y rounded border border-violet-200 bg-violet-50/30 px-2 py-1 text-xs leading-relaxed focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
          />
          <div className="flex items-center gap-1.5">
            <Button size="sm" className="h-6 px-2 text-[10px]" disabled={restoring || saving || !value.trim()} onClick={() => { void save().catch(() => {}) }}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {t`Save speech text`}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={restoring || saving} onClick={() => { if (restoring) return; setValue(initialText); setEditing(false); setError(null) }}>
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
              disabled={restoring}
              onClick={() => { if (!restoring) setEditing(true) }}
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
