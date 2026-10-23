import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronRight, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCanvasEditing } from "../CanvasEditing"
import { containsId, describe, type LayerNode } from "./model"
import { tweenScroll } from "./scrollTween"

const INDENT = 14
const LEAD = 8
const EDGE = 12

export const PickedLayer = createContext<{ picked: string | null; pick: (key: string) => void }>({ picked: null, pick: () => {} })

function treeItems(from: HTMLElement): HTMLElement[] {
  const root = from.closest("[data-layers-tree]")
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>("[role=treeitem]")].filter((item) => !item.closest("[inert]"))
}

function onTreeKeyDown(
  event: React.KeyboardEvent<HTMLLIElement>,
  { hasChildren, open, setOpen, activate }: { hasChildren: boolean; open: boolean; setOpen: (open: boolean) => void; activate: () => void },
) {
  if (event.target !== event.currentTarget) return
  const item = event.currentTarget
  const items = treeItems(item)
  const index = items.indexOf(item)
  const focus = (target: HTMLElement | undefined | null) => {
    if (!target) return
    event.preventDefault()
    target.focus()
  }
  if (event.key === "ArrowDown") focus(items[index + 1])
  else if (event.key === "ArrowUp") focus(items[index - 1])
  else if (event.key === "Home") focus(items[0])
  else if (event.key === "End") focus(items[items.length - 1])
  else if (event.key === "ArrowRight" && hasChildren) {
    event.preventDefault()
    if (!open) setOpen(true)
    else focus(item.querySelector<HTMLElement>("[role=group] [role=treeitem]"))
  } else if (event.key === "ArrowLeft") {
    if (hasChildren && open) {
      event.preventDefault()
      setOpen(false)
    } else focus(item.parentElement?.closest<HTMLElement>("[role=treeitem]"))
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault()
    activate()
  }
}

