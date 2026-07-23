import type { ContentNodeData } from "./page-sectioning.js"

// Immutable operations on ContentNodeData[] trees used by the section editor.
// Every op returns a new tree; unrelated branches are shared by reference.

export type IdFactory = () => string

export interface NodeLocation {
  parent: ContentNodeData | null
  parentChildren: ContentNodeData[]
  index: number
}

export function findNodePath(
  nodes: ContentNodeData[],
  nodeId: string
): ContentNodeData[] | null {
  for (const node of nodes) {
    if (node.nodeId === nodeId) return [node]
    const children = node.children
    if (children) {
      const rest = findNodePath(children, nodeId)
      if (rest) return [node, ...rest]
    }
  }
  return null
}

export function findNode(
  nodes: ContentNodeData[],
  nodeId: string
): ContentNodeData | null {
  const path = findNodePath(nodes, nodeId)
  return path ? path[path.length - 1] : null
}

function locate(
  nodes: ContentNodeData[],
  nodeId: string,
  parent: ContentNodeData | null = null
): NodeLocation | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].nodeId === nodeId) {
      return { parent, parentChildren: nodes, index: i }
    }
    const children = nodes[i].children
    if (children) {
      const hit = locate(children, nodeId, nodes[i])
      if (hit) return hit
    }
  }
  return null
}

// Apply a transform to a node matched by id, walking the tree immutably.
// Unmodified branches keep reference identity so React can short-circuit.
function mapNode(
  nodes: ContentNodeData[],
  nodeId: string,
  transform: (node: ContentNodeData) => ContentNodeData
): ContentNodeData[] {
  let changed = false
  const next = nodes.map((node) => {
    if (node.nodeId === nodeId) {
      const transformed = transform(node)
      if (transformed !== node) changed = true
      return transformed
    }
    if (node.children) {
      const nextChildren = mapNode(node.children, nodeId, transform)
      if (nextChildren !== node.children) {
        changed = true
        return { ...node, children: nextChildren }
      }
    }
    return node
  })
  return changed ? next : nodes
}

// Remove a node from wherever it lives; returns the new tree and the removed node.
function removeNodeById(
  nodes: ContentNodeData[],
  nodeId: string
): { tree: ContentNodeData[]; removed: ContentNodeData | null } {
  let removed: ContentNodeData | null = null
  const walk = (list: ContentNodeData[]): ContentNodeData[] => {
    const filtered: ContentNodeData[] = []
    for (const node of list) {
      if (node.nodeId === nodeId) {
        removed = node
        continue
      }
      if (node.children) {
        const nextChildren = walk(node.children)
        if (nextChildren !== node.children) {
          filtered.push({ ...node, children: nextChildren })
          continue
        }
      }
      filtered.push(node)
    }
    return removed ? filtered : list
  }
  const tree = walk(nodes)
  return { tree, removed }
}

// Insert a node into a container's children at `index` (or at top-level when
// parentNodeId is null).
function insertNode(
  nodes: ContentNodeData[],
  parentNodeId: string | null,
  index: number,
  insert: ContentNodeData
): ContentNodeData[] {
  if (parentNodeId == null) {
    const clamped = Math.max(0, Math.min(index, nodes.length))
    const next = [...nodes]
    next.splice(clamped, 0, insert)
    return next
  }
  return mapNode(nodes, parentNodeId, (node) => {
    const children = node.children ?? []
    const clamped = Math.max(0, Math.min(index, children.length))
    const next = [...children]
    next.splice(clamped, 0, insert)
    return { ...node, children: next }
  })
}

// ── Operations ──────────────────────────────────────────────────

export function editLeafText(
  nodes: ContentNodeData[],
  nodeId: string,
  text: string
): ContentNodeData[] {
  return mapNode(nodes, nodeId, (node) => {
    if (!node.role || node.role === "image") return node
    return { ...node, text }
  })
}

export function setLeafRole(
  nodes: ContentNodeData[],
  nodeId: string,
  role: string
): ContentNodeData[] {
  return mapNode(nodes, nodeId, (node) => {
    if (!node.role || node.role === "image") return node
    return { ...node, role }
  })
}

