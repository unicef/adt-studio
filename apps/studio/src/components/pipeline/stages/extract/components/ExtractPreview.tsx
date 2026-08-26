import type { ReactNode } from "react"
import { ArrowDown, BookOpen, FileText, Image as ImageIcon, List, Type } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function ExtractPreview({
  bookTitle,
  pageCount,
}: {
  bookTitle: string
  pageCount: number | null
}) {
  const totalPages = pageCount ?? 0
  const truncatedTitle =
    bookTitle.length > 32 ? `${bookTitle.slice(0, 32)}…` : bookTitle
  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden ">
      <div className="flex flex-col items-center w-full px-5 py-4 gap-3">
        {/* SOURCE PDF */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-600" strokeWidth={2} />
            <span className="font-semibold text-[10px] tracking-[0.18em] uppercase text-blue-700">
              <Trans>Source PDF</Trans>
            </span>
          </div>
          <div className="w-[88px] aspect-[3/4] rounded-md bg-blue-50/80 ring-1 ring-border flex items-center justify-center">
            <BookOpen className="w-7 h-7 text-blue-300" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] font-medium text-blue-700/90 truncate max-w-[200px]">
              {truncatedTitle}
            </span>
            {totalPages > 0 && (
              <span className="font-mono text-[9px] tabular-nums text-blue-500/70">
                <Trans>{totalPages} pages</Trans>
              </span>
            )}
          </div>
        </div>

        {/* CONNECTOR */}
        <div className="flex flex-col items-center" aria-hidden>
          <div className="w-px h-2 bg-blue-200" />
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white shadow-sm">
            <ArrowDown className="w-3 h-3" strokeWidth={2.5} />
          </div>
          <div className="w-px h-2 bg-blue-200" />
        </div>

        {/* EXTRACTED BLOCKS */}
        <div className="flex flex-col items-stretch w-full gap-1.5">
          <span className="font-semibold text-[10px] tracking-[0.18em] uppercase text-blue-700">
            <Trans>Extracted Blocks</Trans>
          </span>

          <BlockCard
            icon={<Type className="w-3 h-3" strokeWidth={2.25} />}
            label={<Trans>Heading</Trans>}
            highlighted
          >
            <p className="text-[12px] font-bold text-foreground leading-tight">
              <Trans>Section 3 · Overview</Trans>
            </p>
          </BlockCard>

          <BlockCard
            icon={<Type className="w-3 h-3" strokeWidth={2.25} />}
            label={<Trans>Paragraph</Trans>}
            meta={<Trans>22 words</Trans>}
          >
            <p className="text-[10px] text-muted-foreground leading-snug">
              <Trans>
                Each section introduces a new theme with worked examples,
                followed by short practice activities at the end of the page.
              </Trans>
            </p>
          </BlockCard>

          <BlockCard
            icon={<List className="w-3 h-3" strokeWidth={2.25} />}
            label={<Trans>List</Trans>}
            meta={<Trans>3 items</Trans>}
          >
            <ul className="text-[10px] text-muted-foreground leading-snug list-disc pl-3.5 space-y-[1px]">
              <li>
                <Trans>Read the prompt aloud</Trans>
              </li>
              <li>
                <Trans>Identify the key idea</Trans>
              </li>
              <li>
                <Trans>Try the practice problem</Trans>
              </li>
            </ul>
          </BlockCard>

          <BlockCard
            icon={<ImageIcon className="w-3 h-3" strokeWidth={2} />}
            label={<Trans>Image</Trans>}
            meta="842×320"
          >
            <div className="w-full h-9 rounded-[3px] bg-gradient-to-br from-blue-100 via-sky-100 to-indigo-100" />
          </BlockCard>

          <BlockCard
            icon={<Type className="w-3 h-3" strokeWidth={2.25} />}
            label={<Trans>Paragraph</Trans>}
            faded
          >
            <div className="flex flex-col gap-[3px]">
              <div className="h-[3px] w-full rounded-[1px] bg-blue-200/60" />
              <div className="h-[3px] w-[80%] rounded-[1px] bg-blue-200/60" />
            </div>
          </BlockCard>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-center gap-2 mt-auto pt-1">
          <span className="tracking-[0.3em] text-[10px] font-bold text-blue-400">···</span>
          <span className="text-[10px] font-medium text-blue-600/70">
            <Trans>and many more blocks across the entire book</Trans>
          </span>
        </div>
      </div>
    </div>
  )
}

function BlockCard({
  icon,
  label,
  meta,
  highlighted = false,
  faded = false,
  children,
}: {
  icon: ReactNode
  label: ReactNode
  meta?: ReactNode
  highlighted?: boolean
  faded?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 flex flex-col gap-1.5 transition-colors",
        highlighted
          ? "border-blue-400/60 bg-blue-50/70"
          : faded
            ? "border-dashed border-blue-200/70 bg-background/60"
            : "border-blue-200 bg-background",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn(faded ? "text-blue-400" : "text-blue-500")}>{icon}</span>
        <span
          className={cn(
            "font-semibold text-[8.5px] tracking-[0.16em] uppercase",
            faded ? "text-blue-500/70" : "text-blue-700",
          )}
        >
          {label}
        </span>
        {meta && (
          <span className="ml-auto font-mono text-[8.5px] text-blue-500/70 tabular-nums">
            {meta}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}
