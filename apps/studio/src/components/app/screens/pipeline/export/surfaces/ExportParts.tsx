import type { CSSProperties, ReactNode } from "react"
import { BookOpen, Loader2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { cn } from "@/lib/utils"
import { useBook } from "@/hooks/use-books"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { useExportLanguages } from "@/components/pipeline/stages/export/ExportDialog"
import type { ExportFormat } from "@/components/pipeline/stages/export/export-formats"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import type { ExportFlow } from "./useExportFlow"

const FORMAT_HEX: Record<ExportFormat, string> = {
  project: "#059669",
  adt: "#0284c7",
  scorm: "#d97706",
  webpub: "#2563eb",
  epub: "#9333ea",
  pnld: "#0d9488",
}

const FORMAT_SOLID: Record<ExportFormat, string> = {
  project: "#047857",
  adt: "#0369a1",
  scorm: "#b45309",
  webpub: "#1d4ed8",
  epub: "#7e22ce",
  pnld: "#0f766e",
}

/* eslint-disable lingui/no-unlocalized-strings */
const FORMAT_EXT: Record<ExportFormat, string> = {
  project: ".zip",
  adt: ".zip",
  scorm: ".zip",
  webpub: ".webpub",
  epub: ".epub",
  pnld: ".zip",
}
/* eslint-enable lingui/no-unlocalized-strings */

export function accentStyle(format: ExportFormat): CSSProperties {
  return { "--accent": FORMAT_HEX[format], "--accent-solid": FORMAT_SOLID[format], "--frame": STORYBOARD_HEX } as CSSProperties
}

export function useFormatMeta(flow: ExportFlow, format: ExportFormat) {
  const { t } = useLingui()
  const bestFor: Record<ExportFormat, string> = {
    project: flow.isPart ? t`Sending your part back to the coordinator` : t`Backing up or moving the project`,
    adt: t`Publishing on a website or reading offline`,
    scorm: t`Uploading to an LMS such as Moodle`,
    webpub: t`Readium-based reading servers`,
    epub: t`E-readers and reading apps`,
    pnld: t`Submitting to the FNDE VALIDE reader`,
  }
  const summary: Record<ExportFormat, string> = {
    project: flow.isPart
      ? t`A complete copy of your part to send back. Nothing to choose here.`
      : t`A complete copy of the project, to back it up or open it on another computer. Nothing to choose here.`,
    adt: t`Put it on any website, or open it on a computer without internet.`,
    scorm: t`A package for learning platforms such as Moodle, with progress tracking.`,
    webpub: t`A web publication for Readium-based reading servers.`,
    epub: t`An e-book file for reading apps. Quizzes and read aloud only work in apps that support them.`,
    pnld: t`The package the FNDE asks for, ready for the VALIDE reader.`,
  }
  return {
    ...flow.formats[format],
    ext: FORMAT_EXT[format],
    bestFor: bestFor[format],
    summary: summary[format],
  }
}

export function useExportBook(label: string) {
  const { data: book } = useBook(label)
  const { data: pages } = usePages(label)
  const coverNumber = book?.metadata?.cover_page_number ?? 1
  const coverPage = pages?.find((page) => page.pageNumber === coverNumber)
  const { data: cover } = usePageImage(label, coverPage?.pageId ?? "")
  const languages = useExportLanguages(label)
  return {
    title: book?.metadata?.title ?? book?.title ?? label,
    cover: cover ? `data:image/png;base64,${cover.imageBase64}` : null,
    pageCount: pages?.length ?? null,
    languages,
  }
}

export function BookThumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-[4px] border bg-muted shadow-sm", className)}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <BookOpen className="size-3.5 text-muted-foreground" />}
    </span>
  )
}

export function BookLine({ label, className }: { label: string; className?: string }) {
  const { t } = useLingui()
  const book = useExportBook(label)
  const parts = [
    book.pageCount != null ? t`${plural(book.pageCount, { one: "# page", other: "# pages" })}` : null,
    book.languages.length > 1 ? t`${book.languages.length} languages` : null,
  ].filter(Boolean)
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground", className)}>
      <span className="truncate">{book.title}</span>
      {parts.length > 0 && <span className="shrink-0 text-muted-foreground/70">· {parts.join(" · ")}</span>}
    </span>
  )
}

export function FormatBadge({ flow, format }: { flow: ExportFlow; format: ExportFormat }) {
  const config = flow.formats[format]
  if (!config.badge) return null
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-px text-[9px] font-semibold uppercase leading-none tracking-wider",
        config.textColor,
        config.bgLight,
        config.borderColor,
        "dark:border-white/15 dark:bg-white/[0.06] dark:text-foreground/75",
      )}
    >
      {config.badge}
    </span>
  )
}

export function AccentButton({
  children,
  onClick,
  disabled,
  className,
  icon,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-9 items-center justify-center gap-2 rounded-lg bg-(--accent-solid) px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.15),0_6px_16px_-8px_var(--accent)] outline-none transition-[background-color,box-shadow,opacity,scale] duration-200 ease-out hover:brightness-110 focus-visible:ring-2 focus-visible:ring-(--accent-solid)/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:opacity-60 motion-reduce:active:scale-100",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function ExportGoButton({ flow, onDone, className }: { flow: ExportFlow; onDone?: () => void; className?: string }) {
  const meta = useFormatMeta(flow, flow.format)
  const busy = flow.watcher.isPreparing
  const failed = flow.watcher.error?.format === flow.format
  const Icon = meta.icon
  return (
    <AccentButton
      disabled={busy}
      onClick={() => {
        flow.start()
        onDone?.()
      }}
      className={className}
      icon={busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
    >
      {failed ? <Trans>Try again</Trans> : <Trans>Export</Trans>}
      <span className="font-mono text-[11px] font-medium opacity-75">{meta.ext}</span>
    </AccentButton>
  )
}
