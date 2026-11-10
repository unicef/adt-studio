import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import type { StageName } from "@adt/types"
import { useFloatingSave, type FloatingSaveScope } from "@/components/pipeline/components/floating-save"
import {
  stableEqual,
  usePendingChanges,
  type ChangeKind,
  type EntityNoun,
} from "@/components/pipeline/components/change-summary"
import { useDownstreamWithOutput } from "@/hooks/use-downstream-with-output"
import type { DraftPersistence } from "./pageview/draftStore"

export type ItemPatch<TItem> = Partial<TItem> | ((item: TItem) => TItem)

export interface DocumentEditsOptions<TDoc, TItem> {
  id: string
  stage: StageName
  doc: TDoc | null | undefined
  versionKey: string
  getItems: (doc: TDoc) => TItem[]
  setItems: (doc: TDoc, items: TItem[]) => TDoc
  keyOf: (item: TItem) => string
  isEqual?: (a: TItem, b: TItem) => boolean
  classifyChanged?: (before: TItem, after: TItem) => ChangeKind
  noun: EntityNoun
  save: (next: TDoc) => Promise<unknown>
  afterSave?: () => Promise<unknown> | void
  locked?: boolean
  lockedReason?: string
  scope?: FloatingSaveScope
  accent?: string
  autoSave?: boolean
  keepDraft?: DraftPersistence<TItem>
}

export interface DocumentEdits<TItem> {
  items: TItem[]
  dirty: boolean
  saving: boolean
  saveError: Error | null
  editedKeys: ReadonlySet<string>
  update: (key: string, patch: ItemPatch<TItem>) => void
  insert: (item: TItem, afterKey: string | null) => void
  remove: (key: string) => void
  discard: () => void
  save: () => Promise<void>
}

const NO_KEYS: ReadonlySet<string> = new Set()

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function applyPatch<TItem>(item: TItem, patch: ItemPatch<TItem>): TItem {
  return typeof patch === "function" ? patch(item) : { ...item, ...patch }
}