export function setContainerStructure(
  nodes: ContentNodeData[],
  nodeId: string,
  structure: string
): ContentNodeData[] {
  return mapNode(nodes, nodeId, (node) => {
    if (node.role) return node
    return { ...node, structure }
  })
}

export function toggleNodePruned(
  nodes: ContentNodeData[],
  nodeId: string
): ContentNodeData[] {
  return mapNode(nodes, nodeId, (node) => ({
    ...node,
    isPruned: !node.isPruned,
  }))
}

export function deleteNode(
  nodes: ContentNodeData[],
  nodeId: string
): ContentNodeData[] {
  return removeNodeById(nodes, nodeId).tree
}

export function duplicateNode(
  nodes: ContentNodeData[],
  nodeId: string,
  idFactory: IdFactory
): ContentNodeData[] {
  const loc = locate(nodes, nodeId)
  if (!loc) return nodes
  const original = loc.parentChildren[loc.index]
  const clone = cloneNodeWithNewIds(original, idFactory)
  return insertNode(
    nodes,
    loc.parent?.nodeId ?? null,
    loc.index + 1,
    clone
  )
}

export function moveNode(
  nodes: ContentNodeData[],
  nodeId: string,
  target: { parentNodeId: string | null; index: number }
): ContentNodeData[] {
  const loc = locate(nodes, nodeId)
  if (!loc) return nodes

  const samePar = (loc.parent?.nodeId ?? null) === target.parentNodeId
  const { tree: without, removed } = removeNodeById(nodes, nodeId)
  if (!removed) return nodes

  // When moving within the same parent and the target index is after the
  // original slot, shift the target to account for the removed item.
  let insertIndex = target.index
  if (samePar && target.index > loc.index) insertIndex -= 1
  return insertNode(without, target.parentNodeId, insertIndex, removed)
}

export function addLeaf(
  nodes: ContentNodeData[],
  parentNodeId: string | null,
  opts: { role: string; text?: string; index?: number; idFactory: IdFactory }
): ContentNodeData[] {
  const leaf: ContentNodeData = {
    nodeId: opts.idFactory(),
    isPruned: false,
    role: opts.role,
    text: opts.text ?? "",
  }
  const index =
    opts.index ??
    (parentNodeId == null
      ? nodes.length
      : (findNode(nodes, parentNodeId)?.children?.length ?? 0))
  return insertNode(nodes, parentNodeId, index, leaf)
}

// Add an image leaf. Image leaves use their imageId as their nodeId (the
// renderer emits `data-id="${nodeId}"` which downstream editors use as the
// image id) so `imageId` is the authoritative identifier for both roles.
export function addImageLeaf(
  nodes: ContentNodeData[],
  parentNodeId: string | null,
  opts: { imageId: string; index?: number }
): ContentNodeData[] {
  const leaf: ContentNodeData = {
    nodeId: opts.imageId,
    isPruned: false,
    role: "image",
  }
  const index =
    opts.index ??
    (parentNodeId == null
      ? nodes.length
      : (findNode(nodes, parentNodeId)?.children?.length ?? 0))
  return insertNode(nodes, parentNodeId, index, leaf)
}

export function addContainer(
  nodes: ContentNodeData[],
  parentNodeId: string | null,
  opts: {
    structure: string
    children?: ContentNodeData[]
    index?: number
    idFactory: IdFactory
  }
): ContentNodeData[] {
  const container: ContentNodeData = {
    nodeId: opts.idFactory(),
    isPruned: false,
    structure: opts.structure,
    children: opts.children ?? [],
  }
  const index =
    opts.index ??
    (parentNodeId == null
      ? nodes.length
      : (findNode(nodes, parentNodeId)?.children?.length ?? 0))
  return insertNode(nodes, parentNodeId, index, container)
}

// Wrap `nodeId` in a new container of the given structure, in place.
export function nestNode(
  nodes: ContentNodeData[],
  nodeId: string,
  structure: string,
  idFactory: IdFactory
): ContentNodeData[] {
  const loc = locate(nodes, nodeId)
  if (!loc) return nodes
  const child = loc.parentChildren[loc.index]
  const wrapper: ContentNodeData = {
    nodeId: idFactory(),
    isPruned: false,
    structure,
    children: [child],
  }
  // Replace the child with the wrapper at the same slot.
  if (loc.parent == null) {
    const next = [...nodes]
    next[loc.index] = wrapper
    return next
  }
  return mapNode(nodes, loc.parent.nodeId, (parent) => {
    const children = parent.children ?? []
    const next = [...children]
    next[loc.index] = wrapper
    return { ...parent, children: next }
  })
}

