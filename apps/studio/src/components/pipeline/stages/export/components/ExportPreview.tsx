import type { ReactNode } from "react"
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  Bookmark,
  BookText,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Database,
  FileDown,
  FileImage,
  FilePlus2,
  FileText,
  FolderArchive,
  FolderTree,
  Globe,
  GraduationCap,
  Home,
  Landmark,
  Library,
  Lock,
  Search,
  Settings,
  Tablet,
  Type,
  Volume2,
} from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { ExportFormat } from "../export-formats"

interface FormatVisual {
  accent: string
  accentSoft: string
  accentText: string
  accentBorder: string
  Icon: typeof FileDown
  eyebrow: ReactNode
  tagline: ReactNode
  footerHint: ReactNode
}

const FORMAT_VISUALS: Record<ExportFormat, FormatVisual> = {
  project: {
    accent: "bg-emerald-600",
    accentSoft: "bg-emerald-50",
    accentText: "text-emerald-700",
    accentBorder: "border-emerald-200",
    Icon: FolderArchive,
    eyebrow: <Trans>Project Archive</Trans>,
    tagline: <Trans>Full project backup &amp; transfer</Trans>,
    footerHint: (
      <Trans>
        Use this format to back up the project or move it to another machine.
      </Trans>
    ),
  },
  adt: {
    accent: "bg-sky-600",
    accentSoft: "bg-sky-50",
    accentText: "text-sky-700",
    accentBorder: "border-sky-200",
    Icon: Globe,
    eyebrow: <Trans>Web Export</Trans>,
    tagline: <Trans>Self-contained ADT web app</Trans>,
    footerHint: (
      <Trans>
        Drop the bundle on any static host to serve the book as a website.
      </Trans>
    ),
  },
  scorm: {
    accent: "bg-amber-600",
    accentSoft: "bg-amber-50",
    accentText: "text-amber-700",
    accentBorder: "border-amber-200",
    Icon: GraduationCap,
    eyebrow: <Trans>SCORM Package</Trans>,
    tagline: <Trans>LMS-ready with completion tracking</Trans>,
    footerHint: (
      <Trans>
        Upload to an LMS to track progress, quiz results, and completion.
      </Trans>
    ),
  },
  webpub: {
    accent: "bg-blue-600",
    accentSoft: "bg-blue-50",
    accentText: "text-blue-700",
    accentBorder: "border-blue-200",
    Icon: Tablet,
    eyebrow: <Trans>Web Publication</Trans>,
    tagline: <Trans>Readium-compatible digital book</Trans>,
    footerHint: (
      <Trans>
        Distribute through Readium-compatible reading apps and libraries.
      </Trans>
    ),
  },
  epub: {
    accent: "bg-purple-600",
    accentSoft: "bg-purple-50",
    accentText: "text-purple-700",
    accentBorder: "border-purple-200",
    Icon: BookText,
    eyebrow: <Trans>EPUB 3</Trans>,
    tagline: <Trans>Standard e-book for readers &amp; libraries</Trans>,
    footerHint: (
      <Trans>
        Open in any EPUB 3 reader, e-reader, or accessibility tool.
      </Trans>
    ),
  },
  pnld: {
    accent: "bg-teal-600",
    accentSoft: "bg-teal-50",
    accentText: "text-teal-700",
    accentBorder: "border-teal-200",
    Icon: Landmark,
    eyebrow: <Trans>PNLD Digital Work</Trans>,
    tagline: <Trans>FNDE-ready HTML5 package (.zip)</Trans>,
    footerHint: (
      <Trans>
        Submit to the FNDE PNLD Digital platform and validate with VALIDE.
      </Trans>
    ),
  },
}

