import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { MoreHorizontal, SlidersHorizontal } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useOpenHumanPanel } from "@/components/app/screens/pipeline/shared/rightPanelTab"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { cn } from "@/lib/utils"
import { useCanvasEditing } from "../CanvasEditing"
import { useStoryboardTools } from "../../tools/StoryboardToolsContext"
import { useSelectedElementStyle, type ElementKind } from "../useSelectedElementStyle"
import { useContainerTools, useImageTools } from "./BlockTools"
import { applyEdits } from "./classEdits"
import { fitToolbar } from "./fit"
import { fontItem } from "./FontPicker"
import {
  FIT_METRICS,
  ICON_WIDTH,
  ToolButton,
  ToolSeparator,
  ToolTip,
  ToolbarSideProvider,
  popoverClass,
  shellClass,
  useToolbarSide,
  type StyleTarget,
  type ToolbarItem,
} from "./parts"
import { floatPosition } from "./placement"
import { useTextTools } from "./TextTools"
import { useFloatAnchor } from "./useFloatAnchor"
import { useHumanPanelVisible } from "./useHumanPanelVisible"
import { useRovingFocus } from "./useRovingFocus"

const TOP_OFFSET = 16
const FLOAT_OPTIONS = { gap: 10, inset: 8, topInset: 56, bottomInset: 120 }
const EXIT_MS = 160

interface BarProps {
  target: StyleTarget
  available: number
  advanced: boolean
  onAdvanced: () => void
  onEscape: () => void
}

function focusCanvas() {
  document.getElementById("pipeline-canvas")?.focus({ preventScroll: true })
}

function focusPanel(event: Event) {
  event.preventDefault()
  const panel = event.currentTarget as HTMLElement | null
  panel?.focus()
}

function FoldedRows({ folded }: { folded: ToolbarItem[] }) {
  return (
    <div className="flex flex-col">
      {folded.map((item) => (
        <div key={item.key} className="flex min-h-9 items-center justify-between gap-4 rounded-md px-2">
          <span className="text-[12.5px] text-muted-foreground">{item.label}</span>
          <div className="flex items-center gap-0.5">{item.node}</div>
        </div>
      ))}
    </div>
  )
}

function MoreTool({ folded, onAdvanced, onWidth }: { folded: ToolbarItem[]; onAdvanced: () => void; onWidth: (width: number) => void }) {
  const { t } = useLingui()
  const side = useToolbarSide()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  useLayoutEffect(() => {
    const width = ref.current?.offsetWidth
    if (width) onWidth(width)
  })

  const face = (
    <>
      <SlidersHorizontal aria-hidden className="size-3.5" />
      <span>{t`More`}</span>
    </>
  )
  const faceClass = "flex gap-1.5 px-2 text-[12px] font-medium"

  if (folded.length === 0) {
    return (
      <ToolTip label={t`All style options`}>
        <ToolButton ref={ref} label={t`All style options`} onClick={onAdvanced} className={faceClass}>
          {face}
        </ToolButton>
      </ToolTip>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ToolTip label={t`More style options`}>
        <PopoverTrigger asChild>
          <ToolButton ref={ref} label={t`More style options`} aria-haspopup="dialog" className={faceClass}>
            {face}
          </ToolButton>
        </PopoverTrigger>
      </ToolTip>
      <PopoverContent side={side} align="end" sideOffset={8} collisionPadding={12} onOpenAutoFocus={focusPanel} aria-label={t`More style options`} className={cn(popoverClass, "w-60 p-1.5")}>
        <FoldedRows folded={folded} />
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            onAdvanced()
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] font-medium outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted"
        >
          <SlidersHorizontal aria-hidden className="size-3.5 text-muted-foreground" />
          {t`All style options`}
        </button>
      </PopoverContent>
    </Popover>
  )
}

