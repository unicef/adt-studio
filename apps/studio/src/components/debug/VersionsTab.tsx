import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { useVersionHistory } from "@/hooks/use-debug"

const NODE_TYPES = [
  "text-classification",
  "image-filtering",
  "page-sectioning",
  "web-rendering",
  "metadata",
] as const

interface VersionsTabProps {
  label: string
}

function VersionRow({ version, data }: { version: number; data?: unknown }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border/50">
      <Button
        variant="ghost"
        className="flex items-center gap-3 px-4 py-2.5 text-xs w-full hover:bg-muted/30 justify-start rounded-none h-auto"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="font-medium">Version {version}</span>
      </Button>
      {expanded && data != null && (
        <div className="px-4 py-3 bg-muted/20">
          <pre className="text-[11px] whitespace-pre-wrap max-h-72 overflow-auto rounded-lg border bg-card p-4">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
      {expanded && data == null && (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          No data available for this version.
        </div>
      )}
    </div>
  )
}

export function VersionsTab({ label }: VersionsTabProps) {
  const [node, setNode] = useState("")
  const [itemId, setItemId] = useState("")

  const { data, isLoading, error } = useVersionHistory(
    label,
    node,
    itemId,
    true
  )

  return (
    <div className="flex flex-col h-full">
      {/* Selector bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
        <Select value={node} onValueChange={setNode}>
          <SelectTrigger className="h-7 w-48 text-xs">
            <SelectValue placeholder="Select node type" />
          </SelectTrigger>
          <SelectContent>
            {NODE_TYPES.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Item ID (e.g. book_p1)"
          className="h-7 w-56 text-xs"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
        />
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-auto min-h-0">
        {!node || !itemId ? (
          <div className="p-6 text-xs text-muted-foreground">
            Select a node type and enter an item ID to view version history.
          </div>
        ) : isLoading ? (
          <div className="p-6 text-xs text-muted-foreground">Loading versions...</div>
        ) : error ? (
          <div className="p-6 text-xs text-destructive">
            Failed to load versions: {error.message}
          </div>
        ) : data && data.versions.length === 0 ? (
          <div className="p-6 text-xs text-muted-foreground">
            No versions found for {node} / {itemId}.
          </div>
        ) : (
          data?.versions.map((v) => (
            <VersionRow key={v.version} version={v.version} data={v.data} />
          ))
        )}
      </div>
    </div>
  )
}
