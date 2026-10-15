import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import type { BookPreviewFrameHandle } from "@/components/pipeline/stages/storyboard/components/BookPreviewFrame"
import { toast } from "@/components/ui/sonner"
import { usePage } from "@/hooks/use-pages"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"

export interface CanvasSelection {
  sectionIndex: number
  dataId: string
  tagName?: string
}

interface CanvasEditingValue {
  enabled: boolean
  pageId: string | null
  selection: CanvasSelection | null
  select: (selection: CanvasSelection | null) => void
  registerFrame: (sectionIndex: number, handle: BookPreviewFrameHandle | null) => void
  frame: (sectionIndex: number) => BookPreviewFrameHandle | null
  recordEdit: (sectionIndex: number, html: string) => void
  dirty: boolean
  saving: boolean
  save: () => Promise<void>
  discard: () => void
}

const DISABLED: CanvasEditingValue = {
  enabled: false,
  pageId: null,
  selection: null,
  select: () => {},
  registerFrame: () => {},
  frame: () => null,
  recordEdit: () => {},
  dirty: false,
  saving: false,
  save: async () => {},
  discard: () => {},
}

const CanvasEditingContext = createContext<CanvasEditingValue>(DISABLED)

export function useCanvasEditing(): CanvasEditingValue {
  return useContext(CanvasEditingContext)
}

function stripTransientIds(html: string): string {
  return html.replace(/\s+data-id="_el\d+"/g, "")
}

export function CanvasEditingProvider({
  label,
  pageId,
  enabled,
  children,
}: {
  label: string
  pageId: string | null
  enabled: boolean
  children: React.ReactNode
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const page = usePage(label, pageId ?? "")
  const [selection, setSelection] = useState<CanvasSelection | null>(null)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState(false)
  const frames = useRef(new Map<number, BookPreviewFrameHandle>())
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const pageRef = useRef({ pageId, rendering: page.data?.rendering ?? null })
  pageRef.current = { pageId, rendering: page.data?.rendering ?? null }

  const persist = useCallback(
    async (targetPageId: string | null, pending: Record<number, string>, silent: boolean) => {
      const rendering = pageRef.current.pageId === targetPageId ? pageRef.current.rendering : null
      if (!targetPageId || !rendering || Object.keys(pending).length === 0) return
      setSaving(true)
      try {
        await api.saveStoryboard(label, targetPageId, {
          rendering: {
            ...rendering,
            sections: rendering.sections.map((section) =>
              pending[section.sectionIndex] === undefined
                ? section
                : { ...section, html: stripTransientIds(pending[section.sectionIndex]) },
            ),
          },
        })
        await queryClient.invalidateQueries({ queryKey: ["books", label, "pages", targetPageId] })
        await queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
        invalidateStoryboardDependents(queryClient, label)
        if (silent) toast.success(t`Style changes saved as a new version.`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t`Saving the style changes failed.`)
      } finally {
        setSaving(false)
      }
    },
    [label, queryClient, t],
  )

  const previousPage = useRef(pageId)
  useEffect(() => {
    if (previousPage.current === pageId) return
    const leaving = previousPage.current
    const pending = draftsRef.current
    previousPage.current = pageId
    setSelection(null)
    setDrafts({})
    if (Object.keys(pending).length > 0) void persist(leaving, pending, true)
  }, [pageId, persist])

  useEffect(() => {
    if (!enabled) setSelection(null)
  }, [enabled])

  const value = useMemo<CanvasEditingValue>(
    () => ({
      enabled,
      pageId,
      selection,
      select: setSelection,
      registerFrame: (sectionIndex, handle) => {
        if (handle) frames.current.set(sectionIndex, handle)
        else frames.current.delete(sectionIndex)
      },
      frame: (sectionIndex) => frames.current.get(sectionIndex) ?? null,
      recordEdit: (sectionIndex, html) => setDrafts((previous) => ({ ...previous, [sectionIndex]: html })),
      dirty: Object.keys(drafts).length > 0,
      saving,
      save: async () => {
        const pending = draftsRef.current
        await persist(pageId, pending, false)
        setDrafts({})
      },
      discard: () => {
        for (const sectionIndex of Object.keys(draftsRef.current)) {
          frames.current.get(Number(sectionIndex))?.resetContent()
        }
        setDrafts({})
        setSelection(null)
      },
    }),
    [enabled, pageId, selection, drafts, saving, persist],
  )

  return <CanvasEditingContext value={enabled ? value : DISABLED}>{children}</CanvasEditingContext>
}
