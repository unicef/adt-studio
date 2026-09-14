import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { Upload, RefreshCw } from "lucide-react"
import { useStore } from "@tanstack/react-form"
import { Button } from "@/components/ui/button"
import { FileDropOverlay, useFileDropZone } from "@/components/ui/file-drop-overlay"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { useBooks } from "@/hooks/use-books"
import { getPdfPageCount } from "@/components/wizard/shared/pdfMetadata"
import { getPresetAccent } from "@/components/wizard/constants"
import { cn, formatBytes } from "@/lib/utils"

function waitTwoAnimationFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

export function suggestLabel(file: File) {
  return file.name
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .slice(0, 64)
}

export function suggestUniqueLabel(file: File, existingLabels: string[]): string {
  const base = suggestLabel(file)
  if (!existingLabels.includes(base)) return base
  let i = 2
  while (existingLabels.includes(`${base}-${i}`)) i++
  return `${base}-${i}`
}

const pdfCache = { file: null as File | null, totalPages: 0 }

export function usePdfField() {
  const form = useWizardForm()
  const { i18n } = useLingui()
  const { data: books } = useBooks()
  const file = useStore(form.store, (s) => s.values.file)
  const [totalPages, setTotalPages] = useState(pdfCache.file === file ? pdfCache.totalPages : 0)
  const [pdfError, setPdfError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      pdfCache.file = null
      pdfCache.totalPages = 0
      setTotalPages(0)
      form.setFieldValue("startPage", "")
      form.setFieldValue("endPage", "")
      return
    }
    if (pdfCache.file === file) {
      setTotalPages(pdfCache.totalPages)
      return
    }

    setPdfError(null)
    let cancelled = false
    ;(async () => {
      await waitTwoAnimationFrames()
      if (cancelled) return
      try {
        const count = await getPdfPageCount(file)
        if (cancelled) return
        pdfCache.file = file
        pdfCache.totalPages = count
        setTotalPages(count)
        form.setFieldValue("startPage", "1")
        form.setFieldValue("endPage", String(count))
      } catch {
        if (cancelled) return
        pdfCache.file = null
        pdfCache.totalPages = 0
        setTotalPages(0)
        setPdfError(i18n._(msg`Could not read this PDF. The file may be corrupted or password-protected.`))
        form.setFieldValue("file", null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file])

  const setFile = useCallback(
    (f: File) => {
      const existingLabels = books?.map((b: { label: string }) => b.label) ?? []
      form.setFieldValue("file", f)
      form.setFieldValue("label", suggestUniqueLabel(f, existingLabels))
    },
    [form, books],
  )

  const clearFile = useCallback(() => {
    form.setFieldValue("file", null)
  }, [form])

  return { file, totalPages, pdfError, setFile, clearFile }
}

export function PdfField() {
  const { t } = useLingui()
  const form = useWizardForm()
  const { file, pdfError, setFile } = usePdfField()
  const pdfRef = useRef<HTMLInputElement>(null)
  const selectedPreset = useStore(form.store, (s) => s.values.selectedPreset)
  const accent = getPresetAccent(selectedPreset)
  const accentStyle = {
    "--accent": accent.bg,
    "--accent-60": `${accent.bg}99`,
    "--accent-06": `${accent.bg}0f`,
    "--accent-02": `${accent.bg}05`,
  } as CSSProperties

  const { overlay } = useFileDropZone({
    accept: (f) => f.type === "application/pdf",
    onAccept: setFile,
  })

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    if (picked) setFile(picked)
    e.target.value = ""
  }, [setFile])

  const openFilePicker = useCallback(() => pdfRef.current?.click(), [])

  return (
    <>
      <FileDropOverlay
        overlay={overlay}
        dropLabel={<Trans>Drop PDF here</Trans>}
        errorLabel={<Trans>Only PDF files are supported</Trans>}
        accent="blue"
      />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">
          <Trans>PDF File</Trans> <span className="text-destructive">*</span>
        </label>
        <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />

        <div
          className={cn("overflow-hidden transition-[height] duration-300 ease-in-out", file ? "h-[60px]" : "h-[112px]")}
        >
          {file ? (
            <div
              id="wizard-pdf-upload"
              role="button"
              tabIndex={0}
              onClick={openFilePicker}
              onKeyDown={(e) => e.key === "Enter" && openFilePicker()}
              aria-label={t`Replace PDF`}
              style={accentStyle}
              className="flex items-center gap-3 border border-border rounded-lg px-4 py-3 h-full cursor-pointer hover:border-[var(--accent-60)] hover:bg-[var(--accent-02)] transition-colors duration-200"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground/70">{formatBytes(file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  openFilePicker()
                }}
                aria-label={t`Replace PDF`}
                style={accentStyle}
                className="h-8 px-2 text-muted-foreground hover:text-[var(--accent)] hover:bg-[var(--accent-06)] transition-colors shrink-0 gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">
                  <Trans>Replace</Trans>
                </span>
              </Button>
            </div>
          ) : (
            <div
              id="wizard-pdf-upload"
              role="button"
              tabIndex={0}
              onClick={openFilePicker}
              onKeyDown={(e) => e.key === "Enter" && openFilePicker()}
              aria-label={t`Upload PDF or drag and drop`}
              style={accentStyle}
              className="flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-lg h-full cursor-pointer hover:border-[var(--accent-60)] hover:bg-[var(--accent-02)] transition-colors duration-200"
            >
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                <Trans>Upload PDF or drag and drop</Trans>
              </span>
            </div>
          )}
        </div>

        {pdfError && (
          <p className="text-xs text-destructive mt-1">{pdfError}</p>
        )}
      </div>
    </>
  )
}
