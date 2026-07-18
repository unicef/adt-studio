import { useState, type ComponentType } from "react"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  CornerLeftUp,
  CornerRightDown,
  Eye,
  EyeOff,
  FilePlus,
  FolderPlus,
  GripVertical,
  Hash,
  Image as ImageIcon,
  Layers,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Merge,
  PanelTop,
  PenLine,
  Puzzle,
  Quote,
  Scissors,
  Sigma,
  SquareSplitVertical,
  Tag,
  Type as TypeIcon,
  Trash2,
} from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { ContentNodeData } from "@adt/types"
import { BASE_URL } from "@/api/client"
import { cn } from "@/lib/utils"
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EditableText } from "./EditableText"
import { TREE_DRAG_TYPE } from "./SectionTreeEditor"

// ── Type-to-visual mapping ──────────────────────────────────────
// Each role/structure gets a distinct icon + accent color so the tree
// is scannable at a glance (activity vs panel vs text vs image, etc).

type Visual = {
  Icon: ComponentType<{ className?: string }>
  text: string // text color class
  bg: string // pill background class
  border: string // left-accent border color class
}

const SLATE: Visual = {
  Icon: TypeIcon,
  text: "text-slate-600",
  bg: "bg-slate-100",
  border: "hover:border-l-slate-400",
}

const VIOLET = (Icon: Visual["Icon"]): Visual => ({
  Icon,
  text: "text-violet-700",
  bg: "bg-violet-100",
  border: "hover:border-l-violet-400",
})

const BLUE = (Icon: Visual["Icon"]): Visual => ({
  Icon,
  text: "text-blue-700",
  bg: "bg-blue-100",
  border: "hover:border-l-blue-400",
})

const AMBER = (Icon: Visual["Icon"]): Visual => ({
  Icon,
  text: "text-amber-700",
  bg: "bg-amber-100",
  border: "hover:border-l-amber-400",
})

const EMERALD = (Icon: Visual["Icon"]): Visual => ({
  Icon,
  text: "text-emerald-700",
  bg: "bg-emerald-100",
  border: "hover:border-l-emerald-400",
})

const SKY = (Icon: Visual["Icon"]): Visual => ({
  Icon,
  text: "text-sky-700",
  bg: "bg-sky-100",
  border: "hover:border-l-sky-400",
})

const INDIGO = (Icon: Visual["Icon"]): Visual => ({
  Icon,
  text: "text-indigo-700",
  bg: "bg-indigo-100",
  border: "hover:border-l-indigo-400",
})

// Structural containers — activities in violet, structural boxes in blue.
function getStructureVisual(structure: string | undefined): Visual {
  if (!structure) return BLUE(Layers)
  if (structure.startsWith("activity")) return VIOLET(Puzzle)
  switch (structure) {
    case "panel":
    case "sidebar":
      return BLUE(PanelTop)
    default:
      return BLUE(Layers)
  }
}

// Leaf roles — heading amber, math indigo, activity-* violet, image emerald,
// question sky, fill-in-the-blank violet, default text slate.
function getRoleVisual(role: string | undefined): Visual {
  if (!role) return SLATE
  if (role === "image") return EMERALD(ImageIcon)
  if (role === "heading") return AMBER(Hash)
  if (role === "math") return INDIGO(Sigma)
  if (role === "caption" || role === "label") return { ...SLATE, Icon: Tag }
  if (role === "quote") return { ...SLATE, Icon: Quote }
  if (role === "activity_fill_in_the_blank" || role === "fill_in" || role === "blank")
    return VIOLET(Link2)
  if (role === "activity_instruction") return VIOLET(PenLine)
  if (role === "activity_question" || role === "question" || role === "prompt")
    return SKY(MessageCircle)
  if (role.startsWith("activity")) return VIOLET(Puzzle)
  return { ...SLATE, Icon: TypeIcon }
}

export interface DragState {
  nodeId: string
}

export interface DropIntent {
  parentNodeId: string | null
  index: number
}

