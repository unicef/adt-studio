import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import type { BookPreviewFrameHandle } from "@/components/pipeline/stages/storyboard/components/BookPreviewFrame"
import { toast } from "@/components/ui/sonner"
import { useApiKey, useBookStructuredTextAvailability } from "@/hooks/use-api-key"
import { pageQueryOptions, usePage } from "@/hooks/use-pages"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { nextPendingSectioning, planRerender, type SectioningTree } from "./sectioningDraft"

export interface CanvasSelection {
  sectionIndex: number
  dataId: string
  tagName?: string
}

interface CanvasEditingValue {
  enabled: boolean
  pageId: string | null
  locked: boolean
  selection: CanvasSelection | null
  select: (selection: CanvasSelection | null) => void
  focusedSection: number | null
  focusSection: (sectionIndex: number | null) => void
  registerFrame: (sectionIndex: number, handle: BookPreviewFrameHandle | null) => void
  frame: (sectionIndex: number) => BookPreviewFrameHandle | null
  recordEdit: (sectionIndex: number, html: string, options?: { reload?: boolean }) => void
  sectionHtml: (sectionIndex: number) => string | undefined
  sourceOverride: (sectionIndex: number) => string | undefined
  pendingSectioning: SectioningTree | null
  togglePruned: (sectionIndex: number) => void
  dirty: boolean
  saving: boolean
  save: () => Promise<void>
  discard: () => void
}

const DISABLED: CanvasEditingValue = {
  enabled: false,
  pageId: null,
  locked: false,
  selection: null,
  select: () => {},
  focusedSection: null,
  focusSection: () => {},
  registerFrame: () => {},
  frame: () => null,
  recordEdit: () => {},
  sectionHtml: () => undefined,
  sourceOverride: () => undefined,
  pendingSectioning: null,
  togglePruned: () => {},
  dirty: false,
  saving: false,
  save: async () => {},
  discard: () => {},
}

const CanvasEditingContext = createContext<CanvasEditingValue>(DISABLED)

export function useCanvasEditing(): CanvasEditingValue {
  return useContext(CanvasEditingContext)
}

export function stripTransientIds(html: string): string {
  return html.replace(/\s+data-id="_el\d+"/g, "")
}

interface PendingChanges {
  drafts: Record<number, string>
  sectioning: SectioningTree | null
}

function hasChanges({ drafts, sectioning }: PendingChanges): boolean {
  return Object.keys(drafts).length > 0 || sectioning !== null
}

