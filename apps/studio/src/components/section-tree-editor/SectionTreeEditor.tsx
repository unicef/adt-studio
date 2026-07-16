import { useCallback, useMemo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { Plus } from "lucide-react"
import type { ContentNodeData, PageSectioningSection } from "@adt/types"
import {
  addContainer,
  addLeaf,
  deleteNode,
  duplicateNode,
  editLeafText,
  moveNode,
  nestNode,
  setContainerStructure,
  setLeafRole,
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
  /** Called after a blank text leaf is added. Parent injects it into preview HTML. */
  onLeafAdded?: (nodeId: string, parentNodeId: string | null) => void
  /** Called after a blank container is added. Parent injects it into preview HTML. */
  onContainerAdded?: (nodeId: string, parentNodeId: string | null) => void
  /** Called when a node is selected for styling. Parent opens the style pane. */
  onSelectNode?: (nodeId: string, tagName?: string) => void
  /** Called whenever a change happens that needs a re-render (structural change). */
  onStructuralChange?: () => void
}

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
  onLeafAdded,
  onContainerAdded,
  onSelectNode,
  onStructuralChange,
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

  // Wrap idFactory so we can capture the id it mints — addLeaf/addContainer
  // don't return the new node's id. Mirrors the trick used in handleDuplicate.
  const captureNewId = useCallback(
    (mint: (idFactory: IdFactory) => void): string | null => {
      let newId: string | null = null
      const wrappedFactory: IdFactory = () => {
        const id = idFactory()
        if (newId == null) newId = id
        return id
      }
      mint(wrappedFactory)
      return newId
    },
    [idFactory]
  )

  const handleAddContainerAtRoot = useCallback(() => {
    const structure =
      (containerStructures && Object.keys(containerStructures)[0]) ?? "group"
    const newId = captureNewId((factory) =>
      applyNodes(addContainer(section.nodes, null, { structure, idFactory: factory }))
    )
    if (newId) onContainerAdded?.(newId, null)
    else onStructuralChange?.()
  }, [section.nodes, applyNodes, containerStructures, captureNewId, onContainerAdded, onStructuralChange])

  const handleAddChildLeaf = useCallback(
    (parentNodeId: string | null, role: string) => {
      const newId = captureNewId((factory) =>
        applyNodes(addLeaf(section.nodes, parentNodeId, { role, text: "", idFactory: factory }))
      )
      if (newId) onLeafAdded?.(newId, parentNodeId)
      else onStructuralChange?.()
    },
    [section.nodes, applyNodes, captureNewId, onLeafAdded, onStructuralChange]
  )

  const handleAddChildContainer = useCallback(
    (parentNodeId: string | null, structure: string) => {
      const newId = captureNewId((factory) =>
        applyNodes(addContainer(section.nodes, parentNodeId, { structure, idFactory: factory }))
      )
      if (newId) onContainerAdded?.(newId, parentNodeId)
      else onStructuralChange?.()
    },
    [section.nodes, applyNodes, captureNewId, onContainerAdded, onStructuralChange]
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
            onSelectNode={onSelectNode}
            defaultTextRole={defaultTextRole}
            defaultStructure={defaultStructure}
          />
          <RootDropZone
            index={i + 1}
            drag={drag}
            onDrop={handleDrop}
            canHostContainer
          />
        </div>
      ))}

      {!hasNodes && (
        <div className="text-xs italic text-muted-foreground/70 px-3 py-4 text-center border border-dashed rounded">
          {t`Empty section — add a container below to start`}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleAddContainerAtRoot}
          disabled={disabled}
          className={cn(
            "flex items-center gap-1.5 rounded border border-dashed px-3 py-1.5 text-xs transition-colors",
            disabled
              ? "border-muted-foreground/20 text-muted-foreground/50 cursor-default"
              : "border-muted-foreground/30 hover:border-muted-foreground/60 text-muted-foreground hover:text-foreground cursor-pointer"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          {t`Add group`}
        </button>
      </div>
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