// Move `nodeId` out of its parent into the grandparent, just after the parent.
// If the parent becomes empty, it is removed.
export function unnestNode(
  nodes: ContentNodeData[],
  nodeId: string
): ContentNodeData[] {
  const loc = locate(nodes, nodeId)
  if (!loc || loc.parent == null) return nodes
  const parentLoc = locate(nodes, loc.parent.nodeId)
  if (!parentLoc) return nodes

  const grandparentId = parentLoc.parent?.nodeId ?? null
  const child = loc.parentChildren[loc.index]

  // Remove the child from its parent.
  const removed = mapNode(nodes, loc.parent.nodeId, (parent) => {
    const children = (parent.children ?? []).filter((_, i) => i !== loc.index)
    return { ...parent, children }
  })

  // Insert child into the grandparent immediately after the parent.
  const inserted = insertNode(removed, grandparentId, parentLoc.index + 1, child)

  // Collapse the parent if it's now empty.
  const parentAfter = findNode(inserted, loc.parent.nodeId)
  if (parentAfter && (parentAfter.children ?? []).length === 0) {
    return removeNodeById(inserted, loc.parent.nodeId).tree
  }
  return inserted
}

// Split the parent container of `nodeId` into two sibling containers of the
// same structure: the parent keeps the children before `nodeId`; a new
// container (fresh id, same structure/prune state) takes `nodeId` and its
// following siblings. No-op when the node is at top level or is its parent's
// first child (nothing to leave behind).
export function splitContainerBefore(
  nodes: ContentNodeData[],
  nodeId: string,
  idFactory: IdFactory
): ContentNodeData[] {
  const loc = locate(nodes, nodeId)
  if (!loc || loc.parent == null || loc.index === 0) return nodes
  const parentLoc = locate(nodes, loc.parent.nodeId)
  if (!parentLoc) return nodes

  const sibling: ContentNodeData = {
    ...loc.parent,
    nodeId: idFactory(),
    children: loc.parentChildren.slice(loc.index),
  }
  const trimmed = mapNode(nodes, loc.parent.nodeId, (parent) => ({
    ...parent,
    children: (parent.children ?? []).slice(0, loc.index),
  }))
  return insertNode(
    trimmed,
    parentLoc.parent?.nodeId ?? null,
    parentLoc.index + 1,
    sibling
  )
}

// Merge a container into its previous sibling container: its children are
// appended to the previous sibling and the container itself is removed.
// No-op unless the node and its previous sibling are both containers.
export function mergeContainerWithPrevious(
  nodes: ContentNodeData[],
  nodeId: string
): ContentNodeData[] {
  const loc = locate(nodes, nodeId)
  if (!loc || loc.index === 0) return nodes
  const node = loc.parentChildren[loc.index]
  const prev = loc.parentChildren[loc.index - 1]
  if (node.role || prev.role) return nodes
  const merged: ContentNodeData = {
    ...prev,
    children: [...(prev.children ?? []), ...(node.children ?? [])],
  }
  const replaceIn = (list: ContentNodeData[]): ContentNodeData[] => {
    const next = [...list]
    next.splice(loc.index - 1, 2, merged)
    return next
  }
  if (loc.parent == null) return replaceIn(nodes)
  return mapNode(nodes, loc.parent.nodeId, (parent) => ({
    ...parent,
    children: replaceIn(parent.children ?? []),
  }))
}