export function CanvasEditingProvider({
  label,
  pageId,
  enabled,
  locked = false,
  children,
}: {
  label: string
  pageId: string | null
  enabled: boolean
  locked?: boolean
  children: React.ReactNode
}) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const page = usePage(label, pageId ?? "")
  const { apiKey } = useApiKey()
  const canRender = useBookStructuredTextAvailability(label)
  const [selection, setSelection] = useState<CanvasSelection | null>(null)
  const [focusedSection, setFocusedSection] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [overrides, setOverrides] = useState<Record<number, string>>({})
  const [pendingSectioning, setPendingSectioning] = useState<SectioningTree | null>(null)
  const [saving, setSaving] = useState(false)
  const frames = useRef(new Map<number, BookPreviewFrameHandle>())
  const pendingRef = useRef<PendingChanges>({ drafts, sectioning: pendingSectioning })
  pendingRef.current = { drafts, sectioning: pendingSectioning }
  const renderRef = useRef({ apiKey, canRender })
  renderRef.current = { apiKey, canRender }

  const persist = useCallback(
    async (targetPageId: string | null, pending: PendingChanges, silent: boolean): Promise<boolean> => {
      if (!targetPageId || !hasChanges(pending)) return true
      const detail = queryClient.getQueryData(pageQueryOptions(label, targetPageId).queryKey)
      if (!detail) return false
      const rendering = detail.rendering
      const editsHtml = Object.keys(pending.drafts).length > 0 && !!rendering
      const plan = pending.sectioning
        ? planRerender(detail.sectioningTree, pending.sectioning, rendering?.sections, renderRef.current.canRender)
        : null
      setSaving(true)
      try {
        await api.saveStoryboard(label, targetPageId, {
          ...(pending.sectioning && plan ? { sectioning: pending.sectioning, renderingInSync: plan.renderingInSync } : {}),
          ...(editsHtml
            ? {
                rendering: {
                  ...rendering,
                  sections: rendering.sections.map((section) =>
                    pending.drafts[section.sectionIndex] === undefined
                      ? section
                      : { ...section, html: stripTransientIds(pending.drafts[section.sectionIndex]) },
                  ),
                },
              }
            : {}),
        })
        await queryClient.invalidateQueries({ queryKey: ["books", label, "pages", targetPageId] })
        await queryClient.invalidateQueries({ queryKey: ["books", label, "pages"] })
        invalidateStoryboardDependents(queryClient, label)
        if (silent) {
          toast.success(pending.sectioning ? t`Page changes saved as a new version.` : t`Style changes saved as a new version.`)
        }
        if (plan && plan.rerender.length > 0) {
          const { apiKey: key } = renderRef.current
          void (async () => {
            for (const sectionIndex of plan.rerender) {
              const failed = await api
                .reRenderPage(label, targetPageId, key, sectionIndex)
                .then(() => false)
                .catch((err: unknown) => {
                  toast.error(err instanceof Error ? err.message : t`Re-render failed`)
                  return true
                })
              if (!failed) continue
              await api
                .saveStoryboard(label, targetPageId, { sectioning: pending.sectioning, renderingInSync: false })
                .catch(() => {})
              invalidateStoryboardDependents(queryClient, label)
              return
            }
          })()
        }
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t`Saving the changes failed.`)
        return false
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
    const pending = pendingRef.current
    previousPage.current = pageId
    setSelection(null)
    setFocusedSection(null)
    setDrafts({})
    setOverrides({})
    setPendingSectioning(null)
    if (hasChanges(pending)) void persist(leaving, pending, true)
  }, [pageId, persist])

  useEffect(() => {
    if (!enabled) setSelection(null)
  }, [enabled])

  const savedSectioning = page.data?.sectioningTree ?? null
  const savedRendering = page.data?.rendering?.sections

  const value = useMemo<CanvasEditingValue>(
    () => ({
      enabled,
      pageId,
      locked,
      selection,
      select: (next) => {
        setSelection(next)
        if (next) setFocusedSection(next.sectionIndex)
      },
      focusedSection,
      focusSection: (sectionIndex) => {
        setSelection(null)
        setFocusedSection(sectionIndex)
      },
      registerFrame: (sectionIndex, handle) => {
        if (handle) frames.current.set(sectionIndex, handle)
        else frames.current.delete(sectionIndex)
      },
      frame: (sectionIndex) => frames.current.get(sectionIndex) ?? null,
      recordEdit: (sectionIndex, html, options) => {
        setDrafts((previous) => ({ ...previous, [sectionIndex]: html }))
        if (options?.reload) setOverrides((previous) => ({ ...previous, [sectionIndex]: html }))
      },
      sectionHtml: (sectionIndex) =>
        drafts[sectionIndex] ?? savedRendering?.find((section) => section.sectionIndex === sectionIndex)?.html,
      sourceOverride: (sectionIndex) => overrides[sectionIndex],
      pendingSectioning,
      togglePruned: (sectionIndex) => {
        if (locked) return
        setPendingSectioning((pending) => nextPendingSectioning(savedSectioning, pending, sectionIndex))
      },
      dirty: Object.keys(drafts).length > 0 || pendingSectioning !== null,
      saving,
      save: async () => {
        if (!(await persist(pageId, pendingRef.current, false))) return
        setDrafts({})
        setOverrides({})
        setPendingSectioning(null)
      },
      discard: () => {
        for (const sectionIndex of Object.keys(pendingRef.current.drafts)) {
          frames.current.get(Number(sectionIndex))?.resetContent()
        }
        setDrafts({})
        setOverrides({})
        setPendingSectioning(null)
        setSelection(null)
      },
    }),
    [enabled, pageId, locked, selection, focusedSection, drafts, overrides, pendingSectioning, savedSectioning, savedRendering, saving, persist],
  )

  return <CanvasEditingContext value={enabled ? value : DISABLED}>{children}</CanvasEditingContext>
}
