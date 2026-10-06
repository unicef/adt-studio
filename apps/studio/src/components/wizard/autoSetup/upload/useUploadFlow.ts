import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-form"
import { useFileDropZone } from "@/components/ui/file-drop-overlay"
import { useWizard } from "@/components/wizard"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { suggestLabel, suggestUniqueLabel } from "@/components/wizard/step1BasicInfo/PdfField"
import { getCachedPdfPageCount, getPdfPageCount } from "@/components/wizard/shared/pdfMetadata"
import { usePdfPreviewPages } from "@/components/wizard/shared/usePdfPreviewPages"
import { useBooks } from "@/hooks/use-books"

/** Why a PDF can't be used: it's locked with a password, or pdf.js can't read it. */
export type UploadError = "password" | "damaged"

function isPdfFile(f: File) {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
}

/**
 * The upload step's behaviour: drop / pick → "accepted" beat → book card, page count, cover, and why
 * a file can't be used (password-protected, damaged, not a PDF).
 */
export function useUploadFlow() {
  const navigate = useNavigate()
  const { setPhase } = useWizard()
  const form = useWizardForm()
  const { data: books } = useBooks()
  const file = useStore(form.store, (s) => s.values.file)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pageCount, setPageCount] = useState<number>(() => (file ? getCachedPdfPageCount(file) ?? 0 : 0))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<UploadError | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [rejected, setRejected] = useState(0)
  const replaceStartedAt = useRef(0)
  const showCardRef = useRef(false)

  const accept = useCallback(
    (f: File) => {
      if (showCardRef.current) {
        replaceStartedAt.current = Date.now()
        setReplacing(true)
      }
      const existing = books?.map((b: { label: string }) => b.label) ?? []
      form.setFieldValue("file", f)
      form.setFieldValue("label", suggestUniqueLabel(f, existing))
    },
    [form, books],
  )

  const pick = useCallback(
    (f: File) => {
      if (isPdfFile(f)) {
        setRejected(0)
        return accept(f)
      }
      setRejected(Date.now())
    },
    [accept],
  )

  const clear = useCallback(() => {
    form.setFieldValue("file", null)
    form.setFieldValue("label", "")
    form.setFieldValue("startPage", "")
    form.setFieldValue("endPage", "")
    setPageCount(0)
    setError(null)
    setRejected(0)
    setReplacing(false)
  }, [form])

  useEffect(() => {
    if (!file) {
      setPageCount(0)
      setLoading(false)
      setError(null)
      return
    }
    const cached = getCachedPdfPageCount(file)
    if (cached !== undefined) {
      setPageCount(cached)
      return
    }
    let cancelled = false
    setPageCount(0)
    setLoading(true)
    setError(null)
    getPdfPageCount(file)
      .then((count) => {
        if (cancelled) return
        setPageCount(count)
        form.setFieldValue("startPage", "1")
        form.setFieldValue("endPage", String(count))
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error && e.name === "PasswordException" ? "password" : "damaged")
        setReplacing(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [file])

  useEffect(() => {
    if (!rejected) return
    const id = window.setTimeout(() => setRejected(0), 5000)
    return () => window.clearTimeout(id)
  }, [rejected])

  const { overlay } = useFileDropZone({ accept: isPdfFile, onAccept: accept })

  const hasPreview = !!(file && (pageCount > 0 || replacing) && !error)
  const [accepted, setAccepted] = useState(hasPreview)
  const [showCard, setShowCard] = useState(hasPreview)
  useEffect(() => {
    if (!hasPreview) {
      setAccepted(false)
      setShowCard(false)
      return
    }
    setAccepted(true)
    const id = window.setTimeout(() => setShowCard(true), 1000)
    return () => window.clearTimeout(id)
  }, [hasPreview])
  showCardRef.current = showCard

  const { pages } = usePdfPreviewPages({ file, mode: "first", width: 960, height: 1280 })
  const newCoverReady = !!pages[0]
  useEffect(() => {
    if (!replacing || pageCount === 0 || !newCoverReady) return
    const wait = Math.max(0, 650 - (Date.now() - replaceStartedAt.current))
    const id = window.setTimeout(() => setReplacing(false), wait)
    return () => window.clearTimeout(id)
  }, [replacing, pageCount, newCoverReady])

  return {
    file,
    fileKey: file ? `${file.name}:${file.size}:${file.lastModified}` : "",
    replacing,
    title: file ? suggestLabel(file) || file.name : "",
    pageCount,
    cover: pages[0] as string | undefined,
    loading,
    error,
    rejected: rejected > 0,
    rejectedAt: rejected,
    accepted,
    showCard,
    overlay,
    inputRef,
    openPicker: () => inputRef.current?.click(),
    onInputChange: (e: ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0]
      if (picked) pick(picked)
      e.target.value = ""
    },
    pick,
    clear,
    onBack: () => navigate({ to: "/" }),
    onContinue: () => hasPreview && setPhase("wizard"),
  }
}

export type UploadFlow = ReturnType<typeof useUploadFlow>