export function ExportPreview({
  format,
  isPart,
}: {
  format: ExportFormat
  isPart?: boolean
}) {
  const base = FORMAT_VISUALS[format]
  // A book part exports the project archive as the "Completed Part" the
  // coordinator merges back — reframe the project preview to match.
  const visual: FormatVisual =
    isPart && format === "project"
      ? {
          ...base,
          eyebrow: <Trans>Completed Part</Trans>,
          tagline: <Trans>Return to coordinator</Trans>,
          footerHint: (
            <Trans>
              Send this project archive back to the coordinator to merge into the
              source book.
            </Trans>
          ),
        }
      : base
  const FormatIcon = visual.Icon

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden bg-gradient-to-b from-indigo-50/40 via-white to-white">
      <div className="flex h-full w-full flex-col gap-3 px-5 py-5">
        {/* Header eyebrow */}
        <div className="flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FormatIcon
              className={cn("h-3.5 w-3.5 transition-colors duration-300", visual.accentText)}
              strokeWidth={2}
              aria-hidden
            />
            <span
              key={`eyebrow-${format}`}
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.18em] leading-none transition-colors duration-300",
                visual.accentText,
                "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
              )}
            >
              {visual.eyebrow}
            </span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] leading-none text-[#a3a3a3]">
            <Trans>Sample</Trans>
          </span>
        </div>

        {/* Format-specific demonstration */}
        <div
          key={`visual-${format}`}
          className="flex-1 min-h-0 overflow-hidden motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
        >
          {format === "project" && <ProjectArchiveVisual visual={visual} />}
          {format === "adt" && <WebExportVisual visual={visual} />}
          {format === "scorm" && <ScormVisual visual={visual} />}
          {format === "webpub" && <WebPubVisual visual={visual} />}
          {format === "pnld" && <PnldVisual visual={visual} />}
        </div>

        {/* Footer hint */}
        <div
          key={`footer-${format}`}
          className={cn(
            "flex shrink-0 items-start gap-2.5 rounded-md px-3 py-2 transition-colors duration-300",
            "motion-safe:animate-in motion-safe:fade-in-50 motion-safe:duration-300",
            visual.accentSoft,
          )}
        >
          <FormatIcon
            className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", visual.accentText)}
            strokeWidth={2}
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.14em] leading-none",
                visual.accentText,
              )}
            >
              {visual.tagline}
            </span>
            <span className="text-[11.5px] leading-snug text-[#525252]">
              {visual.footerHint}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjectArchiveVisual({ visual }: { visual: FormatVisual }) {
  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* Filename strip */}
      <div className="flex items-center gap-2.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm">

        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white shadow-sm",
            visual.accent,
          )}
        >
          <FolderArchive className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[12.5px] font-semibold text-[#0a0a0a]">
            book-project.zip
          </span>
          <span className="text-[10.5px] text-[#737373]">
            <Trans>Compressed archive · ~ 42 MB</Trans>
          </span>
        </div>
        <ArrowDownToLine
          className="h-4 w-4 text-[#a3a3a3]"
          strokeWidth={2}
          aria-hidden
        />
      </div>

      {/* File tree */}
      <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-[#e5e5e5] bg-white">
        <div className="flex items-center gap-2 border-b border-[#f0f0f0] px-3 py-2">
          <FolderTree
            className={cn("h-3.5 w-3.5", visual.accentText)}
            strokeWidth={2}
            aria-hidden
          />
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#525252]">
            <Trans>What's inside</Trans>
          </span>
        </div>
        <ul className="flex flex-col gap-px p-2 text-[11.5px] text-[#525252] font-mono">
          <TreeRow icon={Database} label="book.sqlite" />
          <TreeRow icon={FileText} label="source.pdf" />
          <TreeRow icon={FolderTree} label="outputs/" indent={0} bold />
          <TreeRow icon={FileImage} label="images/" indent={1} muted />
          <TreeRow icon={Volume2} label="audio/" indent={1} muted />
          <TreeRow icon={FilePlus2} label="prompts/" indent={1} muted />
          <TreeRow icon={FileText} label="config.yaml" />
        </ul>
      </div>
    </div>
  )
}

function TreeRow({
  icon: Icon,
  label,
  indent = 0,
  muted,
  bold,
}: {
  icon: typeof FileText
  label: string
  indent?: number
  muted?: boolean
  bold?: boolean
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded px-2 py-1",
        muted && "text-[#737373]",
      )}
      style={{ paddingLeft: `${0.5 + indent * 1}rem` }}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
      <span className={cn("truncate", bold && "font-semibold")}>{label}</span>
    </li>
  )
}

