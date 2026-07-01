import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  Upload,
  Loader2,
  Trash2,
  FileText,
  Image,
  Video,
  Globe,
  Building2,
  BookOpen,
  AudioLines,
  HelpCircle,
  List,
  LayoutDashboard,
  Languages,
  AlertCircle,
  Scissors,
  type LucideIcon,
} from "lucide-react"
import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Button } from "@/components/ui/button"
import { FileDropOverlay, useFileDropZone } from "@/components/ui/file-drop-overlay"
import { cn, formatBytes, isZipFile } from "@/lib/utils"
import { useImportBook } from "@/hooks/use-books"
import { useFriendlyArchiveError, type FriendlyError } from "@/hooks/use-archive-error"
import { api, isPartImportPreview } from "@/api/client"
import type { AnyImportPreview, ImportPreview, PartImportPreview } from "@/api/client"

/* eslint-disable-next-line lingui/no-unlocalized-strings */
const DROP_ZONE_HEIGHT = "h-[334px]"


const FEATURE_STAGES: {
  name: string
  label: MessageDescriptor
  icon: LucideIcon
  textColor: string
  bgLight: string
  borderColor: string
}[] = [
  { name: "storyboard", label: msg`Storyboard`, icon: LayoutDashboard, textColor: "text-indigo-600", bgLight: "bg-indigo-50", borderColor: "border-indigo-200" },
  { name: "quizzes", label: msg`Quizzes`, icon: HelpCircle, textColor: "text-orange-600", bgLight: "bg-orange-50", borderColor: "border-orange-200" },
  { name: "captions", label: msg`Image Captions`, icon: Image, textColor: "text-teal-600", bgLight: "bg-teal-50", borderColor: "border-teal-200" },
  { name: "glossary", label: msg`Glossary`, icon: BookOpen, textColor: "text-lime-600", bgLight: "bg-lime-50", borderColor: "border-lime-200" },
  { name: "toc", label: msg`Table of Contents`, icon: List, textColor: "text-amber-600", bgLight: "bg-amber-50", borderColor: "border-amber-200" },
  { name: "translate", label: msg`Translate`, icon: Languages, textColor: "text-blue-600", bgLight: "bg-blue-50", borderColor: "border-blue-200" },
  { name: "speech", label: msg`Speech`, icon: AudioLines, textColor: "text-rose-600", bgLight: "bg-rose-50", borderColor: "border-rose-200" },
]

