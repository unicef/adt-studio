import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useStore } from "@tanstack/react-form"
import { useFileDropZone } from "@/components/ui/file-drop-overlay"
import { fitPageRange, useWizardForm } from "@/components/wizard/core/wizardForm"
import { suggestLabel, suggestUniqueLabel } from "@/components/wizard/core/fields/PdfField"
import { getCachedPdfPageCount, getPdfPageCount } from "@/components/wizard/core/pdf/pdfMetadata"
import { usePdfPreviewPages } from "@/components/wizard/core/pdf/usePdfPreviewPages"
import { useBooks } from "@/hooks/use-books"

/** Why a PDF can't be used: it's locked with a password, or pdf.js can't read it. */
export type UploadError = "password" | "damaged"

function isPdfFile(f: File) {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
}

/**
 * The PDF the guided flow works on: drop / pick, page count, cover, and why a file can't be used
 * (password-protected, damaged, not a PDF). `active` is false while the manual wizard is open over
 * the guided flow, so its window-wide drop zone stays off and only the manual wizard takes a drop.
 */
export function useUploadFlow({ active = true, guard }: { active?: boolean; /** Asks before a new PDF replaces the current one (the picker, or a dropped file); calls `go` to go ahead. */ guard?: (go: () => void) => void } = {}) {
  const form = useWizardForm()
  const { data: books } = useBooks()
  const file = useStore(form.store, (s) => s.values.file)
  const inputRef = useRef<HTMLInputElement>(null)
  // The count is kept with the file it was read from, so for the render where a new PDF replaces the
  // old one the new file never shows the old count (the engine would start once with it).
  const [counted, setCounted] = useState<{ file: File | null; count: number }>({ file: null, count: 0 })
  const pageCount = !file ? 0 : counted.file === file ? counted.count : (getCachedPdfPageCount(file) ?? 0)
  const [error, setError] = useState<UploadError | null>(null)
  const [rejected, setRejected] = useState(0)

  const accept = useCallback(
    (f: File) => {
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
    setCounted({ file: null, count: 0 })
    setError(null)
    setRejected(0)
  }, [form])

  const seen = useRef(file)
  useEffect(() => {
    if (!file) {
      seen.current = null
      setCounted({ file: null, count: 0 })
      setError(null)
      return
    }
    // A new PDF starts clean: no error left from the last one, and every page chosen (a PDF that
    // was already here when this mounted keeps the pages picked for it while they fit, as in the
    // wizard's PDF field).
    const fresh = seen.current !== file
    seen.current = file
    setError(null)
    if (fresh) {
      form.setFieldValue("startPage", "")
      form.setFieldValue("endPage", "")
    }
    const counted = (count: number) => {
      setCounted({ file, count })
      fitPageRange(form, count)
    }
    const cached = getCachedPdfPageCount(file)
    if (cached !== undefined) return counted(cached)
    let cancelled = false
    setCounted({ file, count: 0 })
    getPdfPageCount(file)
      .then((count) => {
        if (!cancelled) counted(count)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error && e.name === "PasswordException" ? "password" : "damaged")
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

  const { overlay } = useFileDropZone({ accept: isPdfFile, onAccept: (f: File) => (file && guard ? guard(() => accept(f)) : accept(f)), enabled: active })

  const { pages } = usePdfPreviewPages({ file, mode: "first", width: 960, height: 1280 })
  return {
    file,
    fileKey: file ? `${file.name}:${file.size}:${file.lastModified}` : "",
    title: file ? suggestLabel(file) || file.name : "",
    pageCount,
    cover: pages[0] as string | undefined,
    error,
    rejectedAt: rejected,
    overlay,
    inputRef,
    openPicker: () => {
      const open = () => inputRef.current?.click()
      if (file && guard) guard(open)
      else open()
    },
    onInputChange: (e: ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0]
      if (picked) pick(picked)
      e.target.value = ""
    },
    clear,
  }
}

export type UploadFlow = ReturnType<typeof useUploadFlow>
