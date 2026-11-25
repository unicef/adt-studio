import { useMemo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronDown, ChevronRight, FileCode2, TriangleAlert } from "lucide-react"
import type { ReaderSourceTreeEntry } from "@adt/types"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface TreeNode {
  name: string
  path: string
  entry?: ReaderSourceTreeEntry
  children: TreeNode[]
}

export function buildFileTree(entries: ReaderSourceTreeEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] }
  for (const entry of entries) {
    let node = root
    const parts = entry.path.split("/")
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/")
      const isFile = index === parts.length - 1
      let child = node.children.find((candidate) => candidate.name === part && Boolean(candidate.entry) === isFile)
      if (!child) {
        child = { name: part, path, children: [], entry: isFile ? entry : undefined }
        node.children.push(child)
      }
      node = child
    })
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => Number(Boolean(a.entry)) - Number(Boolean(b.entry)) || a.name.localeCompare(b.name))
      .map((node) => ({ ...node, children: sort(node.children) }))
  return sort(root.children)
}

const LAYER_DOT = { base: "", global: "bg-sky-500", book: "bg-purple-600" } as const

interface FileTreeProps {
  entries: ReaderSourceTreeEntry[]
  selected: string | null
  dirty: Record<string, string>
  onSelect: (path: string) => void
}

export function FileTree({ entries, selected, dirty, onSelect }: FileTreeProps) {
  const { t } = useLingui()
  const [filter, setFilter] = useState("")
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return needle ? entries.filter((entry) => entry.path.toLowerCase().includes(needle)) : entries
  }, [entries, filter])
  const nodes = useMemo(() => buildFileTree(visible), [visible])
  const expanded = (path: string) => filter.trim() !== "" || open.has(path) || (selected?.startsWith(`${path}/`) ?? false)
  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const layerLabel = { base: t`Default`, global: t`Global customization`, book: t`Customized in this book` }

  const render = (node: TreeNode, depth: number) => {
    const indent = { paddingLeft: `${depth * 12 + 8}px` }
    if (!node.entry) {
      const isOpen = expanded(node.path)
      return (
        <li key={node.path}>
          <button type="button" className="flex w-full items-center gap-1 py-0.5 pr-2 text-left text-xs hover:bg-muted" style={indent} aria-expanded={isOpen} onClick={() => toggle(node.path)}>
            {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
            <span className="truncate font-medium">{node.name}</span>
          </button>
          {isOpen && <ul>{node.children.map((child) => render(child, depth + 1))}</ul>}
        </li>
      )
    }
    const { entry } = node
    return (
      <li key={node.path}>
        <button
          type="button"
          aria-current={selected === node.path ? "true" : undefined}
          className={cn("flex w-full items-center gap-1.5 py-0.5 pr-2 text-left text-xs hover:bg-muted", selected === node.path && "bg-primary/10 font-medium")}
          style={indent}
          title={`${node.path} · ${layerLabel[entry.layer]}`}
          onClick={() => onSelect(node.path)}
        >
          <FileCode2 className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
          {node.path in dirty && <span className="text-amber-600" aria-label={t`Unsaved changes`}>●</span>}
          {entry.outdated && <TriangleAlert className="h-3 w-3 shrink-0 text-amber-600" aria-label={t`The default version changed since this was customized`} />}
          {entry.layer !== "base" && <span className={cn("ml-auto h-2 w-2 shrink-0 rounded-full", LAYER_DOT[entry.layer])} aria-label={layerLabel[entry.layer]} />}
        </button>
      </li>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b p-2">
        <Input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t`Filter files...`} className="h-8 text-xs" />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1" aria-label={t`Reader source files`}>
        {nodes.map((node) => render(node, 0))}
      </ul>
    </div>
  )
}
