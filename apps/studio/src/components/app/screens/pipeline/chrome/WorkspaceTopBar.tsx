import { useId } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { CirclePlay } from "lucide-react"
import { useVariant } from "@/components/app/lab/variants"
import { APP_PATHS } from "@/components/app/nav"
import { MacOSTrafficLightSpacer } from "@/components/title-bar"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { DRAG_REGION, NO_DRAG_REGION } from "@/constants"
import { useAppLogo } from "@/hooks/use-app-logo"
import { useBookRun } from "@/hooks/use-book-run"
import { useBooks } from "@/hooks/use-books"
import { cn } from "@/lib/utils"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import { SkipToCanvas } from "./SkipToCanvas"
import { BookMenu } from "./bar/BookMenu"
import { StatusRing } from "./bar/StatusRing"

type SlotRef = (node: HTMLElement | null) => void

export interface WorkspaceTopBarProps {
  label: string
  section: string | undefined
  stage?: boolean
  slotRefs: { left: SlotRef; center: SlotRef; right: SlotRef }
}

export function WorkspaceTopBar({ label, section, stage, slotRefs }: WorkspaceTopBarProps) {
  const { t } = useLingui()
  const logoSrc = useAppLogo()
  const entryVariant = useVariant("entry")
  const nav = usePipelineNavigation(label)
  const navigate = useNavigate()
  const { stageState } = useBookRun()
  const { data: books } = useBooks()
  const title = books?.find((candidate) => candidate.label === label)?.title || label
  const previewReady = stageState("storyboard") === "done"
  const waitId = useId()
  const onPreview = section === "preview"
  const onExport = section === "export"

  return (
    <header
      data-chrome="topbar"
      data-tb-style="workspace"
      data-stage={stage ? "" : undefined}
      className="drag-region relative grid h-13 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b bg-card px-2.5"
    >
      <SkipToCanvas />
      <h1 className="sr-only">{title}</h1>
      <div className="flex min-w-0 items-center gap-2.5 self-stretch">
        <MacOSTrafficLightSpacer style={DRAG_REGION} />
        <Link
          to={entryVariant !== "current" ? "/" : APP_PATHS.library}
          style={NO_DRAG_REGION}
          title={t`Home`}
          aria-label={t`Home`}
          className="grid size-9 shrink-0 place-items-center rounded-[10px] transition-[background-color,scale] duration-150 ease-out hover:bg-muted active:scale-[0.96] motion-reduce:active:scale-100"
        >
          <img src={logoSrc} alt="" className="size-6 rounded-[7px] shadow-[0_2px_6px_rgba(43,127,255,0.35)]" />
        </Link>
        <BookMenu label={label} />
      </div>

      <div className="flex min-w-0 items-center justify-center gap-2">
        <div ref={slotRefs.left} className="flex min-w-0 items-center gap-2" />
      </div>

      <div style={NO_DRAG_REGION} className="flex min-w-0 items-center justify-end gap-1.5">
        <div ref={slotRefs.center} className="flex min-w-0 items-center justify-end gap-1.5 opacity-90" />
        <div
          ref={slotRefs.right}
          className="flex items-center gap-1.5 whitespace-nowrap has-[*]:after:ml-1.5 has-[*]:after:h-5 has-[*]:after:w-px has-[*]:after:bg-border has-[*]:after:content-['']"
        />
        <StatusRing label={label} />
        <button
          type="button"
          onClick={() => {
            if (previewReady && !onPreview) nav.openPreview(null)
          }}
          aria-current={onPreview ? "page" : undefined}
          aria-label={t`Preview the book`}
          aria-disabled={(!previewReady && !onPreview) || undefined}
          aria-describedby={previewReady ? undefined : waitId}
          title={previewReady ? t`Preview the book` : t`Available once all pages are built`}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-(--bar-tint) pl-2 pr-3 text-[13px] font-semibold text-(--bar-ink) ring-1 ring-(--bar-line) ring-inset transition-[background-color,color,box-shadow,scale,opacity] duration-300 ease-out hover:bg-(--bar-tint-hover) active:scale-[0.97] aria-disabled:cursor-default aria-disabled:opacity-45 aria-disabled:hover:bg-(--bar-tint) aria-disabled:active:scale-100 max-lg:px-2 motion-reduce:transition-none motion-reduce:active:scale-100",
            "dark:bg-(--bar-tint-dark) dark:text-(--bar-ink-dark) dark:hover:bg-(--bar-tint-dark-hover) dark:aria-disabled:hover:bg-(--bar-tint-dark)",
            onPreview && "ring-2 ring-(--bar-glow)",
          )}
        >
          <CirclePlay className="size-[18px]" strokeWidth={2} />
          <span className="max-lg:hidden">
            <Trans>Preview</Trans>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (previewReady && !onExport) void navigate({ to: "/pipeline/$label/export", params: { label } })
          }}
          aria-disabled={!previewReady || undefined}
          aria-current={onExport ? "page" : undefined}
          aria-describedby={previewReady ? undefined : waitId}
          aria-label={t`Export the book`}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-(--bar-solid) px-3.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.18),0_6px_16px_-6px_var(--bar-glow)] ring-1 ring-white/15 ring-inset transition-[background-color,color,box-shadow,scale,opacity] duration-300 ease-out hover:bg-(--bar-solid-hover) hover:shadow-[0_1px_2px_rgba(0,0,0,0.18),0_8px_20px_-6px_var(--bar-glow)] active:scale-[0.97] aria-disabled:cursor-default aria-disabled:opacity-45 aria-disabled:shadow-none aria-disabled:hover:bg-(--bar-solid) aria-disabled:active:scale-100 aria-[current=page]:ring-2 aria-[current=page]:ring-(--bar-glow) aria-[current=page]:ring-offset-2 aria-[current=page]:ring-offset-card motion-reduce:transition-none motion-reduce:active:scale-100",
            "dark:bg-(--bar-solid-dark) dark:text-neutral-950 dark:ring-black/10 dark:hover:bg-(--bar-solid-dark-hover) dark:aria-disabled:hover:bg-(--bar-solid-dark)",
          )}
        >
          <Trans>Export</Trans>
        </button>
        {!previewReady && (
          <span id={waitId} className="sr-only">
            {t`Available once all pages are built`}
          </span>
        )}
        <TitleBarControls className="-my-px -mr-2.5 h-13" />
      </div>
    </header>
  )
}
