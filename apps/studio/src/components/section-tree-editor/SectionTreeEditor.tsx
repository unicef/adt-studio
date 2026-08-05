import { useCallback, useMemo, useState, type ComponentType } from "react"
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu"
import { useLingui } from "@lingui/react/macro"
import {
  ChevronDown,
  FilePlus,
  FolderPlus,
  Image as ImageIcon,
  Merge,
  Plus,
  Scissors,
} from "lucide-react"
import type { ContentNodeData, PageSectioningSection } from "@adt/types"
import {
  addContainer,
  addLeaf,
  deleteNode,
  duplicateNode,
  editLeafText,
  mergeAdjacentContainers,
  mergeContainerWithPrevious,
  moveNode,
  nestNode,
  setContainerStructure,
  setLeafRole,
  splitContainerBefore,
  toggleNodePruned,
  unnestNode,
  findNode,
  type IdFactory,
} from "@adt/types"
import { cn } from "@/lib/utils"
import { TreeNode, type DragState, type DropIntent } from "./TreeNode"

export interface SectionTreeEditorProps {
  section: PageSectioningSection
  onChange: (next: PageSectioningSection) => void
  bookLabel: string
  textRoles?: Record<string, string>
  containerStructures?: Record<string, string>
  disabled?: boolean
  idFactory?: IdFactory
  /** Called when a leaf's text is edited. Parent can mirror the change into preview HTML. */
  onLeafTextEdited?: (nodeId: string, newText: string) => void
  /** Called after a leaf is duplicated. Parent can clone the preview DOM element. */
  onLeafDuplicated?: (sourceNodeId: string, newNodeId: string) => void
  /** Called after a leaf is deleted. Parent can remove the preview DOM element. */
  onLeafDeleted?: (nodeId: string) => void
  /** Called whenever a change happens that needs a re-render (structural change). */
  onStructuralChange?: () => void
  /**
   * When provided, a "split" divider is shown between top-level nodes.
   * Called with the index of the first node that should move into the new
   * section (i.e. split happens before `nodes[beforeNodeIndex]`).
   */
  onSplitBefore?: (beforeNodeIndex: number) => void
  /**
   * When provided, every node's menu offers "Split into new section" —
   * called with the node that should start the new section (works at any
   * depth; ancestor groups are split along the way).
   */
  onSplitSection?: (nodeId: string) => void
  /**
   * When set, splitting is blocked and this text explains why (shown as the
   * tooltip on the split control). Used by the sectioning editor, where a split
   * is a server-side op that can't run while there are unsaved local edits.
   */
  splitDisabledReason?: string
  /**
   * Section-level merge entries for the footer "Merge" menu (e.g. merge
   * with the previous/next section or page). When provided, the menu is
   * shown with these entries plus the built-in group-merge action.
   */
  sectionMergeItems?: FooterMenuItem[]
}

export type FooterMenuItem = ActionMenuItem

const DEFAULT_ID_PREFIX = "user_node"

function defaultIdFactory(): string {
  return `${DEFAULT_ID_PREFIX}_${crypto.randomUUID().slice(0, 8)}`
}

