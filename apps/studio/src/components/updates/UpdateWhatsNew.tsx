import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"
import { cn, formatBytes } from "@/lib/utils"
import { formatVersion } from "./release-banner-utils"

interface UpdateWhatsNewProps {
  version: string
  releaseDate?: string
  totalBytes?: number
  currentVersion?: string
  notes?: string
}

export function UpdateWhatsNew({
  version,
  releaseDate,
  totalBytes,
  currentVersion,
  notes,
}: UpdateWhatsNewProps) {
  const excerpt = releaseExcerpt(notes)
  return (
    <div className="space-y-2.5 rounded-xl bg-muted/30 p-3.5 text-left shadow-sm ring-1 ring-black/5 dark:ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <VersionPill>{formatVersion(currentVersion ?? "")}</VersionPill>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <VersionPill highlight>{formatVersion(version)}</VersionPill>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {totalBytes != null && <span>{formatBytes(totalBytes)}</span>}
          {totalBytes != null && releaseDate && <span aria-hidden>·</span>}
          {releaseDate && <span>{formatReleaseDate(releaseDate)}</span>}
        </div>
      </div>
      {excerpt && (
        <p className="line-clamp-1 text-pretty text-sm leading-relaxed text-muted-foreground">
          {excerpt}
        </p>
      )}
    </div>
  )
}

function VersionPill({
  children,
  highlight,
}: {
  children: ReactNode
  highlight?: boolean
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium",
        highlight
          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}

function releaseExcerpt(notes?: string): string {
  if (!notes) return ""
  return notes
    .replace(/<picture[\s\S]*?<\/picture>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_`>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function formatReleaseDate(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
