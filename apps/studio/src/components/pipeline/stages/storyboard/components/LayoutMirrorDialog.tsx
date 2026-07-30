import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, Layers, X } from "lucide-react"
import { api } from "@/api/client"
import { useLingui } from "@lingui/react/macro"

interface LayoutMirrorDialogProps {
  bookLabel: string
  /** The current section the dialog was opened from — becomes the target. */
  targetPageId: string
  targetSectionIndex: number
  /**
   * Called when the user submits. Dialog closes immediately; parent handles the
   * async API call so progress can flow through the existing task surface.
   */
  onSubmit: (
    source: { pageId: string; sectionIndex: number },
    instruction: string | undefined,
  ) => void
  onClose: () => void
}

/**
 * Picker for "make this section look like that one". Lists every page in the
 * book and, on selection, lets the user pick one of the page's sections as
 * the layout source. The target is fixed — it's whichever section the dialog
 * was opened from.
 */
export function LayoutMirrorDialog({
  bookLabel,
  targetPageId,
  targetSectionIndex,
  onSubmit,
  onClose,
}: LayoutMirrorDialogProps) {
  const { t } = useLingui()

  const pagesQuery = useQuery({
    queryKey: ["books", bookLabel, "pages"],
    queryFn: () => api.getPages(bookLabel),
    staleTime: 30_000,
  })

  const [sourcePageId, setSourcePageId] = useState<string | null>(null)
  const [sourceSectionIndex, setSourceSectionIndex] = useState<number | null>(null)
  const [instruction, setInstruction] = useState("")

  const selectedPage = useMemo(
    () => pagesQuery.data?.find((p) => p.pageId === sourcePageId) ?? null,
    [pagesQuery.data, sourcePageId],
  )

  const canSubmit =
    sourcePageId !== null &&
    sourceSectionIndex !== null &&
    !(
      sourcePageId === targetPageId &&
      sourceSectionIndex === targetSectionIndex
    )

  const handleSubmit = () => {
    if (
      sourcePageId === null ||
      sourceSectionIndex === null ||
      !canSubmit
    ) {
      return
    }
    onSubmit(
      { pageId: sourcePageId, sectionIndex: sourceSectionIndex },
      instruction.trim() || undefined,
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-8">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold">{t`Mirror layout`}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label={t`Close`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            {t`Pick a source section. Its layout will be applied to this section while keeping this section's content and data-ids.`}
          </p>

          <div className="grid grid-cols-2 gap-3 min-h-[300px]">
            {/* Page list */}
            <div className="border rounded-lg overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b text-[11px] font-medium text-muted-foreground bg-muted/40">
                {t`Pages`}
              </div>
              <div className="flex-1 overflow-auto">
                {pagesQuery.isLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ul className="text-xs">
                    {pagesQuery.data?.map((p) => (
                      <li key={p.pageId}>
                        <button
                          type="button"
                          onClick={() => {
                            setSourcePageId(p.pageId)
                            setSourceSectionIndex(null)
                          }}
                          className={`w-full text-left px-3 py-1.5 hover:bg-muted/60 transition-colors ${
                            sourcePageId === p.pageId ? "bg-muted" : ""
                          }`}
                          disabled={!p.hasRendering}
                        >
                          <span className="font-mono">
                            {t`Page ${p.pageNumber}`}
                          </span>
                          <span className="text-muted-foreground ml-2">
                            ({p.sectionCount}{" "}
                            {p.sectionCount === 1
                              ? t`section`
                              : t`sections`}
                            )
                          </span>
                          {!p.hasRendering && (
                            <span className="text-muted-foreground ml-2 italic">
                              {t`no rendering`}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Section list for the selected page */}
            <div className="border rounded-lg overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b text-[11px] font-medium text-muted-foreground bg-muted/40">
                {t`Sections`}
              </div>
              <div className="flex-1 overflow-auto">
                {selectedPage ? (
                  <ul className="text-xs">
                    {selectedPage.sections.map((s) => {
                      const isTarget =
                        selectedPage.pageId === targetPageId &&
                        s.sectionIndex === targetSectionIndex
                      return (
                        <li key={s.sectionIndex}>
                          <button
                            type="button"
                            onClick={() =>
                              setSourceSectionIndex(s.sectionIndex)
                            }
                            disabled={isTarget}
                            className={`w-full text-left px-3 py-1.5 hover:bg-muted/60 transition-colors ${
                              sourceSectionIndex === s.sectionIndex
                                ? "bg-muted"
                                : ""
                            } ${isTarget ? "opacity-40 cursor-not-allowed" : ""}`}
                          >
                            <span className="font-mono">
                              {t`Section ${s.sectionIndex + 1}`}
                            </span>
                            <span className="text-muted-foreground ml-2 truncate">
                              {s.sectionId}
                            </span>
                            {isTarget && (
                              <span className="text-muted-foreground ml-2 italic">
                                {t`(this section)`}
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    {t`Pick a page to see its sections.`}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
              {t`Additional instruction (optional)`}
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t`e.g. keep the image on the right`}
              rows={2}
              className="w-full text-xs border rounded-md px-2 py-1.5 resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md hover:bg-muted transition-colors"
          >
            {t`Cancel`}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t`Apply layout`}
          </button>
        </div>
      </div>
    </div>
  )
}
