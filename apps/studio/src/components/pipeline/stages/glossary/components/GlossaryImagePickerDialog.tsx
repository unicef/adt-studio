import { useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, Crop, Images, Loader2, Search, Upload, X } from "lucide-react"
import { IMAGE_SET_CHANGE_CLEAR_STAGES } from "@adt/types"
import { api, BASE_URL } from "@/api/client"
import { useLingui } from "@lingui/react/macro"
import { CascadeResetDialog } from "@/components/pipeline/components/CascadeResetDialog"
import { LoadingState } from "@/components/pipeline/components/LoadingState"
import { useBookRun } from "@/hooks/use-book-run"
import { usePages } from "@/hooks/use-pages"
import { invalidateStoryboardDependents } from "@/hooks/use-page-mutations"
import { ImageCropDialog } from "@/components/pipeline/stages/storyboard/components/ImageCropDialog"

interface GlossaryImagePickerDialogProps {
  bookLabel: string
  /** Currently assigned image id, if any (pre-selected in the grid). */
  initialSelected?: string
  onConfirm: (imageId: string) => void
  onClose: () => void
}

type View = "grid" | "page-pick"
type NewImageAction = "crop" | "upload"

/**
 * Image picker for glossary items with three sources:
 * - pick one of the book's images (searchable thumbnail grid),
 * - crop a region straight from a page (page picker → ImageCropDialog →
 *   `POST /books/:label/images`, stored as `{pageId}_crop{N}`),
 * - upload a new image from disk (`POST /books/:label/images/upload`).
 * Crop and upload confirm immediately with the freshly created imageId.
 */