function OverflowTool({ folded }: { folded: ToolbarItem[] }) {
  const { t } = useLingui()
  const side = useToolbarSide()
  return (
    <Popover>
      <ToolTip label={t`More controls`}>
        <PopoverTrigger asChild>
          <ToolButton label={t`More controls`} aria-haspopup="dialog">
            <MoreHorizontal aria-hidden className="size-4" />
          </ToolButton>
        </PopoverTrigger>
      </ToolTip>
      <PopoverContent side={side} align="end" sideOffset={8} collisionPadding={12} onOpenAutoFocus={focusPanel} aria-label={t`More controls`} className={cn(popoverClass, "w-60 p-1.5")}>
        <FoldedRows folded={folded} />
      </PopoverContent>
    </Popover>
  )
}

function Slot({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div
      data-slot-hidden={show ? undefined : ""}
      aria-hidden={!show || undefined}
      inert={!show}
      className={cn(
        "grid transition-[grid-template-columns,opacity,margin] duration-200 ease-out motion-reduce:transition-none",
        show ? "grid-cols-[1fr] opacity-100" : "-ml-0.5 grid-cols-[0fr] opacity-0",
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-0.5", !show && "overflow-hidden")}>{children}</div>
    </div>
  )
}

function ToolbarFrame({
  items,
  label,
  available,
  advanced,
  onAdvanced,
  onEscape,
}: Omit<BarProps, "target"> & { items: ToolbarItem[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [moreWidth, setMoreWidth] = useState(68)
  const metrics = { ...FIT_METRICS, more: advanced ? moreWidth : 0 }
  let fitted = fitToolbar(items, available, metrics)
  if (!advanced && fitted.folded.length > 0) fitted = fitToolbar(items, available, { ...FIT_METRICS, more: ICON_WIDTH })
  const { visible, folded } = fitted
  const overflow = !advanced && folded.length > 0
  const roving = useRovingFocus(ref)

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      className={shellClass}
      onFocus={roving.onFocus}
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current?.contains(event.target as Node)) {
          event.preventDefault()
          onEscape()
          return
        }
        roving.onKeyDown(event)
      }}
    >
      {visible.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && visible[index - 1].group !== item.group ? <ToolSeparator /> : null}
          {item.node}
        </Fragment>
      ))}
      <Slot show={advanced}>
        {visible.length > 0 ? <ToolSeparator /> : null}
        <MoreTool folded={advanced ? folded : []} onAdvanced={onAdvanced} onWidth={setMoreWidth} />
      </Slot>
      <Slot show={overflow}>
        {visible.length > 0 ? <ToolSeparator /> : null}
        <OverflowTool folded={overflow ? folded : []} />
      </Slot>
    </div>
  )
}

function TextBar({ target, ...rest }: BarProps) {
  const { t } = useLingui()
  const items = useTextTools(target)
  return <ToolbarFrame {...rest} label={t`Text style`} items={[fontItem(t`Font`, target), ...items]} />
}

function ImageBar({ target, ...rest }: BarProps) {
  const { t } = useLingui()
  return <ToolbarFrame {...rest} label={t`Image style`} items={useImageTools(target)} />
}

function ContainerBar({ target, ...rest }: BarProps) {
  const { t } = useLingui()
  return <ToolbarFrame {...rest} label={t`Container style`} items={useContainerTools(target)} />
}

const BARS: Record<ElementKind, (props: BarProps) => ReactNode> = {
  text: TextBar,
  image: ImageBar,
  container: ContainerBar,
}

function usePresence(show: boolean) {
  const [mounted, setMounted] = useState(show)
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (show) {
      setMounted(true)
      let inner = 0
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setEntered(true))
      })
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
      }
    }
    setEntered(false)
    const timer = setTimeout(() => setMounted(false), EXIT_MS)
    return () => clearTimeout(timer)
  }, [show])
  return { mounted: mounted || show, entered: entered && show }
}