export interface TreeNodeProps {
  node: ContentNodeData
  parentNodeId: string | null
  indexInParent: number
  depth: number
  bookLabel: string
  textRoles?: Record<string, string>
  containerStructures?: Record<string, string>
  disabled?: boolean
  drag: DragState | null
  setDrag: (drag: DragState | null) => void
  onEditText: (nodeId: string, text: string) => void
  onSetRole: (nodeId: string, role: string) => void
  onSetStructure: (nodeId: string, structure: string) => void
  onTogglePruned: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  onDuplicate: (nodeId: string) => void
  onNest: (nodeId: string, structure: string) => void
  onUnnest: (nodeId: string) => void
  onAddChildLeaf: (parentNodeId: string | null, role: string) => void
  onAddChildContainer: (parentNodeId: string | null, structure: string) => void
  onDrop: (sourceNodeId: string, target: DropIntent) => void
  /** Split the node's parent group in two, this node starting the new group. */
  onSplitGroup?: (nodeId: string) => void
  /** Split the section in two, this node starting the new section. */
  onSplitSection?: (nodeId: string) => void
  /** Merge this container into its previous sibling container. */
  onMergeGroup?: (nodeId: string) => void
  /** True when the node's previous sibling is a container. */
  prevSiblingIsContainer?: boolean
  /** True when the node is the first node of its section at every level. */
  firstInSection?: boolean
  defaultTextRole: string
  defaultStructure: string
}

export function TreeNode(props: TreeNodeProps) {
  const { node } = props
  if (node.role === "image") return <ImageLeaf {...props} />
  if (node.role) return <TextLeaf {...props} />
  return <ContainerNode {...props} />
}

// ── Shared drag handle ──────────────────────────────────────────

function DragHandle({
  nodeId,
  disabled,
  setDrag,
  className,
}: {
  nodeId: string
  disabled?: boolean
  setDrag: (drag: DragState | null) => void
  className?: string
}) {
  const { t } = useLingui()
  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => {
        if (disabled) {
          e.preventDefault()
          return
        }
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData(TREE_DRAG_TYPE, nodeId)
        // Defer the state update so React does not re-render mid-dragstart —
        // a synchronous re-render can replace the handle's DOM node and cause
        // some browsers to abort the drag before the first dragover fires.
        requestAnimationFrame(() => setDrag({ nodeId }))
      }}
      onDragEnd={() => setDrag(null)}
      className={cn(
        "shrink-0 p-1 rounded transition-opacity",
        disabled
          ? "cursor-default opacity-30"
          : "cursor-grab active:cursor-grabbing hover:bg-accent opacity-0",
        className
      )}
      title={disabled ? undefined : t`Drag to move`}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
    </div>
  )
}

// ── Kebab action menu ────────────────────────────────────────────

function RowMenu({
  items,
  disabled,
}: {
  items: ActionMenuItem[]
  disabled?: boolean
}) {
  return (
    <ActionMenu
      trigger={<MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />}
      triggerClassName="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30"
      triggerDisabled={disabled}
      items={items}
      itemsDisabled={disabled}
    />
  )
}

// ── Drop zone slot (between siblings) ───────────────────────────

function DropZone({
  parentNodeId,
  index,
  drag,
  onDrop,
}: {
  parentNodeId: string | null
  index: number
  drag: DragState | null
  onDrop: (sourceNodeId: string, target: DropIntent) => void
}) {
  const [over, setOver] = useState(false)
  if (!drag) return null
  // Tall transparent hit area with a thin centered line so targets are easy
  // to aim at during a drag without visually dominating the tree.
  return (
    <div
      className="relative h-2 -my-0.5 flex items-center"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TREE_DRAG_TYPE)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = "move"
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        const sourceId = e.dataTransfer.getData(TREE_DRAG_TYPE)
        if (!sourceId) return
        onDrop(sourceId, { parentNodeId, index })
      }}
    >
      <div
        className={cn(
          "w-full h-0.5 rounded-full transition-colors pointer-events-none",
          over ? "bg-primary h-1" : "bg-primary/20"
        )}
      />
    </div>
  )
}

// ── Container ───────────────────────────────────────────────────