export function LayerRow({
  node,
  depth,
  sectionIndex,
  focusKey,
  detail,
  title,
  inSelection = false,
}: {
  node: LayerNode
  depth: number
  sectionIndex: number
  focusKey: string | null
  detail?: string
  title?: string
  inSelection?: boolean
}) {
  const { t, i18n } = useLingui()
  const { selection, select } = useCanvasEditing()
  const { picked, pick } = useContext(PickedLayer)
  const isSelected = picked ? picked === node.key : !!node.dataId && selection?.sectionIndex === sectionIndex && selection.dataId === node.dataId
  const holdsSelection = !!selection && selection.sectionIndex === sectionIndex && containsId(node, selection.dataId)
  const [open, setOpen] = useState(true)
  const [hidden, setHidden] = useState(false)
  const iconRef = useRef<SVGSVGElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const { icon: Icon, label } = describe(node.tag)
  const hasChildren = node.children.length > 0
  const grouped = isSelected && hasChildren && open

  useEffect(() => {
    if (holdsSelection && !isSelected) setOpen(true)
  }, [holdsSelection, isSelected])

  useEffect(() => {
    if (!isSelected) return
    const anchor = () => {
      const row = rowRef.current
      const tree = row?.closest<HTMLElement>("[data-layers-tree]")
      const icon = iconRef.current
      const text = labelRef.current
      if (!row || !tree || !icon || !text) return
      const box = tree.getBoundingClientRect()
      const start = tree.scrollLeft + icon.getBoundingClientRect().left - box.left
      const end = tree.scrollLeft + text.getBoundingClientRect().left - box.left + text.scrollWidth
      const width = end - start
      const rowBox = row.getBoundingClientRect()
      const outside = rowBox.top < box.top + 8 || rowBox.bottom > box.bottom - 8
      const top = outside ? tree.scrollTop + rowBox.top - box.top - (tree.clientHeight - rowBox.height) / 2 : tree.scrollTop
      const left = width + EDGE * 2 >= tree.clientWidth ? start - EDGE : start - (tree.clientWidth - width) / 2
      tweenScroll(tree, { left: left < INDENT ? 0 : left, top })
    }
    const frame = requestAnimationFrame(anchor)
    const settle = window.setTimeout(anchor, 240)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settle)
    }
  }, [isSelected])

  const heading = /^h[1-6]$/.test(node.tag) ? node.tag.toUpperCase() : null
  const activate = () => {
    if (node.dataId) select({ sectionIndex, dataId: node.dataId, tagName: node.tag })
    else pick(node.key)
  }
  const textual = !hasChildren && !!node.preview && node.tag !== "img" && node.tag !== "picture" && node.tag !== "svg"
  const shownLabel = title ?? (textual ? node.preview : i18n._(label))
  const name = [shownLabel, heading, detail ?? node.preview].filter(Boolean).join(", ")
  const secondary = title ? "" : (detail ?? (textual ? "" : node.preview))
  const stripClassName = isSelected
    ? cn("[--strip:var(--tint)] [--strip-hover:var(--tint)]")
    : inSelection
      ? cn("[--strip:var(--group-bg)] [--strip-hover:var(--group-hover-bg)]")
      : cn("[--strip:var(--panel-base)] [--strip-hover:var(--hover-bg)]")

  return (
    <li
      role="treeitem"
      aria-label={name}
      aria-level={depth + 1}
      aria-expanded={hasChildren ? open : undefined}
      aria-selected={isSelected}
      tabIndex={node.key === focusKey ? 0 : -1}
      onKeyDown={(event) => onTreeKeyDown(event, { hasChildren, open, setOpen, activate })}
      className="relative outline-none"
    >
      {grouped && (
        <span aria-hidden className="pointer-events-none absolute inset-0 animate-in fade-in duration-200 motion-reduce:animate-none">
          <span
            className="sticky left-0 block h-full w-(--tree-w) rounded-[10px] bg-(--group-bg)"
          />
        </span>
      )}
      <div
        ref={rowRef}
        onClick={activate}
        title={title && detail ? detail : undefined}
        className={cn(
          "group/row relative flex h-8 w-max min-w-full cursor-default items-center pr-3 text-[13px] whitespace-nowrap",
          stripClassName,
          "hover:[--strip:var(--strip-hover)]",
          "transition-colors duration-150 ease-out motion-reduce:transition-none",
          "[:focus-visible>&>[data-row-bg]]:outline-2 [:focus-visible>&>[data-row-bg]]:-outline-offset-2",
          isSelected ? "text-white [:focus-visible>&>[data-row-bg]]:outline-white/60" : "text-foreground/70 hover:text-foreground [:focus-visible>&>[data-row-bg]]:outline-ring",
          hidden && !isSelected && "text-foreground/40",
        )}
        style={{ paddingLeft: LEAD + depth * INDENT }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span
            data-row-bg=""
            className={cn(
              "sticky left-0 block h-full w-(--tree-w)",
              isSelected
                ? cn("bg-(--tint)", grouped ? "rounded-t-[10px]" : "rounded-[10px]")
                : cn("rounded-[10px]", inSelection ? "group-hover/row:bg-(--group-hover-bg)" : "group-hover/row:bg-(--hover-bg)"),
            )}
          />
        </span>
        <span className="relative flex min-w-0 max-w-(--tree-w) flex-1 items-center gap-2">
          <span
            aria-hidden
            onClick={(event) => {
              if (!hasChildren) return
              event.stopPropagation()
              setOpen((value) => !value)
            }}
            className={cn("grid size-4 shrink-0 place-items-center rounded-[4px]", hasChildren ? "hover:bg-black/10 dark:hover:bg-white/10" : "invisible")}
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform duration-200 motion-reduce:transition-none",
                open && "rotate-90",
                isSelected ? "text-white/70" : "text-muted-foreground/60",
              )}
              strokeWidth={2}
            />
          </span>
          <Icon
            ref={iconRef}
            aria-hidden
            className={cn(
              "size-4 shrink-0 transition-[color,fill] duration-150",
              isSelected ? "fill-white/20 text-white" : "text-muted-foreground/80",
            )}
            strokeWidth={1.75}
          />
          <span ref={labelRef} className={cn("min-w-0 truncate", isSelected ? "font-medium" : "font-normal")}>{shownLabel}</span>
          {heading && (
            <span className={cn("rounded-[5px] px-1 font-mono text-[9.5px]", isSelected ? "bg-white/20" : "bg-muted text-muted-foreground")}>{heading}</span>
          )}
          {secondary && <span className={cn("min-w-0 shrink-[2] truncate text-[12px]", isSelected ? "text-white/75" : "text-muted-foreground")}>{secondary}</span>}
        </span>
        <span className="pointer-events-none absolute inset-0 flex justify-end">
          <span
            className={cn(
              "pointer-events-auto sticky right-0 flex items-center rounded-r-[14px] pr-1 pl-0.5",
              "h-full",
              "before:pointer-events-none before:absolute before:inset-y-0 before:right-full before:w-4 before:bg-(--strip) before:[mask-image:linear-gradient(to_left,black,transparent)]",
              hidden ? "bg-(--strip)" : "bg-transparent before:hidden group-hover/row:bg-(--strip) group-hover/row:before:block",
            )}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-label={hidden ? t`Show layer` : t`Hide layer`}
              title={hidden ? t`Show layer` : t`Hide layer`}
              onClick={(event) => {
                event.stopPropagation()
                setHidden((value) => !value)
              }}
              className={cn(
                "grid shrink-0 cursor-pointer place-items-center overflow-hidden rounded-[6px]",
                hidden ? "w-6 opacity-100" : "w-0 opacity-0 group-hover/row:w-6 group-hover/row:opacity-100 focus-visible:w-6 focus-visible:opacity-100",
                "h-6",
                isSelected ? "text-white/85 hover:bg-white/15" : "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
              )}
            >
              {hidden ? <EyeOff className="size-3.5" strokeWidth={1.9} /> : <Eye className="size-3.5" strokeWidth={1.9} />}
            </button>
          </span>
        </span>
      </div>
      {hasChildren && (
        <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <ul
            role="group"
            inert={!open}
            className={cn("relative min-h-0 overflow-clip", grouped && "pb-1")}
          >
            {node.children.map((child) => (
              <LayerRow key={child.key} node={child} depth={depth + 1} sectionIndex={sectionIndex} focusKey={focusKey} inSelection={inSelection || isSelected} />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}
