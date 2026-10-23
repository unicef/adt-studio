import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { PageSummarySection } from "@/api/client"
import { usePage } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"
import { useCanvasEditing } from "../CanvasEditing"
import { Plus } from "lucide-react"
import { AddElementsPanel } from "./AddElementsPanel"
import { opaqueBackground } from "./panelBase"
import { LayerRow, PickedLayer } from "./LayerRow"
import { buildTree, containsId, humanizeLayout, type LayerNode } from "./model"

const TREE_COLORS = cn(
  "[--group-bg:color-mix(in_oklab,var(--tint)_6%,var(--panel-base))] dark:[--group-bg:color-mix(in_oklab,var(--tint)_12%,var(--panel-base))]",
  "[--group-hover-bg:color-mix(in_oklab,var(--tint)_11%,var(--panel-base))] dark:[--group-hover-bg:color-mix(in_oklab,var(--tint)_19%,var(--panel-base))]",
  "[--hover-bg:color-mix(in_oklab,var(--foreground)_6%,var(--panel-base))]",
)

export function LayersTree({
  label,
  pageId,
  title,
  sections,
  className,
}: {
  label: string
  pageId: string | null
  title?: string
  sections: PageSummarySection[]
  className?: string
}) {
  const { t } = useLingui()
  const page = usePage(label, pageId ?? "")
  const { selection } = useCanvasEditing()
  const [picked, setPicked] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const closeAdding = useCallback(() => setAdding(false), [])
  const treeRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tree = treeRef.current
    if (!tree) return
    const measure = () => tree.style.setProperty("--tree-w", `${tree.clientWidth}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(tree)
    return () => observer.disconnect()
  })
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const paint = () => root.style.setProperty("--panel-base", opaqueBackground(root))
    paint()
    const observer = new MutationObserver(() => requestAnimationFrame(paint))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] })
    return () => observer.disconnect()
  }, [])
  useEffect(() => setPicked(null), [selection?.dataId, selection?.sectionIndex, pageId])
  const rendering = page.data?.rendering?.sections
  const visible = sections.filter((section) => !section.isPruned)

  const roots = useMemo(
    () =>
      visible.map((section, index) => {
        const html = rendering?.find((candidate) => candidate.sectionIndex === section.sectionIndex)?.html ?? ""
        const node: LayerNode = { key: `section-${section.sectionId}`, dataId: null, tag: "section-root", preview: "", children: html ? buildTree(html, section.sectionIndex) : [] }
        return { section, index, node, loading: !html }
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

  const selectedKey = selection?.dataId ?? null
  const holder = selectedKey ? roots.find(({ section, node }) => section.sectionIndex === selection?.sectionIndex && containsId(node, selectedKey)) : undefined
  const focusKey = holder && selectedKey ? selectedKey : (roots[0]?.node.key ?? null)
  const orphanSelected = !!selection && !holder

  return (
    <div ref={rootRef} className={cn("flex min-h-0 flex-1 flex-col", TREE_COLORS, className)} style={{ ["--tint" as string]: STORYBOARD_HEX }}>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em]">{title ?? t`Layers`}</h3>
        <button
          type="button"
          aria-expanded={adding}
          aria-label={adding ? t`Close the element list` : t`Add an element`}
          title={adding ? t`Close the element list` : t`Add an element`}
          onClick={() => setAdding((value) => !value)}
          className={cn(
            "grid size-8 shrink-0 cursor-pointer place-items-center rounded-[10px] bg-muted text-foreground/80 outline-none",
            "transition-[background-color,color,scale] duration-150 ease-out hover:bg-foreground/10 hover:text-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
          )}
        >
          <Plus className={cn("size-4 transition-transform duration-200 ease-out motion-reduce:transition-none", adding && "rotate-45")} strokeWidth={2.2} />
        </button>
        <AddElementsPanel open={adding} onClose={closeAdding} />
      </div>
      {orphanSelected && (
        <p className="mx-3 mb-1 rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground animate-in fade-in duration-200">
          {t`Selected: a ${selection.tagName ?? "layout"} container`}
        </p>
      )}
      <PickedLayer.Provider value={{ picked, pick: setPicked }}>
      <div ref={treeRef} data-layers-tree="" className="mx-3 min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-width:none]! [&::-webkit-scrollbar]:hidden!">
        <ul role="tree" aria-label={t`Page layers`} className="flex w-max min-w-full flex-col gap-0.5 pb-3">
          {roots.map(({ section, index, node, loading }) =>
            loading ? (
              <li key={node.key} className="flex h-8 items-center gap-2 px-2 text-[12px] text-muted-foreground">
                {t`Section ${index + 1}`} · <Trans>Loading…</Trans>
              </li>
            ) : (
              <SectionRoot key={node.key} node={node} index={index} sectionIndex={section.sectionIndex} layout={humanizeLayout(section.sectionType ?? "")} focusKey={focusKey} />
            ),
          )}
        </ul>
      </div>
      </PickedLayer.Provider>
    </div>
  )
}

function SectionRoot({ node, index, sectionIndex, layout, focusKey }: { node: LayerNode; index: number; sectionIndex: number; layout: string; focusKey: string | null }) {
  const { t } = useLingui()
  return <LayerRow node={{ ...node, preview: "" }} depth={0} sectionIndex={sectionIndex} focusKey={focusKey} title={t`Section ${index + 1}`} detail={layout || undefined} />
}
