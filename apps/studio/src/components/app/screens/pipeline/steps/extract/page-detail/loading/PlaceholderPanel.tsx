import { Trans } from "@lingui/react/macro"
import { FileText, Image as ImageIcon, Type, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { PageSummaryItem } from "@/api/client"
import { cn } from "@/lib/utils"
import { IMAGE_PREVIEW } from "../sections/ImagesSection"
import { READING_TEXT, TEXT_PREVIEW_LINES } from "../sections/TextSection"
import { SkeletonBar, SkeletonLine } from "./SkeletonBar"

const SKELETON_IMAGES = 3
const SKELETON_TEXT_LINES = 6
const CLAMP_CHARS_PER_LINE = 72
const PANEL_CHARS_PER_LINE = 48
const CHARS_PER_WORD = 6
const LINE_WIDTHS = ["w-full", "w-[96%]", "w-[91%]", "w-[98%]", "w-[87%]", "w-[94%]", "w-[89%]", "w-3/5"]
const ROW_WIDTHS = ["w-20", "w-24", "w-16", "w-[5.5rem]", "w-20", "w-14"]

function Header({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <header className="flex min-h-7 items-center gap-2">
      <Icon className="size-3.5 text-muted-foreground" />
      {children}
    </header>
  )
}

function TitleBar({ className }: { className?: string }) {
  return (
    <span className="flex h-[1lh] items-center text-[13px]">
      <SkeletonBar className={cn("h-3", className)} />
    </span>
  )
}

function EmptyLine({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <p className="flex min-h-7 items-center gap-2 text-[12.5px] text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <SkeletonBar className="h-2.5 w-40" />
    </p>
  )
}

function ImageRows({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex h-[1lh] items-center text-[12px]">
        <SkeletonBar className="h-2.5 w-16" />
      </span>
      <div className="flex flex-col">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="flex h-8 items-center gap-2 pr-1 pl-1.5">
            <SkeletonBar className="h-5 w-6" />
            <SkeletonBar className="size-6 rounded border border-transparent" />
            <SkeletonBar className={cn("h-2.5", ROW_WIDTHS[index % ROW_WIDTHS.length])} />
          </div>
        ))}
      </div>
    </div>
  )
}

function textLines(summary: PageSummaryItem): { preview: string; previewLines: number; more: number; clamped: boolean } {
  const preview = summary.textPreview.trim()
  const chars = summary.wordCount * CHARS_PER_WORD
  const clamped = chars / CLAMP_CHARS_PER_LINE > TEXT_PREVIEW_LINES
  const previewLines = Math.max(1, Math.ceil(preview.length / PANEL_CHARS_PER_LINE))
  const total = clamped ? TEXT_PREVIEW_LINES : Math.min(TEXT_PREVIEW_LINES, Math.max(previewLines, Math.ceil(chars / PANEL_CHARS_PER_LINE)))
  return { preview, previewLines, more: Math.max(0, total - previewLines), clamped }
}

export function PlaceholderPanel({ summary }: { summary: PageSummaryItem | null }) {
  const imageCount = summary?.imageCount ?? null
  const text = summary && summary.wordCount > 0 && summary.textPreview.trim() ? textLines(summary) : null

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden p-4">
        {imageCount === 0 ? (
          <EmptyLine icon={ImageIcon} />
        ) : (
          <section className="flex flex-col gap-2.5">
            <Header icon={ImageIcon}>
              {imageCount != null ? (
                <h2 className="text-[13px] font-semibold text-foreground">
                  <Trans>Images · {imageCount}</Trans>
                </h2>
              ) : (
                <TitleBar className="w-20" />
              )}
            </Header>
            <ImageRows count={imageCount != null ? Math.min(imageCount, IMAGE_PREVIEW) : SKELETON_IMAGES} />
          </section>
        )}

        {summary && summary.wordCount === 0 ? (
          <EmptyLine icon={FileText} />
        ) : (
          <section className="flex flex-col gap-2.5">
            <Header icon={FileText}>
              {summary ? (
                <h2 className="text-[13px] font-semibold text-foreground">
                  <Trans>Text</Trans>
                </h2>
              ) : (
                <TitleBar className="w-10" />
              )}
            </Header>
            <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3.5">
              <div className={cn(READING_TEXT, "text-[14px] leading-relaxed")}>
                {text && <p>{text.preview}</p>}
                {Array.from({ length: text ? text.more : SKELETON_TEXT_LINES }, (_, index) => (
                  <SkeletonLine key={index} className={LINE_WIDTHS[(index + (text?.previewLines ?? 0)) % LINE_WIDTHS.length]} />
                ))}
              </div>
              {text?.clamped && (
                <span className="flex h-[1lh] items-center text-[12px]">
                  <SkeletonBar className="h-2.5 w-16" />
                </span>
              )}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2.5">
          <Header icon={Type}>
            {summary ? (
              <h2 className="text-[13px] font-semibold text-foreground">
                <Trans>Fonts</Trans>
              </h2>
            ) : (
              <TitleBar className="w-12" />
            )}
          </Header>
          <div className="flex flex-wrap gap-1.5">
            <SkeletonBar className="h-7 w-28 rounded-full" />
            <SkeletonBar className="h-7 w-20 rounded-full" />
          </div>
        </section>
      </div>
    </aside>
  )
}
