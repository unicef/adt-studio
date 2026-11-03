import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useRouterState } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { TitleBarControls } from "@/components/title-bar/title-bar-controls"
import { NO_DRAG_REGION } from "@/constants"
import { useChromeRoot } from "@/components/app/lab/chrome"
import { cn } from "@/lib/utils"
import { PluginDockPills as PluginDock } from "@/components/app/screens/pipeline/plugins/PluginDockPills"
import { STORYBOARD_HEX, isDockSlug } from "@/components/app/screens/pipeline/shared/plugins"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import { usePipelineState } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { useDockMinimized } from "@/components/app/screens/pipeline/shared/workspacePrefs"
import { DockHandle } from "./DockHandle"
import { WorkspaceTopBar } from "./WorkspaceTopBar"
import { BarLocation, type BarLocationData } from "./bar/BarLocation"
import { ExportWatcherProvider, useExportWatcherSetup } from "@/hooks/use-export-watcher"
import { PreviewHost } from "@/components/app/screens/pipeline/preview/surfaces/PreviewHost"

export interface TopBarTone {
  hex: string
  stage?: boolean
}

interface Slots {
  left: HTMLElement | null
  center: HTMLElement | null
  right: HTMLElement | null
}

export interface BarSettings {
  label: string
  onOpen: () => void
}

interface ChromeHost {
  slots: Slots
  setTone: (tone: TopBarTone) => void
  settings: BarSettings | null
  setSettings: (settings: BarSettings | null) => void
}

const ChromeContext = createContext<ChromeHost | null>(null)

const DEFAULT_TONE: TopBarTone = { hex: STORYBOARD_HEX }

const leftClassName = "flex min-w-0 items-center gap-2"
const centerClassName = "flex min-w-0 flex-1 items-center justify-center gap-1.5"
const rightClassName = "flex items-center gap-1.5"
const enterClassName = "animate-in fade-in duration-200 ease-out motion-reduce:animate-none"

interface TopBarShellProps {
  tone: TopBarTone
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}

function TopBarShell({ tone, left, center, right }: TopBarShellProps) {
  return (
    <header
      data-chrome="topbar"
      data-stage={tone.stage ? "" : undefined}
      className="drag-region relative flex h-13 shrink-0 items-center gap-3.5 border-b border-b-transparent! bg-card px-3.5"
    >
      <div className={leftClassName}>
        {left}
      </div>
      <div className={centerClassName}>
        {center}
      </div>
      <div style={NO_DRAG_REGION} className={rightClassName}>
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
  location?: BarLocationData
  settings?: BarSettings
}

export function useBarSettings(): BarSettings | null {
  return useContext(ChromeContext)?.settings ?? null
}

export function TopBar({ tone, left, center, right, location, settings }: TopBarProps) {
  const host = useContext(ChromeContext)
  const setTone = host?.setTone
  const setSettings = host?.setSettings
  const openRef = useRef(settings?.onOpen)
  openRef.current = settings?.onOpen
  const settingsLabel = settings?.label

  useLayoutEffect(() => {
    setTone?.({ hex: tone.hex, stage: tone.stage })
  }, [setTone, tone.hex, tone.stage])

  useLayoutEffect(() => {
    if (!setSettings) return
    setSettings(settingsLabel ? { label: settingsLabel, onOpen: () => openRef.current?.() } : null)
    return () => setSettings(null)
  }, [setSettings, settingsLabel])


  const locationNode = location ? <BarLocation data={location} /> : left

  if (!host) return <TopBarShell tone={tone} left={locationNode} center={center} right={right} />

  const fill = (node: ReactNode, target: HTMLElement | null, className: string) =>
    target && node ? createPortal(<div className={cn(className, enterClassName)}>{node}</div>, target) : null

  return (
    <>
      {fill(locationNode, host.slots.left, leftClassName)}
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
  const { t } = useLingui()
  const state = usePipelineState(label)
  const nav = usePipelineNavigation(label)
  const [minimized, setMinimized] = useDockMinimized()
  const onStoryboard = !section || section === "pages"
  const empty = !state.hasSections || !state.hasRendering

  return (
    <nav aria-label={t`Step dock`} className="contents">
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
    </nav>
  )
}

export function PipelineChrome({ label, children }: { label: string; children: ReactNode }) {
  const [left, setLeft] = useState<HTMLElement | null>(null)
  const [center, setCenter] = useState<HTMLElement | null>(null)
  const [right, setRight] = useState<HTMLElement | null>(null)
  const [tone, setTone] = useState<TopBarTone>(DEFAULT_TONE)
  const [settings, setSettings] = useState<BarSettings | null>(null)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const section = bookSection(pathname)
  const chrome = useChromeRoot(tone.hex)
  const exportWatcher = useExportWatcherSetup(label)
  const host = useMemo<ChromeHost>(
    () => ({ slots: { left, center, right }, setTone, settings, setSettings }),
    [left, center, right, settings],
  )
  const slotRefs = { left: setLeft, center: setCenter, right: setRight }

  return (
    <ChromeContext.Provider value={host}>
    <ExportWatcherProvider value={exportWatcher}>
      <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
        <div {...chrome} className="shrink-0">
          <WorkspaceTopBar label={label} section={section} stage={tone.stage} slotRefs={slotRefs} />
        </div>
        {section === "settings" || section === "info" ? (
          <main id="pipeline-canvas" tabIndex={-1} className="relative min-h-0 flex-1 outline-none">
            {children}
          </main>
        ) : (
          <div className="relative min-h-0 flex-1">{children}</div>
        )}
        {section !== "settings" && <PersistentDock label={label} section={section} />}
        <PreviewHost label={label} />
      </div>
    </ExportWatcherProvider>
    </ChromeContext.Provider>
  )
}
