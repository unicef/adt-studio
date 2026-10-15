import { Link, useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileDown, LayoutGrid, Play, Settings } from "lucide-react"
import { BookCover } from "@/components/app/BookCover"
import { deriveCover } from "@/components/app/data"
import { useVariant } from "@/components/app/lab/variants"
import { APP_PATHS } from "@/components/app/nav"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { NO_DRAG_REGION } from "@/constants"
import { useAppLogo } from "@/hooks/use-app-logo"
import { useBookRun } from "@/hooks/use-book-run"
import { useBooks } from "@/hooks/use-books"
import { cn } from "@/lib/utils"
import { PipelineRunIndicator } from "@/components/app/screens/pipeline/runs/PipelineRunIndicator"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"

type SlotRef = (node: HTMLElement | null) => void

export interface WorkspaceTopBarProps {
  label: string
  section: string | undefined
  stage?: boolean
  slotRefs: { left: SlotRef; center: SlotRef; right: SlotRef }
}

const quietButtonClassName = "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none"

function areaOf(section: string | undefined): "storyboard" | "settings" | "export" | null {
  if (section === "settings") return "settings"
  if (section === "export") return "export"
  if (section === "preview") return null
  return "storyboard"
}

function AreaTabs({ label, section }: { label: string; section: string | undefined }) {
  const { t } = useLingui()
  const nav = usePipelineNavigation(label)
  const navigate = useNavigate()
  const area = areaOf(section)
  const tabs = [
    { key: "storyboard", label: t`Storyboard`, icon: LayoutGrid, onClick: nav.openWorkspace },
    { key: "settings", label: t`Settings`, icon: Settings, onClick: nav.openBookInfo },
    { key: "export", label: t`Export`, icon: FileDown, onClick: () => void navigate({ to: "/pipeline/$label/export", params: { label } }) },
  ] as const

  return (
    <nav aria-label={t`Book areas`} style={NO_DRAG_REGION} className="flex items-center gap-0.5">
      {tabs.map((tab) => {
        const active = area === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={active ? undefined : tab.onClick}
            className={cn(
              quietButtonClassName,
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <tab.icon className="size-3.5" strokeWidth={2} />
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}

function BookName({ label }: { label: string }) {
  const { data: books } = useBooks()
  const book = books?.find((candidate) => candidate.label === label)
  const title = book?.title || label
  return (
    <span className="flex min-w-0 items-center gap-2">
      {book && (
        <span className="h-6 w-[18px] shrink-0 overflow-hidden rounded-[3px] shadow-[0_1px_3px_rgb(0_0_0/0.2)] [&>div]:rounded-[3px] [&>div]:border-0">
          <BookCover title={title} author={book.authors.join(", ")} cover={deriveCover(book)} fit="cover" />
        </span>
      )}
      <span title={title} className="max-w-[260px] truncate text-[13px] font-semibold">
        {title}
      </span>
    </span>
  )
}

export function WorkspaceTopBar({ label, section, stage, slotRefs }: WorkspaceTopBarProps) {
  const { t } = useLingui()
  const logoSrc = useAppLogo()
  const tbLeft = useVariant("tbleft")
  const tbCenter = useVariant("tbcenter")
  const entryVariant = useVariant("entry")
  const nav = usePipelineNavigation(label)
  const navigate = useNavigate()
  const { stageState } = useBookRun()
  const { data: books } = useBooks()
  const title = books?.find((candidate) => candidate.label === label)?.title || label
  const previewReady = stageState("storyboard") === "done"
  const inSettings = section === "settings"
  const locationLeft = tbCenter === "status"

  const location = (
    <>
      {tbLeft === "tabs" && (
        <span title={title} className={cn("min-w-0 max-w-[220px] truncate text-[13px] text-muted-foreground", locationLeft && "max-xl:hidden")}>
          {title}
        </span>
      )}
      {tbLeft === "tabs" && <span className={cn("text-muted-foreground/50", locationLeft && "max-xl:hidden")}>/</span>}
      <div ref={slotRefs.left} className="flex min-w-0 items-center gap-2" />
    </>
  )

  return (
    <header
      data-chrome="topbar"
      data-tb-style="workspace"
      data-stage={stage ? "" : undefined}
      className="drag-region relative flex h-13 shrink-0 items-center gap-3 border-b bg-card px-2.5"
    >
      <div className={cn("flex min-w-0 flex-1 items-center gap-2.5", locationLeft && "basis-auto")}>
        <Link
          to={entryVariant !== "current" ? "/" : APP_PATHS.library}
          style={NO_DRAG_REGION}
          title={t`Home`}
          aria-label={t`Home`}
          className="grid size-9 shrink-0 place-items-center rounded-[10px] transition-[background-color,scale] duration-150 ease-out hover:bg-muted active:scale-[0.96]"
        >
          <img src={logoSrc} alt="" className="size-6 rounded-[7px] shadow-[0_2px_6px_rgba(43,127,255,0.35)]" />
        </Link>
        {tbLeft === "tabs" ? <AreaTabs label={label} section={section} /> : <BookName label={label} />}
        {locationLeft && !inSettings && (
          <>
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            {location}
          </>
        )}
      </div>

      <div className="flex min-w-0 shrink items-center justify-center gap-2">
        {!locationLeft && !inSettings && location}
        {locationLeft && <div ref={slotRefs.center} className="flex min-w-0 items-center justify-center gap-1.5" />}
      </div>

      <div style={NO_DRAG_REGION} className={cn("flex min-w-0 flex-1 items-center justify-end gap-1.5", locationLeft && "basis-auto")}>
        {!locationLeft && <div ref={slotRefs.center} className="flex min-w-0 items-center justify-end gap-1.5 opacity-90" />}
        <div ref={slotRefs.right} className="flex items-center gap-1.5 whitespace-nowrap" />
        <PipelineRunIndicator variant="text" />
        <button
          type="button"
          onClick={() => nav.openPreview(null)}
          disabled={!previewReady || section === "preview"}
          title={previewReady ? t`Preview the book` : t`Available once all pages are built`}
          aria-label={t`Preview the book`}
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground transition-[background-color,scale,opacity] duration-150 ease-out hover:bg-accent active:scale-[0.95] disabled:pointer-events-none disabled:opacity-45"
        >
          <Play className="size-3.5 fill-current" />
        </button>
        <button
          type="button"
          onClick={() => void navigate({ to: "/pipeline/$label/export", params: { label } })}
          disabled={!previewReady || section === "export"}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-[background-color,scale,opacity] duration-150 ease-out hover:bg-brand-700 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"
        >
          <Trans>Export</Trans>
        </button>
        <TitleBarControls className="-my-px -mr-2.5 h-13" />
      </div>
    </header>
  )
}