export function GlossaryImagePickerDialog({
  bookLabel,
  initialSelected,
  onConfirm,
  onClose,
}: GlossaryImagePickerDialogProps) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const { stageState, isStatusLoading } = useBookRun()
  const [view, setView] = useState<View>("grid")
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null)
  // Page whose render is loaded into the crop dialog.
  const [cropPage, setCropPage] = useState<{ pageId: string; src: string } | null>(null)
  const [loadingCropPageId, setLoadingCropPageId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingNewImageAction, setPendingNewImageAction] =
    useState<NewImageAction | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: pages } = usePages(bookLabel)

  const imagesQuery = useQuery({
    queryKey: ["books", bookLabel, "images"],
    queryFn: () => api.listBookImages(bookLabel),
    staleTime: 30_000,
  })

  const filtered = imagesQuery.data?.images.filter((img) => {
    // Exclude full page renders — same rule as the storyboard's picker.
    if (img.source === "page") return false
    if (!filter) return true
    const f = filter.toLowerCase()
    return (
      img.imageId.toLowerCase().includes(f) ||
      img.pageId.toLowerCase().includes(f)
    )
  })

  const finishWithNewImage = (imageId: string) => {
    queryClient.invalidateQueries({ queryKey: ["books", bookLabel, "images"] })
    invalidateStoryboardDependents(queryClient, bookLabel)
    onConfirm(imageId)
  }

  const affectedStages = IMAGE_SET_CHANGE_CLEAR_STAGES.filter(
    (stage) => stageState(stage) === "done",
  )

  const continueNewImageAction = (action: NewImageAction) => {
    if (action === "crop") {
      setView("page-pick")
    } else {
      fileInputRef.current?.click()
    }
  }

  const requestNewImageAction = (action: NewImageAction) => {
    if (affectedStages.length === 0) {
      continueNewImageAction(action)
      return
    }
    setPendingNewImageAction(action)
  }

  const openCropForPage = async (pageId: string) => {
    if (loadingCropPageId) return
    setError(null)
    setLoadingCropPageId(pageId)
    try {
      const { imageBase64 } = await api.getPageImage(bookLabel, pageId)
      setCropPage({ pageId, src: `data:image/png;base64,${imageBase64}` })
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Failed to load page image`)
    } finally {
      setLoadingCropPageId(null)
    }
  }

  const handleCropApply = async (blob: Blob) => {
    if (!cropPage) return
    // The page id doubles as the crop's source id: the new image is stored
    // as `{pageId}_crop{N}`, recording where it was cut from.
    const result = await api.uploadCroppedImage(bookLabel, cropPage.pageId, cropPage.pageId, blob)
    setCropPage(null)
    finishWithNewImage(result.imageId)
  }

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // reset so the same file can be re-selected
    if (!file) return
    const anchorPageId = pages?.[0]?.pageId
    if (!anchorPageId) return
    setError(null)
    setUploading(true)
    try {
      const result = await api.uploadNewImage(bookLabel, anchorPageId, file)
      finishWithNewImage(result.imageId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Image upload failed`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className={`fixed inset-0 bg-black/60 flex items-center justify-center p-8 ${
        pendingNewImageAction ? "z-40" : "z-[100]"
      }`}
    >
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            {view !== "grid" && (
              <button
                type="button"
                onClick={() => setView("grid")}
                aria-label={t`Back`}
                className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <Images className="h-4 w-4 text-lime-600" />
            <h2 className="text-sm font-semibold">
              {view === "grid" ? t`Choose a picture for this term` : t`Crop from a page`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t`Close`}
            className="p-1 rounded hover:bg-accent transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {view === "grid" && (
            <>
              <p className="text-xs text-muted-foreground">
                {t`Pick one of the book's images, crop a region from a page, or upload your own picture.`}
              </p>

              {/* Alternative sources */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => requestNewImageAction("crop")}
                  disabled={isStatusLoading}
                  className="flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-left hover:border-lime-500 hover:bg-lime-50/50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Crop className="h-4 w-4 text-lime-600 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{t`Crop from page`}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t`Cut a region out of any page`}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => requestNewImageAction("upload")}
                  disabled={uploading || !pages?.length || isStatusLoading}
                  className="flex items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-left hover:border-lime-500 hover:bg-lime-50/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 text-lime-600 shrink-0 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 text-lime-600 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{t`Upload image`}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t`Add a new picture from your disk`}
                    </span>
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleUploadFile}
                />
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t`Filter by image ID or page...`}
                  className="w-full text-sm border rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-lime-500/30"
                />
              </div>

              {imagesQuery.isLoading && (
                <LoadingState stageSlug="glossary" label={t`Loading images...`} />
              )}

              {imagesQuery.isError && (
                <p className="text-center text-sm text-red-500 py-8">
                  {t`Failed to load images.`}
                </p>
              )}

              {filtered && filtered.length === 0 && !imagesQuery.isLoading && (
                <p className="text-center text-sm text-muted-foreground py-12">
                  {filter ? t`No images match your filter.` : t`No images in this book yet.`}
                </p>
              )}

              {filtered && filtered.length > 0 && (
                <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={t`Book images`}>
                  {filtered.map((img) => {
                    const isSelected = selected === img.imageId
                    return (
                      <div
                        key={img.imageId}
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={img.imageId}
                        tabIndex={0}
                        onClick={() => setSelected(img.imageId)}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault()
                            setSelected(img.imageId)
                          }
                        }}
                        className={`group relative rounded border overflow-hidden bg-card flex flex-col items-stretch transition-all cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 ${
                          isSelected
                            ? "ring-2 ring-lime-500 border-lime-500"
                            : "hover:ring-2 hover:ring-lime-500/40"
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-1.5 left-1.5 z-10 h-4 w-4 rounded-full bg-lime-600 flex items-center justify-center shadow-sm">
                            <Check className="h-3 w-3 text-white" strokeWidth={3} />
                          </div>
                        )}
                        <img
                          src={`${BASE_URL}/books/${bookLabel}/images/${img.imageId}`}
                          alt={img.imageId}
                          draggable={false}
                          className="w-full h-32 object-contain bg-muted/30 select-none pointer-events-none"
                          loading="lazy"
                        />
                        <div className="px-2 py-1.5 border-t bg-muted/30">
                          <span className="text-[10px] font-mono text-muted-foreground truncate block">
                            {img.imageId}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {view === "page-pick" && (
            <>
              <p className="text-xs text-muted-foreground">
                {t`Choose the page to crop from.`}
              </p>
              {!pages?.length ? (
                <p className="text-center text-sm text-muted-foreground py-12">
                  {t`No pages in this book yet.`}
                </p>
              ) : (
                <div className="grid grid-cols-6 gap-2">
                  {pages.map((page) => (
                    <button
                      key={page.pageId}
                      type="button"
                      disabled={loadingCropPageId !== null}
                      onClick={() => openCropForPage(page.pageId)}
                      className="flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-medium hover:border-lime-500 hover:bg-lime-50/50 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {loadingCropPageId === page.pageId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      {t`Page ${page.pageNumber}`}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer (existing-image selection only) */}
        {view === "grid" && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t shrink-0">
            <p className="text-[11px] text-muted-foreground">
              {selected ? t`1 image selected` : t`No image selected`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent transition-colors cursor-pointer"
              >
                {t`Cancel`}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selected) onConfirm(selected)
                }}
                disabled={!selected}
                className="text-xs font-medium rounded px-3 py-1.5 bg-lime-600 hover:bg-lime-500 text-white cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t`Use this picture`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full-screen crop overlay (same component the storyboard uses) */}
      {cropPage && (
        <ImageCropDialog
          imageSrc={cropPage.src}
          onApply={handleCropApply}
          onClose={() => setCropPage(null)}
        />
      )}

      <CascadeResetDialog
        open={pendingNewImageAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNewImageAction(null)
        }}
        affectedStages={affectedStages}
        headerStageSlug="glossary"
        title={t`Adding a new image resets downstream work`}
        description={t`Creating a new glossary image changes the book's image set. The completed stages below will be cleared and need to run again.`}
        confirmLabel={
          pendingNewImageAction === "crop"
            ? t`Continue to crop`
            : t`Continue to upload`
        }
        confirmColorClass="bg-lime-600 hover:bg-lime-700"
        onConfirm={() => {
          const action = pendingNewImageAction
          setPendingNewImageAction(null)
          if (action) continueNewImageAction(action)
        }}
      />
    </div>
  )
}
