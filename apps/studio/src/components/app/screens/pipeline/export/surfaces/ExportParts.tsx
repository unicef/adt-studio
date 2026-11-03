import type { CSSProperties, ReactNode } from "react"
import { BookOpen, Check, Loader2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { cn } from "@/lib/utils"
import { useBook } from "@/hooks/use-books"
import { usePages, usePageImage } from "@/hooks/use-pages"
import { useAvailableExportFeatures } from "@/hooks/use-export-features"
import { ExportOptionsBody, useExportLanguages } from "@/components/pipeline/stages/export/ExportDialog"
import { ExportPreview } from "@/components/pipeline/stages/export/components/ExportPreview"
import { FORMAT_ORDER } from "@/components/pipeline/stages/export/components/FormatPicker"
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
  return { "--accent": FORMAT_HEX[format], "--frame": STORYBOARD_HEX } as CSSProperties
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
  return {
    ...flow.formats[format],
    ext: FORMAT_EXT[format],
    bestFor: bestFor[format],
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
      )}
    >
      {config.badge}
    </span>
  )
}

export function FormatTile({ flow, format, size = "md" }: { flow: ExportFlow; format: ExportFormat; size?: "md" | "lg" }) {
  const config = flow.formats[format]
  const Icon = config.icon
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center border",
        size === "md" && "size-9 rounded-lg",
        size === "lg" && "size-11 rounded-xl",
        config.bgLight,
        config.borderColor,
        "dark:border-white/10 dark:bg-white/[0.06]",
      )}
    >
      <Icon className={cn(size === "lg" ? "size-5" : "size-4", config.textColor)} aria-hidden />
    </span>
  )
}

function ExtChip({ ext }: { ext: string }) {
  return <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">{ext}</span>
}

function FormatRow({ flow, format, density }: { flow: ExportFlow; format: ExportFormat; density: "compact" | "detailed" }) {
  const meta = useFormatMeta(flow, format)
  const selected = flow.format === format
  const failed = flow.watcher.error?.format === format
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => flow.setFormat(format)}
      style={selected ? accentStyle(format) : undefined}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-lg px-2 text-left outline-none transition-[background-color,box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-(--frame)/50",
        density === "compact" ? "h-[52px]" : "h-[60px] px-3",
        selected
          ? "bg-[color-mix(in_oklab,var(--accent)_9%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_35%,transparent)]"
          : "hover:bg-muted/70",
        failed && !selected && "bg-red-50 dark:bg-red-950/30",
      )}
    >
      <FormatTile flow={flow} format={format} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold">{meta.label}</span>
          <FormatBadge flow={flow} format={format} />
        </span>
        <span className="truncate text-[11.5px] text-muted-foreground">{meta.bestFor}</span>
      </span>
      <ExtChip ext={meta.ext} />
      <span
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-full text-white transition-[opacity,scale] duration-200 ease-out",
          selected ? "scale-100 bg-(--accent) opacity-100" : "scale-50 opacity-0",
        )}
        aria-hidden
      >
        <Check className="size-3" strokeWidth={3.5} />
      </span>
    </button>
  )
}

export function ExportFormatRows({
  flow,
  density = "compact",
  formats = FORMAT_ORDER,
  labelledBy,
}: {
  flow: ExportFlow
  density?: "compact" | "detailed"
  formats?: ExportFormat[]
  labelledBy?: string
}) {
  const { t } = useLingui()
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : t`Format`}
      className="flex flex-col gap-0.5"
    >
      {formats.map((format) => (
        <FormatRow key={format} flow={flow} format={format} density={density} />
      ))}
    </div>
  )
}

export function useIncludedSummary(flow: ExportFlow, label: string): string[] {
  const { t } = useLingui()
  const available = useAvailableExportFeatures(label)
  const languages = useExportLanguages(label)
  if (flow.format === "project") return [t`Database`, t`Source PDF`, t`Every step's output`]
  const chosen = flow.languageOrder ?? languages
  return [
    available.glossary && flow.toggles.glossary ? t`Glossary` : null,
    available.readAloud && flow.toggles.readAloud ? t`Speech` : null,
    available.quizzes && flow.toggles.quizzes ? t`Quizzes` : null,
    available.signLanguage && flow.toggles.signLanguage ? t`Sign language` : null,
    chosen.length > 1 ? t`${chosen.length} languages` : null,
  ].filter((item): item is string => item !== null)
}

export function IncludedChips({ flow, label, wrap }: { flow: ExportFlow; label: string; wrap?: boolean }) {
  const items = useIncludedSummary(flow, label)
  return (
    <span className={cn("flex min-w-0 items-center gap-1", wrap ? "flex-wrap" : "overflow-hidden")}>
      {items.length === 0 ? (
        <span className="text-[12px] text-muted-foreground">
          <Trans>Text and images</Trans>
        </span>
      ) : (
        items.map((item) => (
          <span
            key={item}
            className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] px-2 py-0.5 text-[11px] font-medium text-(--accent) transition-colors duration-200"
          >
            {item}
          </span>
        ))
      )}
    </span>
  )
}

export function ExportOptionsPanel({ flow, label }: { flow: ExportFlow; label: string }) {
  return (
    <div className="[&_[role=switch][data-state=checked]]:bg-(--accent)">
    <ExportOptionsBody
      selectedFormat={flow.format}
      bookLabel={label}
      featureToggles={flow.toggles}
      onFeatureToggleChange={flow.setToggle}
      languageOrder={flow.languageOrder}
      onLanguageOrderChange={flow.setLanguageOrder}
      isPreparing={flow.watcher.isPreparing}
      error={flow.watcher.error}
    />
    </div>
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
        "flex h-9 items-center justify-center gap-2 rounded-lg bg-(--accent) px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.15),0_6px_16px_-8px_var(--accent)] outline-none transition-[background-color,box-shadow,opacity,scale] duration-200 ease-out hover:brightness-110 focus-visible:ring-2 focus-visible:ring-(--accent)/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:opacity-60 motion-reduce:active:scale-100",
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

export function ExportSample({ flow, className }: { flow: ExportFlow; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-card", className)}>
      <div key={flow.format} className="w-[200%] origin-top-left scale-50 animate-in fade-in duration-300 motion-reduce:animate-none">
        <ExportPreview format={flow.format} isPart={flow.isPart} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
    </div>
  )
}
