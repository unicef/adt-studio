import { useState, useCallback, useRef, useEffect } from "react"
import { X, GripHorizontal, ExternalLink } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { StatsTab } from "./StatsTab"
import { LlmLogsTab } from "./LlmLogsTab"
import { ConfigTab } from "./ConfigTab"
import { VersionsTab } from "./VersionsTab"

const MIN_HEIGHT = 200
const MAX_HEIGHT_VH = 0.8
const DEFAULT_HEIGHT_VH = 0.4

interface DebugPanelProps {
  label: string
  isRunning: boolean
  onClose: () => void
}

export function DebugPanel({ label, isRunning, onClose }: DebugPanelProps) {
  const [height, setHeight] = useState(
    () => Math.floor(window.innerHeight * DEFAULT_HEIGHT_VH)
  )
  const dragging = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    const startY = e.clientY
    const startHeight = panelRef.current?.offsetHeight ?? height

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = startY - ev.clientY
      const maxH = Math.floor(window.innerHeight * MAX_HEIGHT_VH)
      const newHeight = Math.min(maxH, Math.max(MIN_HEIGHT, startHeight + delta))
      setHeight(newHeight)
    }

    const onUp = () => {
      dragging.current = false
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }, [height])

  useEffect(() => {
    return () => {
      dragging.current = false
    }
  }, [])

  return (
    <div
      ref={panelRef}
      className="border-t border-border bg-background flex flex-col"
      style={{ height }}
    >
      <div
        className="flex items-center justify-center h-2 cursor-row-resize hover:bg-muted/50 shrink-0"
        onMouseDown={onDragStart}
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground" />
      </div>

      <Tabs defaultValue="stats" className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-2 px-3 py-1 border-b border-border shrink-0">
          <TabsList className="h-8">
            <TabsTrigger value="stats" className="text-xs px-2 py-1">
              Stats
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs px-2 py-1">
              Logs
              {isRunning && (
                <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="config" className="text-xs px-2 py-1">
              Config
            </TabsTrigger>
            <TabsTrigger value="versions" className="text-xs px-2 py-1">
              Versions
            </TabsTrigger>
          </TabsList>

          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">Debug Panel</span>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Pop out to new window"
            onClick={() => {
              window.open(
                `/books/${label}/debug`,
                `debug-${label}`,
                "width=900,height=700",
              )
              onClose()
            }}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <TabsContent value="stats" className="m-0 h-full">
            <StatsTab label={label} isRunning={isRunning} />
          </TabsContent>
          <TabsContent value="logs" className="m-0 h-full">
            <LlmLogsTab label={label} isRunning={isRunning} />
          </TabsContent>
          <TabsContent value="config" className="m-0 h-full">
            <ConfigTab label={label} />
          </TabsContent>
          <TabsContent value="versions" className="m-0 h-full">
            <VersionsTab label={label} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