function WebExportVisual({ visual }: { visual: FormatVisual }) {
  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* Browser chrome */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border border-[#e5e5e5] bg-white shadow-sm">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-[#f0f0f0] bg-[#fafafa] px-2.5 py-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-300" aria-hidden />
          <span className="h-2 w-2 rounded-full bg-amber-300" aria-hidden />
          <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
          <div className="ml-2 flex flex-1 items-center gap-1.5 rounded-md bg-white px-2 py-0.5 ring-1 ring-[#e5e5e5]">
            <Lock className="h-2.5 w-2.5 text-[#a3a3a3]" strokeWidth={2.25} aria-hidden />
            <span className="truncate text-[10px] text-[#525252]">
              book.example.com
            </span>
          </div>
        </div>
        {/* Page body */}
        <div className="flex flex-1 min-h-0 flex-col gap-2 p-3">
          <div className="flex items-center gap-1.5 text-[10px] text-sky-700">
            <Home className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
            <span className="font-medium">
              <Trans>Home / Chapter 1</Trans>
            </span>
          </div>
          <div className="h-3 w-2/3 rounded-full bg-[#0a0a0a]/80" />
          <div className="flex flex-col gap-1 pt-1">
            <div className="h-1.5 w-full rounded-full bg-[#e5e5e5]" />
            <div className="h-1.5 w-11/12 rounded-full bg-[#e5e5e5]" />
            <div className="h-1.5 w-10/12 rounded-full bg-[#e5e5e5]" />
          </div>
          <div className={cn("mt-1 h-16 rounded-md", visual.accentSoft)} />
          <div className="flex flex-col gap-1 pt-1">
            <div className="h-1.5 w-full rounded-full bg-[#e5e5e5]" />
            <div className="h-1.5 w-4/5 rounded-full bg-[#e5e5e5]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ScormVisual({ visual }: { visual: FormatVisual }) {
  return (
    <div className="flex h-full flex-col gap-2.5">
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border border-[#e5e5e5] bg-white shadow-sm">
        {/* LMS course header */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-2.5 border-b px-3 py-2.5",
            visual.accentSoft,
            visual.accentBorder,
          )}
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white shadow-sm",
              visual.accent,
            )}
          >
            <GraduationCap className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={cn("text-[10px] font-semibold uppercase tracking-wider", visual.accentText)}>
              <Trans>Course</Trans>
            </span>
            <span className="truncate text-[11.5px] font-semibold text-[#0a0a0a]">
              <Trans>Introduction to Photosynthesis</Trans>
            </span>
          </div>
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700">
            <Trans>Live</Trans>
          </span>
        </div>
        {/* Progress */}
        <div className="flex shrink-0 flex-col gap-1.5 px-3 py-2.5">
          <div className="flex items-center justify-between text-[10.5px] text-[#737373]">
            <span className="font-medium">
              <Trans>Completion</Trans>
            </span>
            <span className="font-mono tabular-nums">68%</span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#f5f5f5]">
            <span
              className={cn("absolute left-0 top-0 h-full rounded-full", visual.accent)}
              style={{ width: "68%" }}
              aria-hidden
            />
          </div>
        </div>
        {/* Module list */}
        <ul className="flex-1 min-h-0 overflow-y-auto p-2 text-[11px]">
          <ScormRow label="Lesson 1 · Overview" done />
          <ScormRow label="Lesson 2 · Light reactions" done />
          <ScormRow label="Lesson 3 · The Calvin cycle" inProgress />
          <ScormRow label="Quiz · Chapter 1" muted />
          <ScormRow label="Lesson 4 · Photorespiration" muted />
        </ul>
        {/* Stats footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-[#f0f0f0] bg-[#fafafa] px-3 py-2 text-[10px] text-[#737373]">
          <span className="inline-flex items-center gap-1">
            <Activity className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
            <Trans>Score 84%</Trans>
          </span>
          <span className="inline-flex items-center gap-1">
            <BarChart3 className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
            <Trans>3 of 5 modules</Trans>
          </span>
        </div>
      </div>
    </div>
  )
}

function ScormRow({
  label,
  done,
  inProgress,
  muted,
}: {
  label: string
  done?: boolean
  inProgress?: boolean
  muted?: boolean
}) {
  return (
    <li className="flex items-center gap-2 rounded px-2 py-1.5">
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          done
            ? "border-emerald-300 bg-emerald-100 text-emerald-700"
            : inProgress
              ? "border-amber-300 bg-amber-100 text-amber-700"
              : "border-[#e5e5e5] bg-white text-[#a3a3a3]",
        )}
      >
        {done ? (
          <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
        ) : inProgress ? (
          <Circle className="h-1.5 w-1.5 fill-current" strokeWidth={3} aria-hidden />
        ) : null}
      </span>
      <span className={cn("flex-1 truncate", muted && "text-[#a3a3a3]")}>
        {label}
      </span>
    </li>
  )
}

function WebPubVisual({ visual }: { visual: FormatVisual }) {
  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* Publication identity card */}
      <div className="flex shrink-0 items-center gap-2.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white shadow-sm",
            visual.accent,
          )}
        >
          <Library className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[12.5px] font-semibold text-[#0a0a0a]">
            book.webpub
          </span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-[#737373]">
            <Trans>Readium Web Publication</Trans>
            <span className="text-[#d4d4d4]">·</span>
            <span className="font-mono">manifest.json</span>
          </span>
        </div>
      </div>

      {/* Device + reader */}
      <div className="relative flex flex-1 min-h-0 items-center justify-center">
        <div className="relative aspect-[3/4] h-full max-h-[300px] rounded-[20px] border-[7px] border-[#0a0a0a] bg-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.4)]">
          {/* Screen */}
          <div className="flex h-full flex-col overflow-hidden rounded-[12px] bg-[#fafaf7]">
            {/* Top reader bar */}
            <div className="flex shrink-0 items-center justify-between border-b border-[#ececec] bg-white px-2.5 py-2">
              <span className="flex items-center gap-1.5">
                <ChevronLeft
                  className="h-3 w-3 text-[#737373]"
                  strokeWidth={2.25}
                  aria-hidden
                />
                <Library
                  className={cn("h-2.5 w-2.5", visual.accentText)}
                  strokeWidth={2.25}
                  aria-hidden
                />
              </span>
              <span
                className={cn(
                  "truncate text-[8.5px] font-semibold uppercase tracking-[0.14em]",
                  visual.accentText,
                )}
              >
                <Trans>Chapter 3</Trans>
              </span>
              <span className="flex items-center gap-1">
                <Search className="h-2.5 w-2.5 text-[#a3a3a3]" strokeWidth={2.25} aria-hidden />
                <Type className="h-2.5 w-2.5 text-[#a3a3a3]" strokeWidth={2.25} aria-hidden />
                <Settings className="h-2.5 w-2.5 text-[#a3a3a3]" strokeWidth={2.25} aria-hidden />
              </span>
            </div>

            {/* Page content */}
            <div className="flex flex-1 min-h-0 flex-col gap-1.5 px-3 pt-3 pb-2">
              <div className="h-2.5 w-4/5 rounded-full bg-[#0a0a0a]/85" />
              <div className="h-1 w-1/2 rounded-full bg-[#a3a3a3]/60" />
              <div className="mt-1.5 flex flex-col gap-1">
                <div className="h-1 w-full rounded-full bg-[#dcdcdc]" />
                <div className="h-1 w-11/12 rounded-full bg-[#dcdcdc]" />
                <div className="h-1 w-10/12 rounded-full bg-[#dcdcdc]" />
                <div className="h-1 w-full rounded-full bg-[#dcdcdc]" />
                <div className="h-1 w-9/12 rounded-full bg-[#dcdcdc]" />
              </div>
              <div className="mt-1 flex items-center gap-2 rounded border border-[#ececec] bg-white p-1.5">
                <div className={cn("h-10 w-10 shrink-0 rounded", visual.accentSoft)} />
                <div className="flex flex-1 flex-col gap-1">
                  <div className="h-1 w-3/4 rounded-full bg-[#dcdcdc]" />
                  <div className="h-1 w-2/3 rounded-full bg-[#dcdcdc]" />
                  <div className="h-1 w-5/6 rounded-full bg-[#dcdcdc]" />
                </div>
              </div>
              <div className="mt-1 flex flex-col gap-1">
                <div className="h-1 w-full rounded-full bg-[#dcdcdc]" />
                <div className="h-1 w-4/5 rounded-full bg-[#dcdcdc]" />
                <div className="h-1 w-3/4 rounded-full bg-[#dcdcdc]" />
              </div>
            </div>

            {/* Page navigation */}
            <div className="flex shrink-0 items-center justify-between border-t border-[#ececec] bg-white px-2.5 py-1.5">
              <ChevronLeft
                className="h-3 w-3 text-[#a3a3a3]"
                strokeWidth={2.25}
                aria-hidden
              />
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[8.5px] tabular-nums text-[#525252]">
                  38 / 64
                </span>
                <Bookmark
                  className={cn("h-2.5 w-2.5", visual.accentText)}
                  strokeWidth={2}
                  aria-hidden
                />
              </div>
              <ChevronRight
                className={cn("h-3 w-3", visual.accentText)}
                strokeWidth={2.25}
                aria-hidden
              />
            </div>

            {/* Progress strip */}
            <div className="shrink-0 bg-white px-2.5 pb-1.5">
              <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-[#ececec]">
                <span
                  className={cn(
                    "absolute left-0 top-0 h-full rounded-full",
                    visual.accent,
                  )}
                  style={{ width: "59%" }}
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compatibility chips */}
      <div className="flex shrink-0 flex-col gap-1">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#a3a3a3]">
          <Trans>Reads in</Trans>
        </span>
        <div className="flex flex-wrap gap-1">
          <CompatChip label={<Trans>Thorium Reader</Trans>} visual={visual} />
          <CompatChip label={<Trans>Readium Web</Trans>} visual={visual} />
          <CompatChip label={<Trans>Library apps</Trans>} visual={visual} />
        </div>
      </div>
    </div>
  )
}

function PnldVisual({ visual }: { visual: FormatVisual }) {
  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* Work identity card */}
      <div className="flex shrink-0 items-center gap-2.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 shadow-sm">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white shadow-sm",
            visual.accent,
          )}
        >
          <Landmark className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[12.5px] font-semibold text-[#0a0a0a]">
            obra.zip
          </span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-[#737373]">
            <Trans>PNLD Digital · FNDE</Trans>
            <span className="text-[#d4d4d4]">·</span>
            <span className="font-mono">
              <Trans>HTML5 + EPUB</Trans>
            </span>
          </span>
        </div>
        <ArrowDownToLine className="h-4 w-4 text-[#a3a3a3]" strokeWidth={2} aria-hidden />
      </div>

      {/* Mandated package structure */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border border-[#e5e5e5] bg-white">
        <div className="flex shrink-0 items-center gap-2 border-b border-[#f0f0f0] px-3 py-2">
          <FolderTree
            className={cn("h-3.5 w-3.5", visual.accentText)}
            strokeWidth={2}
            aria-hidden
          />
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#525252]">
            <Trans>Package structure</Trans>
          </span>
        </div>
        <ul className="flex flex-1 min-h-0 flex-col gap-px overflow-y-auto p-2 text-[11.5px] text-[#525252] font-mono">
          <TreeRow icon={Globe} label="index.html" />
          <TreeRow icon={FolderTree} label="content/" bold />
          <TreeRow icon={FileText} label="unidade_1.html" indent={1} muted />
          <TreeRow icon={FolderTree} label="resources/" bold />
          <TreeRow icon={FileImage} label="images/" indent={1} muted />
          <TreeRow icon={Type} label="fonts/" indent={1} muted />
          <TreeRow icon={FileText} label="content.opf" />
          <TreeRow icon={FileText} label="toc.ncx" />
          <TreeRow icon={FileImage} label="cover.jpg" />
        </ul>
      </div>

      {/* Official-reader validation strip */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2",
          visual.accentBorder,
          visual.accentSoft,
        )}
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white",
            visual.accent,
          )}
        >
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
        </span>
        <span className={cn("text-[10.5px] font-medium leading-snug", visual.accentText)}>
          <Trans>Validates in VALIDE Desktop — the official PNLD reader</Trans>
        </span>
      </div>
    </div>
  )
}

function CompatChip({
  label,
  visual,
}: {
  label: ReactNode
  visual: FormatVisual
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[10.5px] font-medium",
        visual.accentBorder,
        visual.accentText,
      )}
    >
      <Tablet className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
      {label}
    </span>
  )
}
