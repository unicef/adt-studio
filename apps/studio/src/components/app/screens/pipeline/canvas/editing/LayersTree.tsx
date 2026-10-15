import { useEffect, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import {
  Box,
  ChevronRight,
  Heading,
  Image as ImageIcon,
  Link2,
  List,
  MousePointerClick,
  Pilcrow,
  Quote,
  Square,
  type LucideIcon,
} from "lucide-react"
import type { PageSummarySection } from "@/api/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { usePage } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { useCanvasEditing } from "./CanvasEditing"

interface LayerNode {
  key: string
  dataId: string | null
  tag: string
  preview: string
  children: LayerNode[]
}

const GROUP_TAGS = new Set(["div", "section", "article", "header", "footer", "figure", "ul", "ol", "main", "aside", "nav"])

function describe(tag: string): { icon: LucideIcon; label: MessageDescriptor } {
  if (/^h[1-6]$/.test(tag)) return { icon: Heading, label: msg`Heading` }
  if (tag === "p") return { icon: Pilcrow, label: msg`Text` }
  if (tag === "img" || tag === "picture" || tag === "svg") return { icon: ImageIcon, label: msg`Image` }
  if (tag === "ul" || tag === "ol") return { icon: List, label: msg`List` }
  if (tag === "li") return { icon: List, label: msg`List item` }
  if (tag === "a") return { icon: Link2, label: msg`Link` }
  if (tag === "button" || tag === "input" || tag === "label") return { icon: MousePointerClick, label: msg`Control` }
  if (tag === "blockquote" || tag === "figcaption") return { icon: Quote, label: msg`Caption` }
  if (GROUP_TAGS.has(tag)) return { icon: Box, label: msg`Group` }
  return { icon: Square, label: msg`Element` }
}

function buildTree(html: string, sectionIndex: number): LayerNode[] {
  const doc = new DOMParser().parseFromString(html, "text/html")
  let counter = 0
  const walk = (element: Element): LayerNode[] => {
    const nested = Array.from(element.children).flatMap(walk)
    const tag = element.tagName.toLowerCase()
    const dataId = element.getAttribute("data-id")
    if (dataId) {
      const text = tag === "img" ? element.getAttribute("alt") ?? "" : element.textContent ?? ""
      const leafText = GROUP_TAGS.has(tag) && nested.length === 0 && text.trim().length > 0
      return [{ key: dataId, dataId, tag: leafText ? "p" : tag, preview: text.replace(/\s+/g, " ").trim().slice(0, 48), children: nested }]
    }
    if (GROUP_TAGS.has(tag) && nested.length > 1) {
      counter += 1
      return [{ key: `group-${sectionIndex}-${counter}`, dataId: null, tag, preview: "", children: nested }]
    }
    return nested
  }
  return walk(doc.body)
}

function containsId(node: LayerNode, dataId: string): boolean {
  return node.dataId === dataId || node.children.some((child) => containsId(child, dataId))
}

function LayerRow({
  node,
  depth,
  sectionIndex,
}: {
  node: LayerNode
  depth: number
  sectionIndex: number
}) {
  const { i18n } = useLingui()
  const { selection, select } = useCanvasEditing()
  const isSelected = !!node.dataId && selection?.sectionIndex === sectionIndex && selection.dataId === node.dataId
  const holdsSelection = !!selection && selection.sectionIndex === sectionIndex && containsId(node, selection.dataId)
  const [open, setOpen] = useState(depth < 3)
  const rowRef = useRef<HTMLButtonElement>(null)
  const { icon: Icon, label } = describe(node.tag)

  useEffect(() => {
    if (holdsSelection && !isSelected) setOpen(true)
  }, [holdsSelection, isSelected])

  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [isSelected])

  const hasChildren = node.children.length > 0
  const heading = /^h[1-6]$/.test(node.tag) ? node.tag.toUpperCase() : null

  return (
    <li>
      <button
        ref={rowRef}
        type="button"
        onClick={() => {
          if (node.dataId) select({ sectionIndex, dataId: node.dataId, tagName: node.tag })
          else setOpen((value) => !value)
        }}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12px] transition-colors duration-150",
          isSelected ? "bg-brand-600 text-white" : "hover:bg-muted",
          !node.dataId && !isSelected && "text-muted-foreground",
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <span
          role={hasChildren ? "presentation" : undefined}
          onClick={(event) => {
            if (!hasChildren) return
            event.stopPropagation()
            setOpen((value) => !value)
          }}
          className={cn("grid size-3.5 shrink-0 place-items-center", !hasChildren && "invisible")}
        >
          <ChevronRight className={cn("size-3 transition-transform duration-200", open && "rotate-90")} />
        </span>
        <Icon className={cn("size-3.5 shrink-0", isSelected ? "text-white" : "text-muted-foreground")} />
        <span className="shrink-0 font-medium">{i18n._(label)}</span>
        {heading && (
          <span className={cn("rounded px-1 font-mono text-[9.5px]", isSelected ? "bg-white/20" : "bg-muted text-muted-foreground")}>
            {heading}
          </span>
        )}
        {node.preview && (
          <span className={cn("min-w-0 truncate", isSelected ? "text-white/80" : "text-muted-foreground")}>
            {node.preview}
          </span>
        )}
      </button>
      {hasChildren && (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <ul className="min-h-0 overflow-hidden">
            {node.children.map((child) => (
              <LayerRow key={child.key} node={child} depth={depth + 1} sectionIndex={sectionIndex} />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

export function LayersTree({
  label,
  pageId,
  sections,
  className,
}: {
  label: string
  pageId: string | null
  sections: PageSummarySection[]
  className?: string
}) {
  const { t } = useLingui()
  const page = usePage(label, pageId ?? "")
  const { selection } = useCanvasEditing()
  const rendering = page.data?.rendering?.sections
  const visible = sections.filter((section) => !section.isPruned)

  const trees = useMemo(
    () =>
      visible.map((section) => {
        const html = rendering?.find((candidate) => candidate.sectionIndex === section.sectionIndex)?.html ?? ""
        return { section, nodes: html ? buildTree(html, section.sectionIndex) : [] }
      }),
    [visible, rendering],
  )

  if (!pageId || visible.length === 0) {
    return (
      <p className={cn("px-3 py-6 text-center text-[11.5px] leading-relaxed text-muted-foreground", className)}>
        <Trans>Layers appear once this page has rendered sections.</Trans>
      </p>
    )
  }

  const orphanSelected =
    selection && !trees.some(({ section, nodes }) => section.sectionIndex === selection.sectionIndex && nodes.some((node) => containsId(node, selection.dataId)))

  return (
    <ScrollArea className={cn("min-h-0 flex-1", className)}>
      <div className="flex flex-col gap-3 p-2">
        {orphanSelected && (
          <p className="rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground animate-in fade-in duration-200">
            {t`Selected: a ${selection.tagName ?? "layout"} container`}
          </p>
        )}
        {trees.map(({ section, nodes }, index) => (
          <div key={section.sectionId} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 px-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span>{t`Section ${index + 1}`}</span>
              <span className="truncate font-normal normal-case tracking-normal">{section.sectionType}</span>
            </div>
            {nodes.length === 0 ? (
              <span className="px-2 text-[11px] text-muted-foreground">
                <Trans>Loading…</Trans>
              </span>
            ) : (
              <ul>
                {nodes.map((node) => (
                  <LayerRow key={node.key} node={node} depth={0} sectionIndex={section.sectionIndex} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