export function SectionTreeEditor({
  section,
  onChange,
  bookLabel,
  textRoles,
  containerStructures,
  disabled,
  idFactory = defaultIdFactory,
  onLeafTextEdited,
  onLeafDuplicated,
  onLeafDeleted,
  onStructuralChange,
  onSplitBefore,
  onSplitSection,
  splitDisabledReason,
  sectionMergeItems,
}: SectionTreeEditorProps) {
  const { t } = useLingui()
  const [drag, setDrag] = useState<DragState | null>(null)

  const applyNodes = useCallback(
    (nextNodes: ContentNodeData[]) => {
      if (nextNodes === section.nodes) return
      onChange({ ...section, nodes: nextNodes })
    },
    [section, onChange]
  )

  // Leaf text edit — kept separate so we can call the mirror callback.
  const handleEditText = useCallback(
    (nodeId: string, text: string) => {
      const next = editLeafText(section.nodes, nodeId, text)
      if (next !== section.nodes) {
        applyNodes(next)
        onLeafTextEdited?.(nodeId, text)
      }
    },
    [section.nodes, applyNodes, onLeafTextEdited]
  )

  const handleSetRole = useCallback(
    (nodeId: string, role: string) => {
      const next = setLeafRole(section.nodes, nodeId, role)
      if (next !== section.nodes) {
        applyNodes(next)
        onStructuralChange?.()
      }
    },
    [section.nodes, applyNodes, onStructuralChange]
  )

  const handleSetStructure = useCallback(
    (nodeId: string, structure: string) => {
      const next = setContainerStructure(section.nodes, nodeId, structure)
      if (next !== section.nodes) {
        applyNodes(next)
        onStructuralChange?.()
      }
    },
    [section.nodes, applyNodes, onStructuralChange]
  )

  const handleTogglePruned = useCallback(
    (nodeId: string) => {
      const node = findNode(section.nodes, nodeId)
      const wasPruned = node?.isPruned ?? false
      applyNodes(toggleNodePruned(section.nodes, nodeId))
      // Un-pruning restores the node to the render — that needs a fresh render.
      if (wasPruned) onStructuralChange?.()
    },
    [section.nodes, applyNodes, onStructuralChange]
  )

  const handleDelete = useCallback(
    (nodeId: string) => {
      const node = findNode(section.nodes, nodeId)
      applyNodes(deleteNode(section.nodes, nodeId))
      if (node?.role && node.role !== "image") {
        onLeafDeleted?.(nodeId)
      } else {
        onStructuralChange?.()
      }
    },
    [section.nodes, applyNodes, onLeafDeleted, onStructuralChange]
  )

  const handleDuplicate = useCallback(
    (nodeId: string) => {
      const node = findNode(section.nodes, nodeId)
      // Capture the new ids we are about to mint so we can tell the parent
      // which new id corresponds to the source (for preview mirroring).
      let firstNewId: string | null = null
      const wrappedFactory: IdFactory = () => {
        const id = idFactory()
        if (firstNewId == null) firstNewId = id
        return id
      }
      applyNodes(duplicateNode(section.nodes, nodeId, wrappedFactory))
      if (node?.role && node.role !== "image" && firstNewId) {
        onLeafDuplicated?.(nodeId, firstNewId)
      } else {
        onStructuralChange?.()
      }
    },
    [section.nodes, applyNodes, idFactory, onLeafDuplicated, onStructuralChange]
  )

  const handleNest = useCallback(
    (nodeId: string, structure: string) => {
      applyNodes(nestNode(section.nodes, nodeId, structure, idFactory))
      onStructuralChange?.()
    },
    [section.nodes, applyNodes, idFactory, onStructuralChange]
  )

  const handleUnnest = useCallback(
    (nodeId: string) => {
      const next = unnestNode(section.nodes, nodeId)
      if (next !== section.nodes) {
        applyNodes(next)
        onStructuralChange?.()
      }
    },
    [section.nodes, applyNodes, onStructuralChange]
  )

  const handleSplitGroup = useCallback(
    (nodeId: string) => {
      const next = splitContainerBefore(section.nodes, nodeId, idFactory)
      if (next !== section.nodes) {
        applyNodes(next)
        onStructuralChange?.()
      }
    },
    [section.nodes, applyNodes, idFactory, onStructuralChange]
  )

  const handleMergeGroup = useCallback(
    (nodeId: string) => {
      const next = mergeContainerWithPrevious(section.nodes, nodeId)
      if (next !== section.nodes) {
        applyNodes(next)
        onStructuralChange?.()
      }
    },
    [section.nodes, applyNodes, onStructuralChange]
  )

  // Result of collapsing adjacent same-structure groups — reference-equal to
  // the current nodes when there is nothing to merge.
  const adjacentGroupsMerged = useMemo(
    () => mergeAdjacentContainers(section.nodes),
    [section.nodes]
  )

  const handleMergeAdjacentGroups = useCallback(() => {
    if (adjacentGroupsMerged !== section.nodes) {
      applyNodes(adjacentGroupsMerged)
      onStructuralChange?.()
    }
  }, [adjacentGroupsMerged, section.nodes, applyNodes, onStructuralChange])

  const handleAddContainerAtRoot = useCallback(() => {
    const structure =
      (containerStructures && Object.keys(containerStructures)[0]) ?? "group"
    applyNodes(
      addContainer(section.nodes, null, {
        structure,
        idFactory,
      })
    )
    onStructuralChange?.()
  }, [section.nodes, applyNodes, containerStructures, idFactory, onStructuralChange])

  const handleAddChildLeaf = useCallback(
    (parentNodeId: string | null, role: string) => {
      applyNodes(
        addLeaf(section.nodes, parentNodeId, {
          role,
          text: "",
          idFactory,
        })
      )
      onStructuralChange?.()
    },
    [section.nodes, applyNodes, idFactory, onStructuralChange]
  )

  const handleAddChildContainer = useCallback(
    (parentNodeId: string | null, structure: string) => {
      applyNodes(
        addContainer(section.nodes, parentNodeId, {
          structure,
          idFactory,
        })
      )
      onStructuralChange?.()
    },
    [section.nodes, applyNodes, idFactory, onStructuralChange]
  )

  const handleDrop = useCallback(
    (sourceNodeId: string, target: DropIntent) => {
      // Disallow dropping a node inside its own subtree.
      if (target.parentNodeId) {
        const ancestor = findNode(section.nodes, sourceNodeId)
        if (ancestor && containsNode(ancestor, target.parentNodeId)) {
          return
        }
      }
      const next = moveNode(section.nodes, sourceNodeId, {
        parentNodeId: target.parentNodeId,
        index: target.index,
      })
      if (next !== section.nodes) {
        applyNodes(next)
        onStructuralChange?.()
      }
    },
    [section.nodes, applyNodes, onStructuralChange]
  )

  const defaultTextRole = useMemo(
    () => (textRoles ? Object.keys(textRoles)[0] : null) ?? "text",
    [textRoles]
  )
  const defaultStructure = useMemo(
    () =>
      (containerStructures ? Object.keys(containerStructures)[0] : null) ??
      "group",
    [containerStructures]
  )

  const hasNodes = section.nodes.length > 0

  return (
    <div className="flex flex-col gap-1" data-testid="section-tree-editor">
      <RootDropZone
        index={0}
        drag={drag}
        onDrop={handleDrop}
        canHostContainer
      />
      {section.nodes.map((node, i) => (
        <div key={node.nodeId}>
          <TreeNode
            node={node}
            parentNodeId={null}
            indexInParent={i}
            depth={0}
            bookLabel={bookLabel}
            textRoles={textRoles}
            containerStructures={containerStructures}
            disabled={disabled}
            drag={drag}
            setDrag={setDrag}
            onEditText={handleEditText}
            onSetRole={handleSetRole}
            onSetStructure={handleSetStructure}
            onTogglePruned={handleTogglePruned}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onNest={handleNest}
            onUnnest={handleUnnest}
            onAddChildLeaf={handleAddChildLeaf}
            onAddChildContainer={handleAddChildContainer}
            onDrop={handleDrop}
            onSplitGroup={handleSplitGroup}
            onSplitSection={onSplitSection}
            splitDisabled={!!splitDisabledReason}
            onMergeGroup={handleMergeGroup}
            prevSiblingIsContainer={i > 0 && !section.nodes[i - 1].role}
            firstInSection={i === 0}
            defaultTextRole={defaultTextRole}
            defaultStructure={defaultStructure}
          />
          <RootDropZone
            index={i + 1}
            drag={drag}
            onDrop={handleDrop}
            canHostContainer
          />
          {onSplitBefore && i < section.nodes.length - 1 && (
            <SplitDivider
              onSplit={() => onSplitBefore(i + 1)}
              disabled={disabled || !!splitDisabledReason}
              disabledReason={splitDisabledReason}
            />
          )}
        </div>
      ))}

      {!hasNodes && (
        <div className="text-xs italic text-muted-foreground/70 px-3 py-4 text-center border border-dashed rounded">
          {t`Empty section — add a container below to start`}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <FooterMenuButton
          icon={Plus}
          label={t`Add`}
          disabled={disabled}
          items={[
            {
              icon: FolderPlus,
              label: t`Add group`,
              onClick: handleAddContainerAtRoot,
            },
            {
              icon: FilePlus,
              label: t`Add text`,
              onClick: () => handleAddChildLeaf(null, defaultTextRole),
            },
            {
              icon: ImageIcon,
              label: t`Add image`,
              onClick: () => handleAddChildLeaf(null, "image"),
            },
          ]}
        />
        {sectionMergeItems && (
          <FooterMenuButton
            icon={Merge}
            label={t`Merge`}
            disabled={disabled}
            items={[
              ...sectionMergeItems,
              {
                icon: FolderPlus,
                label: t`Merge adjacent groups`,
                onClick: handleMergeAdjacentGroups,
                disabled: adjacentGroupsMerged === section.nodes,
              },
            ]}
          />
        )}
      </div>
    </div>
  )
}

function FooterMenuButton({
  icon: Icon,
  label,
  items,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  items: FooterMenuItem[]
  disabled?: boolean
}) {
  return (
    <ActionMenu
      trigger={
        <>
          <Icon className="h-3.5 w-3.5" />
          {label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </>
      }
      triggerClassName={cn(
        "flex items-center gap-1.5 rounded border border-dashed px-3 py-1.5 text-xs transition-colors",
        disabled
          ? "border-muted-foreground/20 text-muted-foreground/50 cursor-default"
          : "border-muted-foreground/30 hover:border-muted-foreground/60 text-muted-foreground hover:text-foreground cursor-pointer"
      )}
      triggerDisabled={disabled}
      items={items}
      align="left"
      menuClassName="min-w-[200px]"
    />
  )
}

function SplitDivider({
  onSplit,
  disabled,
  disabledReason,
}: {
  onSplit: () => void
  disabled?: boolean
  disabledReason?: string
}) {
  const { t } = useLingui()
  return (
    <div className="flex items-center gap-2 py-0.5 opacity-30 hover:opacity-100 transition-opacity">
      <div className="flex-1 border-t border-dashed border-muted-foreground/40" />
      <button
        type="button"
        onClick={onSplit}
        disabled={disabled}
        title={disabledReason ?? t`Split into two sections at this point`}
        className={cn(
          "flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground transition-colors",
          disabled
            ? "cursor-default opacity-50"
            : "hover:border-primary hover:text-primary cursor-pointer"
        )}
      >
        <Scissors className="h-3 w-3" />
        {t`Split`}
      </button>
      <div className="flex-1 border-t border-dashed border-muted-foreground/40" />
    </div>
  )
}

function RootDropZone({
  index,
  drag,
  onDrop,
  canHostContainer,
}: {
  index: number
  drag: DragState | null
  onDrop: (sourceNodeId: string, target: DropIntent) => void
  canHostContainer: boolean
}) {
  const [over, setOver] = useState(false)
  if (!drag) return null
  return (
    <div
      className="relative h-2 flex items-center"
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
        onDrop(sourceId, { parentNodeId: null, index })
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

// Helpers and re-exports for TreeNode.
export const TREE_DRAG_TYPE = "application/x-section-tree-node"

function containsNode(root: ContentNodeData, targetNodeId: string): boolean {
  if (root.nodeId === targetNodeId) return true
  for (const child of root.children ?? []) {
    if (containsNode(child, targetNodeId)) return true
  }
  return false
}