// Collapse every run of adjacent sibling containers sharing a structure and
// prune state into the first container of the run, recursively. Reading
// order is preserved; leaves and differing containers act as run breaks.
export function mergeAdjacentContainers(
  nodes: ContentNodeData[]
): ContentNodeData[] {
  const walk = (list: ContentNodeData[]): ContentNodeData[] => {
    let changed = false
    const out: ContentNodeData[] = []
    for (let node of list) {
      if (node.children) {
        const nextChildren = walk(node.children)
        if (nextChildren !== node.children) {
          node = { ...node, children: nextChildren }
          changed = true
        }
      }
      const prev = out[out.length - 1]
      if (
        prev &&
        !prev.role &&
        !node.role &&
        prev.structure === node.structure &&
        prev.isPruned === node.isPruned
      ) {
        out[out.length - 1] = {
          ...prev,
          children: [...(prev.children ?? []), ...(node.children ?? [])],
        }
        changed = true
        continue
      }
      out.push(node)
    }
    return changed ? out : list
  }
  return walk(nodes)
}

// Split a section's node tree in two immediately before `nodeId`, splitting
// every ancestor container along the path. Ancestor shells on the moved side
// get fresh ids (the target node and everything below it keep theirs);
// ancestor shells left empty on the kept side are dropped. Returns null when
// the node isn't found or when the kept half would be empty (the node is the
// first node of the tree at every level).
export function splitNodesBefore(
  nodes: ContentNodeData[],
  nodeId: string,
  idFactory: IdFactory
): { before: ContentNodeData[]; after: ContentNodeData[] } | null {
  const path = findNodePath(nodes, nodeId)
  if (!path) return null

  const split = (
    list: ContentNodeData[],
    depth: number
  ): { before: ContentNodeData[]; after: ContentNodeData[] } => {
    const target = path[depth]
    const index = list.indexOf(target)
    const before = list.slice(0, index)
    const after = list.slice(index + 1)
    if (depth === path.length - 1) {
      return { before, after: [target, ...after] }
    }
    const inner = split(target.children ?? [], depth + 1)
    if (inner.before.length > 0) {
      before.push({ ...target, children: inner.before })
    }
    return {
      before,
      after: [{ ...target, nodeId: idFactory(), children: inner.after }, ...after],
    }
  }

  const result = split(nodes, 0)
  if (result.before.length === 0 || result.after.length === 0) return null
  return result
}

// Change a single node's nodeId. Used to swap an image leaf's id when a new
// file replaces the old one (crop, replace, AI generate), since an image
// leaf's nodeId IS its imageId.
export function replaceNodeId(
  nodes: ContentNodeData[],
  oldNodeId: string,
  newNodeId: string
): ContentNodeData[] {
  if (oldNodeId === newNodeId) return nodes
  return mapNode(nodes, oldNodeId, (node) => ({ ...node, nodeId: newNodeId }))
}

// ── Helpers ─────────────────────────────────────────────────────

export function cloneNodeWithNewIds(
  node: ContentNodeData,
  idFactory: IdFactory
): ContentNodeData {
  const base: ContentNodeData = { ...node, nodeId: idFactory() }
  if (node.children) {
    base.children = node.children.map((c) => cloneNodeWithNewIds(c, idFactory))
  }
  return base
}

// Walk the tree and return nodeIds of all pruned leaves (text + image),
// including leaves under a pruned container (inherited prune).
export function collectPrunedLeafIds(nodes: ContentNodeData[]): string[] {
  const ids: string[] = []
  const walk = (list: ContentNodeData[], inherited: boolean) => {
    for (const node of list) {
      const effectivePruned = inherited || node.isPruned
      if (node.role) {
        if (effectivePruned) ids.push(node.nodeId)
      } else if (node.children) {
        walk(node.children, effectivePruned)
      }
    }
  }
  walk(nodes, false)
  return ids
}

// Collect all leaf nodeIds (text + image) reachable from `root` — used when
// deleting a container so the preview HTML can strip every data-id below it.
export function collectLeafIdsInSubtree(root: ContentNodeData): string[] {
  const ids: string[] = []
  const walk = (node: ContentNodeData) => {
    if (node.role) {
      ids.push(node.nodeId)
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return ids
}

// Flat list of every leaf in the tree, in document order. Used by preview
// back-propagation to rebuild text content from edited HTML.
export function collectLeafNodes(
  nodes: ContentNodeData[]
): ContentNodeData[] {
  const out: ContentNodeData[] = []
  const walk = (list: ContentNodeData[]) => {
    for (const node of list) {
      if (node.role) out.push(node)
      else if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return out
}
