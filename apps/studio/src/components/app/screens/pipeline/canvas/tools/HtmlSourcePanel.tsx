import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Code, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCanvasEditing } from "../editing/CanvasEditing"
import { HtmlSourceEditor } from "./HtmlSourceEditor"
import { useStoryboardTools } from "./StoryboardToolsContext"

const DOCK_CLEARANCE = 96
const MIN_HEIGHT = 150
const KEY_STEP = 24

function maxHeight(): number {
  return Math.floor(window.innerHeight * 0.6)
}

function clampHeight(height: number): number {
  return Math.min(maxHeight(), Math.max(MIN_HEIGHT, Math.round(height)))
}

export function HtmlSourcePanel() {
  const { t } = useLingui()
  const tools = useStoryboardTools()
  const editing = useCanvasEditing()
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startY: number; startHeight: number } | null>(null)
  const visible = !!tools?.htmlVisible
  const sectionIndex = tools?.current?.sectionIndex ?? null
  const height = tools?.htmlHeight ?? MIN_HEIGHT
  const setHeight = tools?.setHtmlHeight
  const edited = sectionIndex !== null && editing.sourceOverride(sectionIndex) !== undefined

  useEffect(() => {
    if (!setHeight) return
    const onResize = () => setHeight(clampHeight(height))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [height, setHeight])

  if (!tools) return null

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "w-full shrink-0 overflow-hidden",
        !dragging && "transition-[height] duration-300 ease-out motion-reduce:transition-none",
      )}
      style={{ height: visible ? height + DOCK_CLEARANCE : 0 }}
    >
      <section
        aria-label={t`HTML source`}
        className={cn(
          "mx-4 flex flex-col overflow-hidden rounded-t-xl border border-b-0 bg-card text-card-foreground transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
          visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
        style={{ height: height + DOCK_CLEARANCE }}
      >
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t`Resize the HTML panel`}
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={typeof window === "undefined" ? undefined : maxHeight()}
          aria-valuenow={height}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { startY: event.clientY, startHeight: height }
            setDragging(true)
          }}
          onPointerMove={(event) => {
            if (!drag.current) return
            tools.setHtmlHeight(clampHeight(drag.current.startHeight + drag.current.startY - event.clientY))
          }}
          onPointerUp={() => {
            drag.current = null
            setDragging(false)
          }}
          onPointerCancel={() => {
            drag.current = null
            setDragging(false)
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") tools.setHtmlHeight(clampHeight(height + KEY_STEP))
            else if (event.key === "ArrowDown") tools.setHtmlHeight(clampHeight(height - KEY_STEP))
            else return
            event.preventDefault()
          }}
          className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center outline-none focus-visible:bg-muted"
        >
          <span className="h-1 w-9 rounded-full bg-border transition-colors duration-150 group-hover:bg-muted-foreground/50 group-focus-visible:bg-ring" />
        </div>
        <header className="flex shrink-0 items-center gap-2 border-b px-4 pb-2 text-[12px] text-muted-foreground">
          <Code className="size-3.5 text-foreground/70" />
          <span className="font-medium text-foreground">
            <Trans>HTML source</Trans>
          </span>
          {sectionIndex !== null && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              {t`Section ${sectionIndex + 1}`}
            </span>
          )}
          <span
            className={cn(
              "flex items-center gap-1 text-[11px] text-amber-700 transition-opacity duration-200 dark:text-amber-300",
              edited ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="size-1.5 rounded-full bg-amber-500" />
            <Trans>Edited, previewing live</Trans>
          </span>
          <span className="ml-auto hidden text-[11px] md:inline">
            <Trans>Save from the bar above to keep it as a new version</Trans>
          </span>
          <button
            type="button"
            onClick={() => tools.setHtmlOpen(false)}
            aria-label={t`Close the HTML source`}
            className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:ml-0"
          >
            <X className="size-3.5" />
          </button>
        </header>
        {sectionIndex !== null && <HtmlSourceEditor key={sectionIndex} sectionIndex={sectionIndex} />}
      </section>
    </div>
  )
}
