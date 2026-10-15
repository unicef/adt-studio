import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Link, useRouterState } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, House } from "lucide-react"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { NO_DRAG_REGION } from "@/constants"
import { APP_PATHS } from "@/components/app/nav"
import { useChromeRoot } from "@/components/app/lab/chrome"
import { useVariant } from "@/components/app/lab/variants"
import { cn } from "@/lib/utils"
import { PluginDockPills as PluginDock } from "@/components/app/screens/pipeline/plugins/PluginDockPills"
import { STORYBOARD_HEX, isDockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import { usePipelineState } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { useDockMinimized } from "@/components/app/screens/pipeline/shared/workspacePrefs"
import { DockHandle } from "./DockHandle"
import { WorkspaceTopBar } from "./WorkspaceTopBar"

export interface TopBarTone {
  hex: string
  stage?: boolean
  topStep?: string
}

interface Slots {
  left: HTMLElement | null
  center: HTMLElement | null
  right: HTMLElement | null
}

interface ChromeHost {
  slots: Slots
  setTone: (tone: TopBarTone) => void
}

const ChromeContext = createContext<ChromeHost | null>(null)

const DEFAULT_TONE: TopBarTone = { hex: STORYBOARD_HEX, topStep: "home" }

const leftClassName = "flex min-w-0 items-center gap-2"
const centerClassName = "flex min-w-0 flex-1 items-center justify-center gap-1.5"
const rightClassName = "flex items-center gap-1.5"
const enterClassName = "animate-in fade-in duration-200 ease-out motion-reduce:animate-none"

function HomeLink() {
  const { t } = useLingui()
  const entryVariant = useVariant("entry")
  const tbNav = useVariant("topnav")
  const to = entryVariant !== "current" ? "/" : APP_PATHS.library
  const tone = "text-muted-foreground hover:bg-muted hover:text-foreground"

  if (tbNav === "crumbs") {
    return (
      <Link
        to={to}
        style={NO_DRAG_REGION}
        title={entryVariant !== "current" ? t`Home` : t`Library`}
        aria-label={entryVariant !== "current" ? t`Home` : t`Library`}
        className={cn("grid size-8 shrink-0 place-items-center rounded-lg transition-colors", tone)}
      >
        <House className="size-4" />
      </Link>
    )
  }

  return (
    <>
      <Link
        to={to}
        style={NO_DRAG_REGION}
        className={cn("flex h-8 shrink-0 items-center gap-2 rounded-lg px-2 text-[13px] font-medium transition-colors", tone)}
      >
        <ArrowLeft className="size-4" />
        {entryVariant !== "current" ? <Trans>Home</Trans> : <Trans>Library</Trans>}
      </Link>
      <div className="h-5.5 w-px shrink-0 bg-border" />
    </>
  )
}

interface TopBarShellProps {
  tone: TopBarTone
  home?: boolean
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
  slotRefs?: { left: (node: HTMLElement | null) => void; center: (node: HTMLElement | null) => void; right: (node: HTMLElement | null) => void }
}

function TopBarShell({ tone, home = true, left, center, right, slotRefs }: TopBarShellProps) {
  return (
    <header
      data-chrome="topbar"
      data-stage={tone.stage ? "" : undefined}
      className="drag-region relative flex h-13 shrink-0 items-center gap-3.5 border-b bg-card px-3.5"
    >
      {home && <HomeLink />}
      <div ref={slotRefs?.left} className={leftClassName}>
        {left}
      </div>
      <div ref={slotRefs?.center} className={centerClassName}>
        {center}
      </div>
      <div ref={slotRefs?.right} style={NO_DRAG_REGION} className={rightClassName}>
        {right}
      </div>
      <TitleBarControls className="-my-px -mr-3.5 h-13" />
    </header>
  )
}

export interface TopBarProps {
  tone: TopBarTone
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}

export function TopBar({ tone, left, center, right }: TopBarProps) {
  const host = useContext(ChromeContext)
  const setTone = host?.setTone

  useLayoutEffect(() => {
    setTone?.({ hex: tone.hex, stage: tone.stage, topStep: tone.topStep })
  }, [setTone, tone.hex, tone.stage, tone.topStep])

  if (!host) return <TopBarShell tone={tone} home={false} left={left} center={center} right={right} />

  const fill = (node: ReactNode, target: HTMLElement | null, className: string) =>
    target && node ? createPortal(<div className={cn(className, enterClassName)}>{node}</div>, target) : null

  return (
    <>
      {fill(left, host.slots.left, leftClassName)}
      {fill(center, host.slots.center, centerClassName)}
      {fill(right, host.slots.right, rightClassName)}
    </>
  )
}

function bookSection(pathname: string): string | undefined {
  const parts = pathname.split("/").filter(Boolean)
  const index = parts.indexOf("pipeline")
  return index >= 0 ? parts[index + 2] : undefined
}

function PersistentDock({ label, section }: { label: string; section: string | undefined }) {
  const state = usePipelineState(label)
  const nav = usePipelineNavigation(label)
  const [minimized, setMinimized] = useDockMinimized()
  const onStoryboard = !section || section === "pages"
  const empty = !state.hasSections || !state.hasRendering

  return (
    <>
      <PluginDock
        bookLabel={label}
        foundations={state.foundations}
        plugins={state.plugins}
        activeSlug={section && isDockSlug(section) ? section : null}
        onOpenPlugin={nav.openStep}
        onStoryboard={onStoryboard}
        hint={onStoryboard && empty ? <Trans>Plugins unlock once the sections exist</Trans> : undefined}
        minimized={minimized}
        onMinimize={() => setMinimized(true)}
      />
      <DockHandle visible={minimized} onShow={() => setMinimized(false)} />
    </>
  )
}

export function PipelineChrome({ label, children }: { label: string; children: ReactNode }) {
  const [left, setLeft] = useState<HTMLElement | null>(null)
  const [center, setCenter] = useState<HTMLElement | null>(null)
  const [right, setRight] = useState<HTMLElement | null>(null)
  const [tone, setTone] = useState<TopBarTone>(DEFAULT_TONE)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const section = bookSection(pathname)
  const chrome = useChromeRoot(tone.hex)
  const host = useMemo<ChromeHost>(() => ({ slots: { left, center, right }, setTone }), [left, center, right])
  const workspace = useVariant("tbstyle") === "workspace"
  const slotRefs = { left: setLeft, center: setCenter, right: setRight }

  if (section === "settings" && !workspace) return <>{children}</>

  return (
    <ChromeContext.Provider value={host}>
      <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
        <div {...chrome} data-top-step={tone.topStep ?? chrome["data-top-step"]} className="shrink-0">
          {workspace ? (
            <WorkspaceTopBar label={label} section={section} stage={tone.stage} slotRefs={slotRefs} />
          ) : (
            <TopBarShell tone={tone} slotRefs={slotRefs} />
          )}
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
        {section !== "settings" && <PersistentDock label={label} section={section} />}
      </div>
    </ChromeContext.Provider>
  )
}