export function StyleToolbar({ viewport }: { viewport: Viewport }) {
  const editing = useCanvasEditing()
  const tools = useStoryboardTools()
  const style = useSelectedElementStyle()
  const openHuman = useOpenHumanPanel()
  const humanVisible = useHumanPanelVisible()
  const rootRef = useRef<HTMLDivElement>(null)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 32 })

  const { selection, kind, classes } = style
  const show = editing.enabled && !!selection && !!kind && classes !== null
  const presence = usePresence(show)
  const revision = `${classes?.join(" ") ?? ""}|${style.typography?.inlineFontFamily ?? ""}`
  const anchor = useFloatAnchor(container, selection, presence.mounted, revision)

  const deselectRef = useRef(style.deselect)
  deselectRef.current = style.deselect

  useLayoutEffect(() => {
    const root = rootRef.current
    setContainer((root?.offsetParent as HTMLElement | null) ?? root?.parentElement ?? null)
  }, [])

  useLayoutEffect(() => {
    const node = rootRef.current?.firstElementChild
    if (!node) return
    const observer = new ResizeObserver(() => {
      const next = { width: Math.round((node as HTMLElement).offsetWidth), height: Math.round((node as HTMLElement).offsetHeight) }
      setSize((previous) => (previous.width === next.width && previous.height === next.height ? previous : next))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [presence.mounted, kind])

  useEffect(() => {
    if (!show || !selection) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      const active = document.activeElement
      if (active && active !== document.body && active.tagName !== "IFRAME" && !active.closest("#pipeline-canvas")) return
      deselectRef.current()
    }
    const frameDocument = container?.querySelector<HTMLIFrameElement>(`[data-canvas-section="${selection.sectionIndex}"] iframe`)?.contentDocument
    const onFrameKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      if ((event.target as HTMLElement | null)?.isContentEditable) return
      deselectRef.current()
    }
    document.addEventListener("keydown", onKey)
    frameDocument?.addEventListener("keydown", onFrameKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      frameDocument?.removeEventListener("keydown", onFrameKey)
    }
  }, [show, selection, container])

  const target: StyleTarget | null =
    show && selection && classes
      ? {
          dataId: selection.dataId,
          classes,
          typography: style.typography,
          device: viewport,
          label: tools?.label ?? "",
          pageId: editing.pageId,
          apply: (edits) => style.changeClasses(selection.dataId, applyEdits(classes, viewport, edits)),
          setStyle: (property, value) => style.changeStyle(selection.dataId, property, value),
          remove: () => {
            style.remove(selection.dataId)
            focusCanvas()
          },
        }
      : null
  const last = useRef<{ target: StyleTarget; kind: ElementKind } | null>(null)
  if (target && kind) last.current = { target, kind }
  const shown = target && kind ? { target, kind } : last.current

  let position: { x: number; y: number; side: "above" | "below" } | null = null
  let available = 0
  if (anchor) {
    available = Math.max(0, anchor.bounds.width - FLOAT_OPTIONS.inset * 2)
    const placed = floatPosition(anchor.rect, size, anchor.bounds, FLOAT_OPTIONS)
    position = placed.visible ? placed : null
  }

  const entered = presence.entered && !!position && size.width > 0
  const Bar = shown ? BARS[shown.kind] : null
  const rootStyle: CSSProperties = position ? { left: position.x, top: position.y } : { left: 0, top: TOP_OFFSET }

  return (
    <div
      ref={rootRef}
      data-style-toolbar=""
      inert={!entered}
      aria-hidden={!entered || undefined}
      style={rootStyle}
      className={cn(
        "absolute z-20 ease-out motion-reduce:transition-none",
        "transition-[opacity,translate,scale] duration-150 [&>[role=toolbar]]:bg-card/95 [&>[role=toolbar]]:shadow-[0_12px_32px_-14px_rgba(0,0,0,0.4)]",
        entered ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none scale-[0.97] opacity-0",
        !entered && (position?.side === "above" ? "translate-y-1" : "-translate-y-1"),
      )}
    >
      {presence.mounted && shown && Bar ? (
        <ToolbarSideProvider value={position?.side === "above" ? "top" : "bottom"}>
          <Bar
            target={shown.target}
            available={available}
            advanced={!humanVisible}
            onAdvanced={openHuman}
            onEscape={() => {
              style.deselect()
              focusCanvas()
            }}
          />
        </ToolbarSideProvider>
      ) : null}
    </div>
  )
}

