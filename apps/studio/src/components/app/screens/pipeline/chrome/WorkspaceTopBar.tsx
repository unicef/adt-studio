import { useId } from "react"
import { Link, useRouter, useRouterState } from "@tanstack/react-router"
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
import { closePreviewSurface, useOpenPreviewTarget } from "@/components/app/screens/pipeline/preview/surfaces/previewSurface"
import { useAllPagesPruned } from "@/hooks/use-all-pages-pruned"
import { ExportLauncher } from "@/components/app/screens/pipeline/export/surfaces/ExportLauncher"
import { ExportProgressRing } from "@/components/app/screens/pipeline/export/surfaces/ExportProgressRing"
import { previewSectionId } from "@/components/app/screens/pipeline/shared/previewTarget"
import { usePipelineState } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { useStoryboardStaleness } from "@/components/app/screens/pipeline/runs/useStoryboardStaleness"

type SlotRef = (node: HTMLElement | null) => void

export interface WorkspaceTopBarProps {
  label: string
  section: string | undefined
  stage?: boolean
  slotRefs: { left: SlotRef; center: SlotRef; right: SlotRef }
}

const EXPORT_BUTTON = cn(
  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-(--bar-solid) px-3.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.18),0_6px_16px_-6px_var(--bar-glow)] ring-1 ring-white/15 ring-inset transition-[background-color,color,box-shadow,scale,opacity] duration-300 ease-out hover:bg-(--bar-solid-hover) hover:shadow-[0_1px_2px_rgba(0,0,0,0.18),0_8px_20px_-6px_var(--bar-glow)] active:scale-[0.97] aria-disabled:cursor-default aria-disabled:opacity-45 aria-disabled:shadow-none aria-disabled:hover:bg-(--bar-solid) aria-disabled:active:scale-100 aria-[current=page]:ring-2 aria-[current=page]:ring-(--bar-glow) aria-[current=page]:ring-offset-2 aria-[current=page]:ring-offset-card motion-reduce:transition-none motion-reduce:active:scale-100",
  "dark:bg-(--bar-solid-dark) dark:text-neutral-950 dark:ring-black/10 dark:hover:bg-(--bar-solid-dark-hover) dark:aria-disabled:hover:bg-(--bar-solid-dark)",
)

export function WorkspaceTopBar({ label, section, stage, slotRefs }: WorkspaceTopBarProps) {
  const { t } = useLingui()
  const logoSrc = useAppLogo()
  const entryVariant = useVariant("entry")
  const nav = usePipelineNavigation(label)
  const { stageState, isStatusLoading } = useBookRun()
  const { allPruned } = useAllPagesPruned(label)
  const { data: books } = useBooks()
  const title = books?.find((candidate) => candidate.label === label)?.title || label
  const previewReady = stageState("storyboard") === "done" && !allPruned
  const waitId = useId()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { pages } = usePipelineState(label)
  const stale = useStoryboardStaleness(label, pages).isStale
  const waitText = allPruned
    ? t`Every page is pruned, so there is nothing to show yet.`
    : stale
      ? t`Some pages are out of date. Rebuild them from the storyboard first.`
      : t`Available once all pages are built`
  const currentPageId = pathname.match(/\/pages\/([^/]+)/)?.[1] ?? null
  const router = useRouter()
  const previewOpen = !!useOpenPreviewTarget()
  const openPreview = () => {
    if (previewOpen) {
      closePreviewSurface(router)
      return
    }
    const page = pages.find((candidate) => candidate.pageId === currentPageId)
    nav.openPreview(previewSectionId(page?.sections, null))
  }

  return (
    <header
      data-chrome="topbar"
      data-tb-style="workspace"
      data-stage={stage ? "" : undefined}
      className="drag-region relative grid h-13 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-b-transparent! bg-card px-2.5"
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
        <ExportProgressRing label={label} />
        <StatusRing label={label} />
        <button
          type="button"
          onClick={() => {
            if (previewReady) openPreview()
          }}
          aria-pressed={previewOpen}
          aria-label={t`Preview the book`}
          aria-disabled={!previewReady || undefined}
          aria-describedby={previewReady ? undefined : waitId}
          title={previewReady ? t`Preview the book` : waitText}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-(--bar-tint) pl-2 pr-3 text-[13px] font-semibold text-(--bar-ink) ring-1 ring-(--bar-line) ring-inset transition-[background-color,color,box-shadow,scale,opacity] duration-300 ease-out hover:bg-(--bar-tint-hover) active:scale-[0.97] aria-disabled:cursor-default aria-disabled:opacity-45 aria-disabled:hover:bg-(--bar-tint) aria-disabled:active:scale-100 max-lg:px-2 motion-reduce:transition-none motion-reduce:active:scale-100",
            "dark:bg-(--bar-tint-dark) dark:text-(--bar-ink-dark) dark:hover:bg-(--bar-tint-dark-hover) dark:aria-disabled:hover:bg-(--bar-tint-dark)",
            previewOpen && "bg-(--bar-solid)! text-white! hover:bg-(--bar-solid-hover)! dark:bg-(--bar-solid-dark)! dark:text-neutral-950!",
          )}
        >
          <CirclePlay className="size-[18px]" strokeWidth={2} />
          <span className="max-lg:hidden">
            <Trans>Preview</Trans>
          </span>
        </button>
        <ExportLauncher
          key={label}
          label={label}
          ready={previewReady}
          settled={!isStatusLoading}
          describedBy={previewReady ? undefined : waitId}
          className={EXPORT_BUTTON}
        />
        {!previewReady && (
          <span id={waitId} className="sr-only">
            {waitText}
          </span>
        )}
        <TitleBarControls className="-my-px -mr-2.5 h-13" />
      </div>
    </header>
  )
}
