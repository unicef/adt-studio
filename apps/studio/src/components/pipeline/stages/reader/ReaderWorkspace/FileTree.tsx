import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronRight, Folder, FolderOpen, TriangleAlert } from "lucide-react"
import type { ReaderSourceTreeEntry } from "@adt/types"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { FileIcon } from "./FileIcon"

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

const INDENT = 12
const ROW = "flex h-[22px] w-full items-center gap-1 pr-2 text-left text-[13px] text-foreground/90 outline-none hover:bg-muted focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-inset"

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

  const indent = (depth: number) => ({ paddingLeft: `${depth * INDENT + 8}px` })

  const render = (node: TreeNode, depth: number) => {
    if (!node.entry) {
      const isOpen = expanded(node.path)
      const FolderIcon = isOpen ? FolderOpen : Folder
      return (
        <li key={node.path}>
          <button type="button" className={ROW} style={indent(depth)} aria-expanded={isOpen} onClick={() => toggle(node.path)}>
            <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.name}</span>
          </button>
          {isOpen && (
            <ul className="relative">
              <span aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-border" style={{ left: `${depth * INDENT + 16}px` }} />
              {node.children.map((child) => render(child, depth + 1))}
            </ul>
          )}
        </li>
      )
    }
    const { entry } = node
    const isSelected = selected === node.path
    return (
      <li key={node.path}>
        <button
          type="button"
          aria-current={isSelected ? "true" : undefined}
          className={cn(ROW, isSelected && "bg-primary/10 text-foreground ring-1 ring-primary/30 ring-inset")}
          style={indent(depth)}
          title={`${node.path} · ${layerLabel[entry.layer]}`}
          onClick={() => onSelect(node.path)}
        >
          <span className="size-4 shrink-0" />
          <FileIcon path={node.path} />
          <span className={cn("truncate", node.path in dirty && "italic")}>{node.name}</span>
          {entry.outdated && <TriangleAlert className="size-3.5 shrink-0 text-amber-600" aria-label={t`The default version changed since this was customized`} />}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
            {node.path in dirty && <span className="size-2 rounded-full bg-foreground/60" aria-label={t`Unsaved changes`} />}
            {entry.layer !== "base" && <span className={cn("size-2 rounded-full", LAYER_DOT[entry.layer])} aria-label={layerLabel[entry.layer]} />}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        <Trans>Explorer</Trans>
      </div>
      <div className="shrink-0 px-2 pb-2">
        <Input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t`Filter files...`} className="h-7 text-xs" />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto pb-2" aria-label={t`Reader source files`}>
        {nodes.map((node) => render(node, 0))}
      </ul>
    </div>
  )
}
