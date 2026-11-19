import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Save } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { api, apiErrorStatus } from "@/api/client"
import { Button } from "@/components/ui/button"
import { VersionPicker } from "@/components/pipeline/components/VersionPicker"
import { useElementContext } from "../element-context"

interface AudioSectionProps {
  dataId: string
  /** Page whose storyboard selection owns this inspector. */
  pageId: string
}

/**
 * Authored per-element spoken script (SPEC-0014). Saves immediately - it is
 * not part of the storyboard's floating-save draft. The artifact is keyed by
 * the page that authored each script, so an image moved to another page still
 * resolves its entry through `sourcePageId`.
 */
export function AudioSection({ dataId, pageId }: AudioSectionProps) {
  const { t } = useLingui()
  const { bookLabel } = useElementContext()
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => ["books", bookLabel, "element-audio", pageId] as const,
    [bookLabel, pageId],
  )
  const query = useQuery({
    queryKey,
    queryFn: () => api.getElementAudio(bookLabel!, pageId),
    enabled: !!bookLabel,
    staleTime: Infinity,
  })

  const entry = query.data?.entries.find((candidate) => candidate.nodeId === dataId)
  const sourcePageId = entry?.sourcePageId ?? pageId
  const version = query.data?.versions[sourcePageId]
  const savedText = entry?.text ?? ""

  // Surface a failed Speech Preparation: `getReadyCoreTtsEntries` omits failed
  // entries, so without this badge the authored script would silently produce
  // no audio. Check every language scope: a failed translation also matters.
  const catalogQuery = useQuery({
    queryKey: ["books", bookLabel, "text-catalog"],
    queryFn: () => api.getTextCatalog(bookLabel!),
    enabled: !!bookLabel,
    staleTime: 30_000,
  })
  const preparationFailure = useMemo(() => {
    const id = `${dataId}_audio`
    for (const scope of Object.values(catalogQuery.data?.speechTexts ?? {})) {
      const speech = scope.entries.find((candidate) => candidate.id === id)
      if (speech?.status === "failed") return speech.failureReason ?? true
    }
    return undefined
  }, [catalogQuery.data?.speechTexts, dataId])

  const [value, setValue] = useState(savedText)
  const [baseline, setBaseline] = useState(savedText)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A 409 means the stored row moved: only then does Retry reload (discarding
  // the draft). Any other failure retries the save with the draft intact.
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState(false)
  const draftRef = useRef({ dataId, dirty: false, versions: query.data?.versions ?? {} })
  const valueRef = useRef(value)
  valueRef.current = value
  const baselineRef = useRef(baseline)
  baselineRef.current = baseline
  // Unsaved drafts survive switching to another element in the same panel.
  const draftsRef = useRef(
    new Map<string, { value: string; baseline: string; versions: Record<string, number> }>(),
  )
  // The versions map the draft is based on. A background refetch must not
  // advance it under an unsaved draft, or the save would silently overwrite
  // another writer's change instead of letting the server return 409.
  const versionsRef = useRef(query.data?.versions ?? {})
  const latestVersionsRef = useRef(query.data?.versions ?? {})
  latestVersionsRef.current = query.data?.versions ?? {}
  useEffect(() => {
    if (draftRef.current.dirty) return
    versionsRef.current = latestVersionsRef.current
  }, [dataId, query.data?.versions])

  useEffect(() => {
    // Adopt the stored script when the selection changes or while the author
    // has no unsaved draft. A refetch must never overwrite typing. `saved` is
    // deliberately left to the save/discard handlers: this effect also runs
    // for the save's own cache update.
    const previous = draftRef.current
    if (previous.dataId !== dataId) {
      if (previous.dirty) {
        draftsRef.current.set(previous.dataId, {
          value: valueRef.current,
          baseline: baselineRef.current,
          versions: previous.versions,
        })
      }
      const stored = draftsRef.current.get(dataId)
      if (stored) {
        draftRef.current = {
          dataId,
          dirty: stored.value !== stored.baseline,
          versions: stored.versions,
        }
        versionsRef.current = stored.versions
        setValue(stored.value)
        setBaseline(stored.baseline)
        setSaved(false)
        setError(null)
        return
      }
      versionsRef.current = latestVersionsRef.current
      setSaved(false)
    } else if (previous.dirty) {
      return
    }
    draftRef.current = { dataId, dirty: false, versions: latestVersionsRef.current }
    setValue(savedText)
    setBaseline(savedText)
    setError(null)
  }, [dataId, savedText])

  const dirty = value !== baseline

  const updateValue = (next: string) => {
    const wasDirty = draftRef.current.dirty
    draftRef.current = {
      dataId,
      dirty: next !== baseline,
      // Snapshot the base map when the draft starts, not when it is stored on
      // a selection change: a background refetch must not re-base an open draft.
      versions: wasDirty ? draftRef.current.versions : { ...versionsRef.current },
    }
    setValue(next)
    setSaved(false)
    setError(null)
    setConflict(false)
  }

  const discard = () => {
    draftRef.current = { dataId, dirty: false, versions: latestVersionsRef.current }
    draftsRef.current.delete(dataId)
    versionsRef.current = latestVersionsRef.current
    setValue(baseline)
    setSaved(false)
    setError(null)
    setConflict(false)
  }

  const save = async () => {
    if (!bookLabel || saving || restoring || !dirty) return
    setSaving(true)
    setError(null)
    setConflict(false)
    setSaved(false)
    try {
      const view = await api.updateElementAudio(bookLabel, pageId, {
        versions: versionsRef.current,
        entries: [{ nodeId: dataId, text: value, sourcePageId }],
      })
      queryClient.setQueryData(queryKey, view)
      versionsRef.current = view.versions
      draftsRef.current.delete(dataId)
      draftRef.current = { dataId, dirty: false, versions: view.versions }
      setBaseline(value)
      setSaved(true)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "text-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "outputs"] }),
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "pages"] }),
        queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "step-status"] }),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setConflict(apiErrorStatus(err) === 409)
    } finally {
      setSaving(false)
    }
  }

  const reload = async () => {
    const result = await query.refetch()
    const fresh = result.data
    if (!fresh) return
    const freshText = fresh.entries.find((candidate) => candidate.nodeId === dataId)?.text ?? ""
    versionsRef.current = fresh.versions
    latestVersionsRef.current = fresh.versions
    draftRef.current = { dataId, dirty: false, versions: fresh.versions }
    draftsRef.current.delete(dataId)
    setValue(freshText)
    setBaseline(freshText)
    setSaved(false)
    setError(null)
    setConflict(false)
  }

  if (!bookLabel) return null

  return (
    <section className="border-b py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium text-foreground">
          {t`Element audio`}
        </h3>
        <div className="flex items-center gap-1.5">
          {preparationFailure ? (
            <span
              title={typeof preparationFailure === "string" ? preparationFailure : undefined}
              className="rounded bg-red-50 px-1 py-0.5 text-[9px] font-medium text-red-700 ring-1 ring-inset ring-red-200"
            >
              {t`Preparation failed`}
            </span>
          ) : null}
          <VersionPicker
            step="element-audio"
            itemId={sourcePageId}
            currentVersion={version ?? null}
            saving={saving}
            dirty={dirty}
            bookLabel={bookLabel}
            renderSaveBar={false}
            onSave={save}
            onSaveStay={save}
            onDiscard={discard}
            onRestoringChange={setRestoring}
            onRestored={() => {
              draftRef.current = { dataId, dirty: false, versions: versionsRef.current }
              void queryClient.invalidateQueries({ queryKey })
              void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "text-catalog"] })
              void queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "outputs"] })
            }}
          />
        </div>
      </div>
      <p className="text-[10.5px] leading-snug text-muted-foreground">
        {t`Write what this image should say when the reader taps it. Leave empty to remove the audio.`}
      </p>

      {query.isError ? (
        <div className="flex items-center justify-between gap-2 text-[10px] text-red-700">
          <span>{t`Couldn't load the element audio.`}</span>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="rounded px-1.5 py-0.5 font-medium hover:bg-accent cursor-pointer"
          >
            {t`Retry`}
          </button>
        </div>
      ) : query.isLoading ? (
        <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t`Loading...`}
        </div>
      ) : (
        <>
          <textarea
            value={value}
            onChange={(event) => updateValue(event.target.value)}
            disabled={saving || restoring}
            aria-label={t`Element audio script`}
            placeholder={t`Type what the reader should hear`}
            rows={3}
            className="w-full resize-y rounded border bg-background px-2 py-1.5 text-xs leading-relaxed focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-6 px-2 text-[10px]"
              disabled={saving || restoring || !dirty}
              onClick={() => void save()}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saving ? t`Saving...` : t`Save`}
            </Button>
            {saved && !dirty ? (
              <span className="text-[10px] font-medium text-emerald-600">{t`Saved`}</span>
            ) : null}
            {dirty && !saving ? (
              <button
                type="button"
                onClick={discard}
                disabled={restoring}
                className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
              >
                {t`Discard`}
              </button>
            ) : null}
          </div>
        </>
      )}
      {error ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void (conflict ? reload() : save())}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
          >
            {t`Retry`}
          </button>
        </div>
      ) : null}
    </section>
  )
}
