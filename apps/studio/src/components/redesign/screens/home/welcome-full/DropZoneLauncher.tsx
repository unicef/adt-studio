import { useCallback, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileUp, BookOpen, FolderInput, BookText, Loader2, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

export interface WelcomeVariantProps {
  onAddBook: () => void
  onOpenSample: () => void
  onImport: () => void
  onOpenDocs: () => void
}

type Zone = "idle" | "over" | "committing" | "error"

const CMD_O = ["⌘", "O"].join("")

export function DropZoneLauncher({ onAddBook, onOpenSample, onImport, onOpenDocs }: WelcomeVariantProps) {
  const { t } = useLingui()
  const [zone, setZone] = useState<Zone>("idle")
  const depth = useRef(0)

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return
    e.preventDefault()
    depth.current += 1
    setZone((z) => (z === "committing" ? z : "over"))
  }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    depth.current -= 1
    if (depth.current <= 0) {
      depth.current = 0
      setZone((z) => (z === "over" ? "idle" : z))
    }
  }, [])
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      depth.current = 0
      const file = e.dataTransfer?.files?.[0]
      const isPdf = file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))
      if (file && !isPdf) {
        setZone("error")
        return
      }
      setZone("committing")
      window.setTimeout(() => onAddBook(), 480)
    },
    [onAddBook],
  )

  const over = zone === "over"
  const committing = zone === "committing"
  const error = zone === "error"

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "relative grid h-full place-items-center overflow-hidden bg-background px-6 transition-colors duration-300",
        over && "bg-brand-50/60",
        error && "bg-stage-quizzes-50/50",
      )}
    >
      <div aria-live="polite" className="sr-only">
        {committing ? t`PDF received, starting your book` : error ? t`That file is not a PDF` : ""}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px] transition-opacity duration-500 motion-safe:animate-[hero-drift_16s_ease-in-out_infinite]"
        style={{ background: "radial-gradient(circle, var(--brand-500) 0%, transparent 68%)", opacity: over || committing ? 0.22 : 0.1 }}
      />

      <button
        type="button"
        onClick={onAddBook}
        disabled={committing}
        aria-label={t`Add a book from a PDF`}
        className={cn(
          "group relative flex w-full max-w-[560px] cursor-pointer flex-col items-center rounded-[28px] border bg-card/40 px-10 py-16 text-center outline-none backdrop-blur-[1px] transition-all duration-300",
          "focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          over && "-translate-y-1 border-brand-500 bg-brand-50/70 shadow-[0_18px_50px_-12px] shadow-brand-500/25",
          error && "border-stage-quizzes/70 bg-stage-quizzes-50/60",
          zone === "idle" && "border-border/70 shadow-sm hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md",
          committing && "border-brand-500",
        )}
      >
        <span aria-hidden className="relative mb-8 block h-[92px] w-[112px]">
          <span
            className={cn(
              "absolute inset-x-3 bottom-0 h-[74px] rounded-lg border bg-card shadow-sm transition-all duration-300",
              over || committing ? "translate-y-0 rotate-0" : "translate-y-1 -rotate-6 group-hover:-rotate-[9deg]",
            )}
          />
          <span
            className={cn(
              "absolute inset-x-3 bottom-0 h-[74px] rounded-lg border bg-card shadow-sm transition-all duration-300",
              over || committing ? "translate-y-0 rotate-0" : "rotate-3 group-hover:rotate-[6deg]",
            )}
          />
          <span
            className={cn(
              "absolute inset-x-2 bottom-1 grid h-[78px] place-items-center rounded-xl border bg-card shadow-md transition-all duration-300",
              over && "-translate-y-2 border-brand-500 text-brand-600",
              committing && "border-brand-500 text-brand-600",
              error && "border-stage-quizzes/60 text-stage-quizzes",
              zone === "idle" && "text-muted-foreground group-hover:-translate-y-1 group-hover:text-brand-600",
            )}
          >
            {committing ? (
              <Loader2 className="size-7 motion-safe:animate-spin" />
            ) : error ? (
              <TriangleAlert className="size-7" />
            ) : (
              <FileUp className={cn("size-7 transition-transform duration-300", over && "-translate-y-0.5")} />
            )}
          </span>
        </span>

        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {committing ? (
            <Trans>Opening your book…</Trans>
          ) : error ? (
            <Trans>ADT Studio needs a PDF</Trans>
          ) : over ? (
            <Trans>Release to open your book</Trans>
          ) : (
            <Trans>Drop a PDF to start a book</Trans>
          )}
        </h1>
        <p className="mt-2 max-w-[42ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {error ? (
            <Trans>Drag a .pdf textbook, or choose one from your computer.</Trans>
          ) : committing ? (
            <Trans>Extracting pages and setting up your project.</Trans>
          ) : (
            <Trans>ADT extracts the pages, then generates narration, captions, translations, and quizzes.</Trans>
          )}
        </p>

        <span
          className={cn(
            "mt-7 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-all duration-200 group-hover:scale-[1.02] group-active:scale-95",
            (over || committing) && "opacity-0",
          )}
        >
          {error ? <Trans>Choose a different file</Trans> : <Trans>Choose a PDF</Trans>}
          <kbd className="ml-0.5 hidden rounded bg-background/20 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide sm:inline-block">
            {CMD_O}
          </kbd>
        </span>
      </button>

      <div className="absolute bottom-9 left-1/2 flex -translate-x-1/2 items-center gap-1 text-[13px] text-muted-foreground">
        <SecondaryLink icon={<BookOpen className="size-3.5" />} onClick={onOpenSample}>
          <Trans>Open the sample book</Trans>
        </SecondaryLink>
        <span aria-hidden className="text-border">·</span>
        <SecondaryLink icon={<FolderInput className="size-3.5" />} onClick={onImport}>
          <Trans>Import an existing project</Trans>
        </SecondaryLink>
        <span aria-hidden className="text-border">·</span>
        <SecondaryLink icon={<BookText className="size-3.5" />} onClick={onOpenDocs}>
          <Trans>Read the docs</Trans>
        </SecondaryLink>
      </div>
    </div>
  )
}

function SecondaryLink({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
    >
      {icon}
      {children}
    </button>
  )
}