function FeatureChip({
  icon: Icon,
  label,
  textColor,
  bgLight,
  borderColor,
  done,
}: {
  icon: LucideIcon
  label: string
  textColor: string
  bgLight: string
  borderColor: string
  done: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium transition-colors ${
        done
          ? `${bgLight} ${borderColor} ${textColor}`
          : "bg-slate-50 border-slate-200 text-slate-400"
      }`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {label}
    </span>
  )
}

function PreviewCard({ preview, fileName, fileSize }: { preview: ImportPreview; fileName: string; fileSize: number }) {
  const { t, i18n } = useLingui()
  const displayTitle = preview.title ?? preview.label
  const authors = preview.authors.join(", ")
  const doneFeatures = FEATURE_STAGES.filter((f) => preview.stages[f.name]?.status === "done").length

  return (
    <div className="w-full max-w-2xl border border-slate-200 rounded-lg overflow-hidden grid grid-cols-[2fr_1fr]">
      {/* Left — Info */}
      <div className="flex flex-col">
        <div className="px-5 pt-5 pb-3 space-y-1">
          <p className="font-semibold text-lg leading-snug line-clamp-2 text-slate-900">
            {displayTitle}
          </p>
          {authors && (
            <p className="text-slate-600 text-xs leading-tight line-clamp-1">{authors}</p>
          )}
          <p className="text-[11px] text-slate-400 truncate">{fileName} &middot; {formatBytes(fileSize)}</p>
        </div>

        {preview.validationError && (
          <div className="mx-5 mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-tight text-amber-700">{preview.validationError}</p>
          </div>
        )}

        <div className="px-5 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            <Trans>Book info</Trans>
          </p>
          <div className="space-y-2 text-xs text-slate-500">
            {preview.publisher && (
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{preview.publisher}</span>
              </div>
            )}
            {preview.pageCount > 0 && (
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{preview.pageCount} {preview.pageCount === 1 ? t`page` : t`pages`}</span>
              </div>
            )}
            {preview.languageCode && (
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="inline-flex items-center rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-300/50">
                  {preview.languageCode.toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              {preview.imageCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {preview.imageCount} {preview.imageCount === 1 ? t`image` : t`images`}
                </span>
              )}
              {preview.videoCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {preview.videoCount} {preview.videoCount === 1 ? t`video` : t`videos`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Pipeline features */}
        <div className="px-5 pb-4 mt-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            <Trans>Pipeline features</Trans> &middot; {doneFeatures}/{FEATURE_STAGES.length}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FEATURE_STAGES.map((f) => {
              const info = preview.stages[f.name]
              return (
                <FeatureChip
                  key={f.name}
                  icon={f.icon}
                  label={i18n._(f.label)}
                  textColor={f.textColor}
                  bgLight={f.bgLight}
                  borderColor={f.borderColor}
                  done={info?.status === "done"}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Right — Cover */}
      <PreviewCover coverBase64={preview.coverBase64} alt={preview.title ?? preview.label} />
    </div>
  )
}

function PreviewCover({ coverBase64, alt }: { coverBase64: string | null; alt: string }) {
  return (
    <div className="flex flex-col justify-center items-center border-l border-slate-200 bg-slate-50/50 p-5">
      {coverBase64 ? (
        <img
          src={`data:image/png;base64,${coverBase64}`}
          alt={alt}
          className="w-full max-w-[160px] rounded-sm border border-slate-200 shadow-md object-contain"
        />
      ) : (
        <div className="w-full aspect-[3/4] max-w-[160px] rounded-sm border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center gap-3 shadow-md">
          <BookOpen className="w-10 h-10 text-slate-300" />
          <p className="text-[11px] text-slate-400 font-medium px-4 text-center leading-tight">
            <Trans>No cover available</Trans>
          </p>
        </div>
      )}
    </div>
  )
}

function PartPreviewCard({ preview, fileName, fileSize }: { preview: PartImportPreview; fileName: string; fileSize: number }) {
  const { t } = useLingui()
  const displayTitle = preview.title ?? preview.sourceLabel
  const windowSize = preview.range.endPage - preview.range.startPage + 1

  return (
    <div className="w-full max-w-2xl border border-slate-200 rounded-lg overflow-hidden grid grid-cols-[2fr_1fr]">
      {/* Left — Info */}
      <div className="flex flex-col">
        <div className="px-5 pt-5 pb-3 space-y-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-600">
            <Scissors className="w-3 h-3" />
            <Trans>Book part</Trans>
          </span>
          <p className="font-semibold text-lg leading-snug line-clamp-2 text-slate-900">
            {displayTitle}
          </p>
          <p className="text-[11px] text-slate-400 truncate">{fileName} &middot; {formatBytes(fileSize)}</p>
        </div>

        <div className="px-5 pb-4 mt-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            <Trans>Part info</Trans>
          </p>
          <div className="space-y-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                <Trans>
                  Pages {preview.range.startPage}–{preview.range.endPage} of {preview.pageCount}
                </Trans>
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              <Trans>
                Importing creates a new book limited to {windowSize} pages. Run the
                per-page stages, then export it as a project to merge back into the
                full book.
              </Trans>
            </p>
          </div>
        </div>
      </div>

      {/* Right — Cover */}
      <PreviewCover coverBase64={preview.coverBase64} alt={displayTitle} />
    </div>
  )
}


export function ImportProject() {
  const { t } = useLingui()
  const navigate = useNavigate()
  const importMutation = useImportBook()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<AnyImportPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const friendlyPreviewError = useFriendlyArchiveError(previewError)
  const friendlyImportError = useFriendlyArchiveError(
    importMutation.error ? (importMutation.error instanceof Error ? importMutation.error.message : String(importMutation.error)) : null,
  )

  const loadPreview = useCallback(async (file: File) => {
    setPreviewLoading(true)
    setPreviewError(null)
    setPreview(null)
    importMutation.reset()
    try {
      const result = await api.previewImport(file)
      setPreview(result)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : t`Failed to read archive`)
    } finally {
      setPreviewLoading(false)
    }
  }, [t, importMutation.reset])

  const handleAccept = useCallback((f: File) => {
    setZipFile(f)
    loadPreview(f)
  }, [loadPreview])

  const { overlay } = useFileDropZone({
    accept: isZipFile,
    onAccept: handleAccept,
  })

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0]
      if (picked && isZipFile(picked)) handleAccept(picked)
      e.target.value = ""
    },
    [handleAccept],
  )

  const handleImport = useCallback(() => {
    if (!zipFile) return
    importMutation.mutate(zipFile, {
      onSuccess: () => navigate({ to: "/" }),
    })
  }, [zipFile, importMutation, navigate])

  const hasPreview = !!(zipFile && preview && !previewError)
  const hasError = friendlyPreviewError || friendlyImportError
  const activeError = friendlyImportError ?? friendlyPreviewError

  const [accepted, setAccepted] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [deferredError, setDeferredError] = useState<FriendlyError | null>(null)

  useEffect(() => {
    if (isClearing) return
    if (!hasPreview) {
      setAccepted(false)
      setShowPreview(false)
      return
    }
    setAccepted(true)
    const timer = setTimeout(() => setShowPreview(true), 1200)
    return () => clearTimeout(timer)
  }, [hasPreview, isClearing])

  useEffect(() => {
    if (activeError) {
      setDeferredError(activeError)
    } else {
      const timer = setTimeout(() => setDeferredError(null), 300)
      return () => clearTimeout(timer)
    }
  }, [!!activeError])

  const clearFile = useCallback(() => {
    if (!hasPreview) {
      setZipFile(null)
      setPreview(null)
      setPreviewError(null)
      importMutation.reset()
      return
    }
    setIsClearing(true)
    setShowPreview(false)
    setAccepted(false)
    const timer = setTimeout(() => {
      setZipFile(null)
      setPreview(null)
      setPreviewError(null)
      importMutation.reset()
      setIsClearing(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [hasPreview, importMutation])

  return (
    <>
      <FileDropOverlay
        overlay={overlay}
        dropLabel={<Trans>Drop ZIP here</Trans>}
        errorLabel={<Trans>Only ZIP files are supported</Trans>}
      />

      <div className="flex flex-1 min-h-0 w-full bg-white flex-col items-center justify-center gap-6 sm:gap-8 px-4 py-10">
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl sm:text-[30px] font-semibold leading-tight sm:leading-9 tracking-[-0.75px] text-[#030303] text-center">
            <Trans>Import a Project</Trans>
          </h1>
          <div className="max-w-xl grid [&>*]:col-start-1 [&>*]:row-start-1">
            <p className={cn(
              "text-center text-sm text-[#525252] transition-opacity duration-300 ease-out",
              showPreview ? "opacity-0 pointer-events-none" : "opacity-100",
            )}>
              <Trans>Upload an ADT Studio project archive (.zip) exported by you or shared by a colleague.</Trans>
            </p>
            <p className={cn(
              "text-center text-sm text-[#525252] transition-opacity duration-300 ease-out",
              showPreview ? "opacity-100" : "opacity-0 pointer-events-none",
            )}>
              <Trans>Review the project details below and confirm the import.</Trans>
            </p>
          </div>
          <div className={cn(
            "transition-all duration-300 ease-out overflow-hidden",
            !zipFile && !hasError ? "opacity-100 max-h-10 mt-0" : "opacity-0 max-h-0",
          )}>
            <p className="text-center text-xs text-slate-400">
              <Trans>Don't have a project yet?</Trans>{" "}
              <Link to="/books/new" className="text-blue-500 hover:text-blue-600 underline underline-offset-2 transition-colors">
                <Trans>Create a new book from a PDF</Trans>
              </Link>
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="w-full flex flex-col items-center gap-4 px-4">
          {/* Error banner — animated in/out */}
          <div className={cn(
            "w-full max-w-md transition-all duration-300 ease-out",
            hasError
              ? "opacity-100 max-h-40 scale-100"
              : "opacity-0 max-h-0 scale-95 overflow-hidden pointer-events-none",
          )}>
            {(activeError || deferredError) && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/60 px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-700">{(activeError ?? deferredError)!.title}</p>
                  <p className="text-xs text-red-600/80 mt-0.5 leading-relaxed">{(activeError ?? deferredError)!.hint}</p>
                </div>
              </div>
            )}
          </div>

          {/* Crossfade container — drop zone and preview share the same cell */}
          <div className="w-full grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1">
            {/* Drop zone layer */}
            <div className={cn(
              "w-full flex justify-center transition-all ease-out",
              showPreview
                ? "opacity-0 scale-95 pointer-events-none duration-300"
                : `opacity-100 scale-100 ${DROP_ZONE_HEIGHT} duration-300`,
            )}>
              <div
                role="button"
                tabIndex={showPreview ? -1 : 0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                aria-label={t`Upload ZIP or drag and drop`}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg w-full max-w-md h-full cursor-pointer transition-colors duration-300",
                  accepted
                    ? "border-emerald-400 bg-emerald-50/40"
                    : previewLoading
                      ? "border-amber-400/60 bg-amber-500/[0.02]"
                      : hasError
                        ? "border-red-300 hover:border-red-400 bg-red-50/30 hover:bg-red-50/50"
                        : "border-[#d4d4d4] hover:border-amber-500/60 hover:bg-amber-500/[0.02]",
                )}
              >
                <div className="grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1">
                  {/* Accepted state */}
                  <div className={cn(
                    "flex items-center gap-2 transition-all duration-300 ease-out",
                    accepted ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none",
                  )}>
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                      <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span className="text-sm font-medium text-emerald-600">
                      <Trans>File accepted</Trans>
                    </span>
                  </div>
                  {/* Loading state */}
                  <div className={cn(
                    "flex flex-col items-center gap-2 transition-all duration-300 ease-out",
                    previewLoading && !accepted ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none",
                  )}>
                    <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                    <span className="text-sm text-[#737373]">
                      <Trans>Reading archive...</Trans>
                    </span>
                  </div>
                  {/* Idle / error state */}
                  <div className={cn(
                    "flex flex-col items-center gap-2 transition-all duration-300 ease-out",
                    !previewLoading && !accepted ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none",
                  )}>
                    <Upload className={cn("h-5 w-5", hasError ? "text-red-400" : "text-[#737373]")} />
                    <span className={cn("text-sm", hasError ? "text-red-500" : "text-[#737373]")}>
                      {hasError
                        ? <Trans>Try another file</Trans>
                        : <Trans>Upload ZIP or drag and drop</Trans>}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview card layer */}
            <div className={cn(
              "w-full flex justify-center transition-all duration-500 ease-out",
              showPreview
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 pointer-events-none",
            )}>
              {hasPreview && (
                <div className="relative">
                  {isPartImportPreview(preview) ? (
                    <PartPreviewCard preview={preview} fileName={zipFile.name} fileSize={zipFile.size} />
                  ) : (
                    <PreviewCard preview={preview} fileName={zipFile.name} fileSize={zipFile.size} />
                  )}
                  <button
                    type="button"
                    onClick={clearFile}
                    className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-[#e5e5e5] text-[#737373] hover:text-[#ef4444] hover:border-[#ef4444]/50 transition-colors shadow-sm"
                    aria-label={t`Remove file`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate({ to: "/" })}
            className="h-9 px-3 py-2 bg-[#f5f5f5] text-[#262626] hover:bg-[#e5e5e5] border-0"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            <Trans>Back</Trans>
          </Button>
          <Button
            disabled={
              !preview ||
              (!isPartImportPreview(preview) && !!preview.validationError) ||
              importMutation.isPending
            }
            onClick={handleImport}
            className="h-9 px-3 py-2 text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 border-0"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                <Trans>Importing...</Trans>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1.5" />
                <Trans>Import</Trans>
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