export function useDocumentEdits<TDoc, TItem>({
  id,
  stage,
  doc,
  versionKey,
  getItems,
  setItems,
  keyOf,
  isEqual = stableEqual,
  classifyChanged,
  noun,
  save: persist,
  afterSave,
  locked = false,
  lockedReason,
  scope,
  keepDraft,
  accent,
  autoSave = false,
}: DocumentEditsOptions<TDoc, TItem>): DocumentEdits<TItem> {
  const { t } = useLingui()
  const resetStages = useDownstreamWithOutput(stage)
  const [draft, setDraft] = useState<TItem[] | null>(() => keepDraft?.read() ?? null)
  const keepDraftRef = useRef(keepDraft)
  keepDraftRef.current = keepDraft
  useEffect(() => {
    keepDraftRef.current?.write(draft)
  }, [draft])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const [savedBase, setSavedBase] = useState<TItem[] | null>(null)
  const inFlight = useRef<TItem[] | null>(null)
  const lastSaved = useRef<TItem[] | null>(null)
  const changedRef = useRef(false)

  const [lastVersionKey, setLastVersionKey] = useState(versionKey)
  if (lastVersionKey !== versionKey) {
    setLastVersionKey(versionKey)
    setSavedBase(null)
    if (draft === null || draft === inFlight.current || draft === lastSaved.current || !changedRef.current) {
      setDraft(null)
      setSaveError(null)
    }
  }

  const keepKey = keepDraft?.key ?? null
  const [restoredFrom, setRestoredFrom] = useState(keepKey)
  if (restoredFrom !== keepKey) {
    setRestoredFrom(keepKey)
    const saved = draft === null ? (keepDraft?.read() ?? null) : null
    if (saved) setDraft(saved)
  }

  const docItems = useMemo(() => (doc ? getItems(doc) : []), [doc, getItems])
  const serverItems = savedBase ?? docItems
  const versionRef = useRef(versionKey)
  versionRef.current = versionKey
  const serverRef = useRef(serverItems)
  serverRef.current = serverItems
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  const draftRef = useRef(draft)
  draftRef.current = draft

  const items = draft ?? serverItems

  const { label, labelKey, hasChanges } = usePendingChanges({
    prev: serverItems,
    next: draft,
    keyOf,
    isEqual,
    classifyChanged,
    noun,
  })
  const dirty = draft !== null && hasChanges
  changedRef.current = dirty
  if (draft !== null && !hasChanges && !saving) setDraft(null)

  const editedKeys = useMemo(() => {
    if (!draft) return NO_KEYS
    const before = new Map(serverItems.map((item) => [keyOf(item), item]))
    const keys = new Set<string>()
    for (const item of draft) {
      const key = keyOf(item)
      const original = before.get(key)
      if (!original || !isEqual(original, item)) keys.add(key)
    }
    return keys
  }, [draft, serverItems, keyOf, isEqual])

  const mutate = useCallback((apply: (items: TItem[]) => TItem[]) => {
    if (lockedRef.current) return
    setDraft((previous) => apply(previous ?? serverRef.current))
  }, [])

  const update = useCallback(
    (key: string, patch: ItemPatch<TItem>) =>
      mutate((list) => list.map((item) => (keyOf(item) === key ? applyPatch(item, patch) : item))),
    [mutate, keyOf],
  )

  const insert = useCallback(
    (item: TItem, afterKey: string | null) => {
      const key = keyOf(item)
      const current = draftRef.current ?? serverRef.current
      if (current.some((entry) => keyOf(entry) === key)) {
        if (import.meta.env.DEV) console.error(`useDocumentEdits: duplicate key "${key}" inserted`)
        return
      }
      mutate((list) => {
        const index = afterKey === null ? -1 : list.findIndex((entry) => keyOf(entry) === afterKey)
        if (index < 0) return [...list, item]
        return [...list.slice(0, index + 1), item, ...list.slice(index + 1)]
      })
    },
    [mutate, keyOf],
  )

  const remove = useCallback(
    (key: string) => mutate((list) => list.filter((item) => keyOf(item) !== key)),
    [mutate, keyOf],
  )

  const discard = useCallback(() => {
    setDraft(null)
    setSaveError(null)
  }, [])

  const docRef = useRef(doc)
  docRef.current = doc

  const saveOnce = useCallback(
    async (pending: TItem[]) => {
      const base = docRef.current
      if (!base) return
      inFlight.current = pending
      const startedOn = versionRef.current
      setSaving(true)
      setSaveError(null)
      try {
        await persist(setItems(base, pending))
        lastSaved.current = pending
        await afterSave?.()
        if (versionRef.current === startedOn) setSavedBase(pending)
        setDraft((current) => (current === pending ? null : current))
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error))
        setSaveError(failure)
        throw failure
      } finally {
        inFlight.current = null
        setSaving(false)
      }
    },
    [persist, setItems, afterSave],
  )

  const chain = useRef<Promise<void> | null>(null)
  const save = useCallback((): Promise<void> => {
    const previous = chain.current
    const start = (): Promise<void> => {
      const pending = draftRef.current
      if (!pending || pending === lastSaved.current) return Promise.resolve()
      return saveOnce(pending)
    }
    const run = previous ? previous.catch(() => undefined).then(nextTick).then(start) : start()
    chain.current = run
    run
      .catch(() => undefined)
      .finally(() => {
        if (chain.current === run) chain.current = null
      })
    return run
  }, [saveOnce])

  useEffect(() => {
    if (!autoSave || !dirty || saving || locked || saveError) return
    const timer = setTimeout(() => void save().catch(() => undefined), 120)
    return () => clearTimeout(timer)
  }, [autoSave, dirty, saving, locked, saveError, draft, save])

  useFloatingSave({
    id,
    stage,
    resetStages,
    dirty: autoSave ? dirty && saveError !== null : dirty,
    saving,
    label,
    labelKey,
    onSave: save,
    onSaveStay: save,
    onDiscard: discard,
    saveDisabledReason: locked ? (lockedReason ?? t`Editing is paused while this stage runs.`) : undefined,
    scope,
    accent,
  })

  return { items, dirty, saving, saveError, editedKeys, update, insert, remove, discard, save }
}