function ContainerNode(props: TreeNodeProps) {
  const {
    node,
    depth,
    containerStructures,
    disabled,
    drag,
    setDrag,
    onSetStructure,
    onTogglePruned,
    onDelete,
    onDuplicate,
    onNest,
    onUnnest,
    onAddChildLeaf,
    onAddChildContainer,
    onDrop,
    onSplitGroup,
    onSplitSection,
    onMergeGroup,
    prevSiblingIsContainer,
    firstInSection,
    defaultTextRole,
    defaultStructure,
    parentNodeId,
    indexInParent,
    bookLabel,
    textRoles,
    onEditText,
    onSetRole,
  } = props
  const { t } = useLingui()
  const [collapsed, setCollapsed] = useState(false)
  const [dropOver, setDropOver] = useState(false)
  const children = node.children ?? []
  const structureLabel = node.structure ?? "group"
  const isDragging = drag?.nodeId === node.nodeId
  const visual = getStructureVisual(node.structure)

  // Dropping directly onto a container (e.g. when it is collapsed or empty)
  // appends the moved node as the container's last child.
  const canAcceptDrop = !!drag && drag.nodeId !== node.nodeId

  return (
    <div
      className={cn(
        "relative rounded-md border border-transparent border-l-2 border-l-slate-300 pl-1.5 pr-1 py-1 transition-colors hover:border-slate-200",
        visual.border,
        node.isPruned && "opacity-40",
        isDragging && "opacity-30",
        dropOver && "ring-2 ring-primary"
      )}
    >
      <div
        className={cn(
          "group/head flex items-center gap-1.5 rounded",
          dropOver && "bg-primary/5"
        )}
        onDragOver={(e) => {
          if (!canAcceptDrop) return
          if (!e.dataTransfer.types.includes(TREE_DRAG_TYPE)) return
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = "move"
          setDropOver(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setDropOver(false)
        }}
        onDrop={(e) => {
          if (!canAcceptDrop) return
          e.preventDefault()
          e.stopPropagation()
          setDropOver(false)
          const sourceId = e.dataTransfer.getData(TREE_DRAG_TYPE)
          if (!sourceId) return
          onDrop(sourceId, { parentNodeId: node.nodeId, index: children.length })
        }}
      >
        {containerStructures ? (
          <Select
            value={node.structure ?? defaultStructure}
            onValueChange={(val) => onSetStructure(node.nodeId, val)}
            disabled={disabled}
          >
            <SelectTrigger
              className={cn(
                "h-6 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0 w-auto border-0 rounded-md gap-1 [&>svg]:opacity-70",
                visual.bg,
                visual.text
              )}
            >
              <visual.Icon className="h-3.5 w-3.5 shrink-0" />
              <SelectValue>{structureLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.keys(containerStructures).map((key) => {
                const v = getStructureVisual(key)
                return (
                  <SelectItem key={key} value={key} className="text-xs">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        v.bg,
                        v.text
                      )}
                    >
                      <v.Icon className="h-3 w-3 shrink-0" />
                      {key}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1 h-6 rounded-md px-1.5 text-[10px] font-semibold uppercase tracking-wider",
              visual.bg,
              visual.text
            )}
          >
            <visual.Icon className="h-3.5 w-3.5 shrink-0" />
            {structureLabel}
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
          title={collapsed ? t`Expand` : t`Collapse`}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/head:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onTogglePruned(node.nodeId)}
            disabled={disabled}
            className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30"
            title={node.isPruned ? t`Include in render` : t`Exclude from render`}
          >
            {node.isPruned ? (
              <EyeOff className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Eye className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
          <RowMenu
            disabled={disabled}
            items={[
              {
                icon: CornerLeftUp,
                label: t`Remove from group`,
                onClick: () => onUnnest(node.nodeId),
                hidden: parentNodeId == null,
              },
              {
                icon: CornerRightDown,
                label: t`Wrap in group`,
                onClick: () => onNest(node.nodeId, defaultStructure),
              },
              {
                icon: SquareSplitVertical,
                label: t`Split group here`,
                onClick: () => onSplitGroup!(node.nodeId),
                hidden:
                  !onSplitGroup || parentNodeId == null || indexInParent === 0,
              },
              {
                icon: Scissors,
                label: t`Split into new section`,
                onClick: () => onSplitSection!(node.nodeId),
                hidden: !onSplitSection || firstInSection,
              },
              {
                icon: Merge,
                label: t`Merge with previous group`,
                onClick: () => onMergeGroup!(node.nodeId),
                hidden: !onMergeGroup || !prevSiblingIsContainer,
              },
              {
                icon: FilePlus,
                label: t`Add text`,
                onClick: () => onAddChildLeaf(node.nodeId, defaultTextRole),
              },
              {
                icon: ImageIcon,
                label: t`Add image`,
                onClick: () => onAddChildLeaf(node.nodeId, "image"),
              },
              {
                icon: FolderPlus,
                label: t`Add group`,
                onClick: () =>
                  onAddChildContainer(node.nodeId, defaultStructure),
              },
              {
                icon: Copy,
                label: t`Duplicate`,
                onClick: () => onDuplicate(node.nodeId),
              },
              {
                icon: Trash2,
                label: t`Delete`,
                onClick: () => onDelete(node.nodeId),
                danger: true,
                hidden: !node.isPruned,
              },
            ]}
          />
        </div>
        <DragHandle
          nodeId={node.nodeId}
          disabled={disabled}
          setDrag={setDrag}
          className="group-hover/head:opacity-100"
        />
      </div>

      {!collapsed && (
        <div
          className="pl-2 pr-1 py-1"
          style={{ marginLeft: depth === 0 ? 0 : 4 }}
        >
          <DropZone
            parentNodeId={node.nodeId}
            index={0}
            drag={drag}
            onDrop={onDrop}
          />
          {children.length === 0 && !drag && (
            <div className="text-[11px] italic text-muted-foreground/60 py-1 px-1">
              {t`Empty container`}
            </div>
          )}
          {children.map((child, i) => (
            <div key={child.nodeId}>
              <TreeNode
                node={child}
                parentNodeId={node.nodeId}
                indexInParent={i}
                depth={depth + 1}
                bookLabel={bookLabel}
                textRoles={textRoles}
                containerStructures={containerStructures}
                disabled={disabled}
                drag={drag}
                setDrag={setDrag}
                onEditText={onEditText}
                onSetRole={onSetRole}
                onSetStructure={onSetStructure}
                onTogglePruned={onTogglePruned}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onNest={onNest}
                onUnnest={onUnnest}
                onAddChildLeaf={onAddChildLeaf}
                onAddChildContainer={onAddChildContainer}
                onDrop={onDrop}
                onSplitGroup={onSplitGroup}
                onSplitSection={onSplitSection}
                onMergeGroup={onMergeGroup}
                prevSiblingIsContainer={i > 0 && !children[i - 1].role}
                firstInSection={firstInSection && i === 0}
                defaultTextRole={defaultTextRole}
                defaultStructure={defaultStructure}
              />
              <DropZone
                parentNodeId={node.nodeId}
                index={i + 1}
                drag={drag}
                onDrop={onDrop}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Text leaf ───────────────────────────────────────────────────

function TextLeaf(props: TreeNodeProps) {
  const {
    node,
    textRoles,
    disabled,
    setDrag,
    onEditText,
    onSetRole,
    onTogglePruned,
    onDelete,
    onDuplicate,
    onNest,
    onUnnest,
    onSplitGroup,
    onSplitSection,
    firstInSection,
    parentNodeId,
    indexInParent,
    defaultStructure,
  } = props
  const { t } = useLingui()
  const isDragging = props.drag?.nodeId === node.nodeId
  const visual = getRoleVisual(node.role)

  return (
    <div
      className={cn(
        "group/row flex items-start gap-1.5 rounded pl-0.5 pr-1 py-0.5 transition-colors hover:bg-muted/40",
        node.isPruned && "opacity-40",
        isDragging && "opacity-30"
      )}
    >
      {textRoles ? (
        <Select
          value={node.role ?? "text"}
          onValueChange={(val) => onSetRole(node.nodeId, val)}
          disabled={disabled}
        >
          <SelectTrigger
            className={cn(
              "group/pill shrink-0 h-5 text-[10px] font-medium px-1 py-0 w-auto border-0 rounded gap-0.5 [&>svg]:opacity-70",
              visual.bg,
              visual.text
            )}
          >
            <visual.Icon className="h-3 w-3 shrink-0" />
            <SelectValue asChild>
              <span className="overflow-hidden whitespace-nowrap transition-all duration-150 max-w-0 group-hover/pill:max-w-[140px] group-hover/pill:ml-1 uppercase tracking-wider font-semibold">
                {node.role}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.keys(textRoles).map((key) => {
              const v = getRoleVisual(key)
              return (
                <SelectItem key={key} value={key} className="text-xs">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      v.bg,
                      v.text
                    )}
                  >
                    <v.Icon className="h-3 w-3 shrink-0" />
                    {key}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      ) : (
        <span
          className={cn(
            "group/pill shrink-0 inline-flex items-center gap-0.5 h-5 rounded px-1 text-[10px] font-medium",
            visual.bg,
            visual.text
          )}
        >
          <visual.Icon className="h-3 w-3 shrink-0" />
          <span className="overflow-hidden whitespace-nowrap transition-all duration-150 max-w-0 group-hover/pill:max-w-[140px] group-hover/pill:ml-1 uppercase tracking-wider font-semibold">
            {node.role}
          </span>
        </span>
      )}
      <EditableText
        value={node.text ?? ""}
        onCommit={(next) => onEditText(node.nodeId, next)}
        disabled={disabled}
      />
      <div className="shrink-0 flex items-center gap-0.5 self-center ml-auto opacity-0 group-hover/row:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onTogglePruned(node.nodeId)}
          disabled={disabled}
          className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30"
          title={node.isPruned ? t`Include in render` : t`Exclude from render`}
        >
          {node.isPruned ? (
            <EyeOff className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Eye className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <RowMenu
          disabled={disabled}
          items={[
            {
              icon: CornerLeftUp,
              label: t`Remove from group`,
              onClick: () => onUnnest(node.nodeId),
              hidden: parentNodeId == null,
            },
            {
              icon: CornerRightDown,
              label: t`Wrap in group`,
              onClick: () => onNest(node.nodeId, defaultStructure),
            },
            {
              icon: SquareSplitVertical,
              label: t`Split group here`,
              onClick: () => onSplitGroup!(node.nodeId),
              hidden:
                !onSplitGroup || parentNodeId == null || indexInParent === 0,
            },
            {
              icon: Scissors,
              label: t`Split into new section`,
              onClick: () => onSplitSection!(node.nodeId),
              hidden: !onSplitSection || firstInSection,
            },
            {
              icon: Copy,
              label: t`Duplicate`,
              onClick: () => onDuplicate(node.nodeId),
            },
            {
              icon: Trash2,
              label: t`Delete`,
              onClick: () => onDelete(node.nodeId),
              danger: true,
              hidden: !node.isPruned,
            },
          ]}
        />
      </div>
      <DragHandle
        nodeId={node.nodeId}
        disabled={disabled}
        setDrag={setDrag}
        className="group-hover/row:opacity-100"
      />
    </div>
  )
}

// ── Image leaf ──────────────────────────────────────────────────

function ImageLeaf(props: TreeNodeProps) {
  const {
    node,
    bookLabel,
    disabled,
    setDrag,
    onTogglePruned,
    onDelete,
    onDuplicate,
    onSplitGroup,
    onSplitSection,
    firstInSection,
    parentNodeId,
    indexInParent,
  } = props
  const { t } = useLingui()
  const isDragging = props.drag?.nodeId === node.nodeId
  const visual = getRoleVisual("image")
  return (
    <div
      className={cn(
        "group/row flex items-center gap-2 rounded pl-1 pr-2 py-1 transition-colors hover:bg-muted/40",
        node.isPruned && "opacity-40",
        isDragging && "opacity-30"
      )}
    >
      <span
        className={cn(
          "group/pill shrink-0 inline-flex items-center gap-0.5 h-5 rounded px-1 text-[10px] font-medium",
          visual.bg,
          visual.text
        )}
      >
        <visual.Icon className="h-3 w-3 shrink-0" />
        <span className="overflow-hidden whitespace-nowrap transition-all duration-150 max-w-0 group-hover/pill:max-w-[80px] group-hover/pill:ml-1 uppercase tracking-wider font-semibold">
          {t`image`}
        </span>
      </span>
      <img
        src={`${BASE_URL}/books/${bookLabel}/images/${node.nodeId}`}
        alt={node.nodeId}
        className={cn(
          "h-10 w-auto rounded border bg-white object-contain",
          node.isPruned && "grayscale"
        )}
        onError={(e) => {
          ;(e.target as HTMLImageElement).style.display = "none"
        }}
      />
      <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">
        {node.nodeId}
      </span>
      <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onTogglePruned(node.nodeId)}
          disabled={disabled}
          className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer disabled:opacity-30"
          title={node.isPruned ? t`Include in render` : t`Exclude from render`}
        >
          {node.isPruned ? (
            <EyeOff className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Eye className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
        <RowMenu
          disabled={disabled}
          items={[
            {
              icon: SquareSplitVertical,
              label: t`Split group here`,
              onClick: () => onSplitGroup!(node.nodeId),
              hidden:
                !onSplitGroup || parentNodeId == null || indexInParent === 0,
            },
            {
              icon: Scissors,
              label: t`Split into new section`,
              onClick: () => onSplitSection!(node.nodeId),
              hidden: !onSplitSection || firstInSection,
            },
            {
              icon: Copy,
              label: t`Duplicate`,
              onClick: () => onDuplicate(node.nodeId),
            },
            {
              icon: Trash2,
              label: t`Delete`,
              onClick: () => onDelete(node.nodeId),
              danger: true,
              hidden: !node.isPruned,
            },
          ]}
        />
      </div>
      <DragHandle
        nodeId={node.nodeId}
        disabled={disabled}
        setDrag={setDrag}
        className="group-hover/row:opacity-100"
      />
    </div>
  )
}
