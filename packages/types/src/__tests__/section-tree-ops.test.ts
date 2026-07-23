import { describe, expect, it } from "vitest"
import type { ContentNodeData } from "../page-sectioning.js"
import {
  addContainer,
  addLeaf,
  cloneNodeWithNewIds,
  deleteNode,
  duplicateNode,
  editLeafText,
  findNode,
  findNodePath,
  mergeAdjacentContainers,
  mergeContainerWithPrevious,
  moveNode,
  nestNode,
  setContainerStructure,
  setLeafRole,
  splitContainerBefore,
  splitNodesBefore,
  toggleNodePruned,
  unnestNode,
} from "../section-tree-ops.js"

// Deterministic id factory for tests.
function makeIdFactory(prefix = "new"): () => string {
  let n = 0
  return () => `${prefix}_${++n}`
}

function leaf(nodeId: string, role = "text", text = ""): ContentNodeData {
  return { nodeId, isPruned: false, role, text }
}

function container(
  nodeId: string,
  structure: string,
  children: ContentNodeData[]
): ContentNodeData {
  return { nodeId, isPruned: false, structure, children }
}

function sample(): ContentNodeData[] {
  // root
  //   group_a
  //     h1 (heading)
  //     t1 (text)
  //   image_group_a
  //     img1 (image)
  //     cap1 (caption)
  //   t2 (top-level text)
  return [
    container("group_a", "group", [
      leaf("h1", "heading", "Title"),
      leaf("t1", "text", "First paragraph"),
    ]),
    container("image_group_a", "image_group", [
      { nodeId: "img1", isPruned: false, role: "image" },
      leaf("cap1", "caption", "Caption"),
    ]),
    leaf("t2", "text", "Loose"),
  ]
}

describe("findNode / findNodePath", () => {
  it("finds nested nodes and their ancestor path", () => {
    const tree = sample()
    expect(findNode(tree, "missing")).toBeNull()
    expect(findNode(tree, "t1")?.text).toBe("First paragraph")
    const path = findNodePath(tree, "cap1")
    expect(path?.map((n) => n.nodeId)).toEqual(["image_group_a", "cap1"])
  })
})

describe("editLeafText", () => {
  it("updates leaf text without touching siblings or structure", () => {
    const before = sample()
    const after = editLeafText(before, "t1", "New paragraph")
    expect(findNode(after, "t1")?.text).toBe("New paragraph")
    // untouched branch is reference-equal
    expect(after[1]).toBe(before[1])
  })

  it("ignores image leaves", () => {
    const before = sample()
    const after = editLeafText(before, "img1", "nope")
    expect(after).toBe(before)
  })
})

describe("setLeafRole / setContainerStructure", () => {
  it("changes role on a text leaf", () => {
    const after = setLeafRole(sample(), "t1", "heading")
    expect(findNode(after, "t1")?.role).toBe("heading")
  })

  it("rejects role change on image leaves", () => {
    const before = sample()
    const after = setLeafRole(before, "img1", "heading")
    expect(after).toBe(before)
  })

  it("changes structure on a container", () => {
    const after = setContainerStructure(sample(), "group_a", "activity")
    expect(findNode(after, "group_a")?.structure).toBe("activity")
  })

  it("does not treat a leaf as a container", () => {
    const before = sample()
    const after = setContainerStructure(before, "t1", "group")
    // mapNode still visits but the transform returns the node unchanged
    expect(findNode(after, "t1")?.structure).toBeUndefined()
  })
})

describe("toggleNodePruned", () => {
  it("flips isPruned on the targeted node only", () => {
    const before = sample()
    const after = toggleNodePruned(before, "t1")
    expect(findNode(after, "t1")?.isPruned).toBe(true)
    const back = toggleNodePruned(after, "t1")
    expect(findNode(back, "t1")?.isPruned).toBe(false)
  })
})

describe("deleteNode", () => {
  it("removes a leaf from a container", () => {
    const after = deleteNode(sample(), "t1")
    expect(findNode(after, "t1")).toBeNull()
    expect(findNode(after, "h1")).not.toBeNull()
  })

  it("removes a top-level node", () => {
    const after = deleteNode(sample(), "t2")
    expect(findNode(after, "t2")).toBeNull()
  })

  it("removes a container with its descendants", () => {
    const after = deleteNode(sample(), "image_group_a")
    expect(findNode(after, "image_group_a")).toBeNull()
    expect(findNode(after, "img1")).toBeNull()
    expect(findNode(after, "cap1")).toBeNull()
  })
})

describe("duplicateNode", () => {
  it("inserts a clone with fresh ids right after the original", () => {
    const after = duplicateNode(sample(), "t1", makeIdFactory("dup"))
    const groupChildren = findNode(after, "group_a")?.children ?? []
    expect(groupChildren.map((c) => c.nodeId)).toEqual(["h1", "t1", "dup_1"])
    expect(groupChildren[2].text).toBe("First paragraph")
  })

  it("deep-clones containers with fresh ids for every descendant", () => {
    const after = duplicateNode(sample(), "image_group_a", makeIdFactory("dup"))
    const topIds = after.map((n) => n.nodeId)
    expect(topIds).toEqual(["group_a", "image_group_a", "dup_1", "t2"])
    const clone = findNode(after, "dup_1")
    const cloneChildIds = clone?.children?.map((c) => c.nodeId)
    expect(cloneChildIds).toEqual(["dup_2", "dup_3"])
  })
})

describe("moveNode", () => {
  it("reorders within the same parent", () => {
    const after = moveNode(sample(), "h1", {
      parentNodeId: "group_a",
      index: 2,
    })
    const ids = findNode(after, "group_a")?.children?.map((c) => c.nodeId)
    expect(ids).toEqual(["t1", "h1"])
  })

  it("moves a leaf between containers", () => {
    const after = moveNode(sample(), "t1", {
      parentNodeId: "image_group_a",
      index: 0,
    })
    expect(findNode(after, "group_a")?.children?.map((c) => c.nodeId)).toEqual([
      "h1",
    ])
    expect(
      findNode(after, "image_group_a")?.children?.map((c) => c.nodeId)
    ).toEqual(["t1", "img1", "cap1"])
  })

  it("promotes a leaf to top-level", () => {
    const after = moveNode(sample(), "t1", { parentNodeId: null, index: 0 })
    expect(after.map((n) => n.nodeId)).toEqual([
      "t1",
      "group_a",
      "image_group_a",
      "t2",
    ])
  })
})

describe("addLeaf / addContainer", () => {
  it("adds a leaf to an existing container at the given index", () => {
    const after = addLeaf(sample(), "group_a", {
      role: "text",
      text: "Middle",
      index: 1,
      idFactory: makeIdFactory("leaf"),
    })
    const ids = findNode(after, "group_a")?.children?.map((c) => c.nodeId)
    expect(ids).toEqual(["h1", "leaf_1", "t1"])
  })

  it("adds a top-level container at end by default", () => {
    const after = addContainer(sample(), null, {
      structure: "group",
      idFactory: makeIdFactory("grp"),
    })
    expect(after[after.length - 1].nodeId).toBe("grp_1")
    expect(after[after.length - 1].structure).toBe("group")
  })
})

describe("nestNode", () => {
  it("wraps a node in a new container in the same slot", () => {
    const after = nestNode(sample(), "t2", "group", makeIdFactory("wrap"))
    const top = after[after.length - 1]
    expect(top.nodeId).toBe("wrap_1")
    expect(top.structure).toBe("group")
    expect(top.children?.map((c) => c.nodeId)).toEqual(["t2"])
  })

  it("wraps a leaf inside its existing container", () => {
    const after = nestNode(sample(), "h1", "paragraph", makeIdFactory("wrap"))
    const group = findNode(after, "group_a")
    expect(group?.children?.[0].nodeId).toBe("wrap_1")
    expect(group?.children?.[0].children?.[0].nodeId).toBe("h1")
  })
})

describe("unnestNode", () => {
  it("moves a leaf up to its grandparent and collapses the empty parent", () => {
    // grandparent is top-level; parent group_a has two children.
    const step1 = deleteNode(sample(), "t1") // leaves only h1 in group_a
    const after = unnestNode(step1, "h1")
    expect(findNode(after, "group_a")).toBeNull() // collapsed
    expect(after.map((n) => n.nodeId)).toEqual(["h1", "image_group_a", "t2"])
  })

  it("leaves the parent intact when it still has siblings", () => {
    const after = unnestNode(sample(), "h1")
    expect(findNode(after, "group_a")?.children?.map((c) => c.nodeId)).toEqual([
      "t1",
    ])
    // h1 now sits just after group_a at top level
    expect(after.map((n) => n.nodeId)).toEqual([
      "group_a",
      "h1",
      "image_group_a",
      "t2",
    ])
  })

  it("is a no-op for top-level nodes", () => {
    const before = sample()
    const after = unnestNode(before, "t2")
    expect(after).toBe(before)
  })
})

describe("cloneNodeWithNewIds", () => {
  it("recursively replaces every nodeId", () => {
    const original = sample()[1] // image_group_a
    const clone = cloneNodeWithNewIds(original, makeIdFactory("c"))
    expect(clone.nodeId).toBe("c_1")
    expect(clone.children?.map((c) => c.nodeId)).toEqual(["c_2", "c_3"])
    // Original untouched
    expect(original.nodeId).toBe("image_group_a")
  })
})

describe("splitContainerBefore", () => {
  it("splits the parent group into two siblings before the node", () => {
    const after = splitContainerBefore(sample(), "t1", makeIdFactory("s"))
    // group_a keeps children before t1; a new sibling of the same structure
    // takes t1 and everything after it.
    expect(after.map((n) => n.nodeId)).toEqual([
      "group_a",
      "s_1",
      "image_group_a",
      "t2",
    ])
    expect(findNode(after, "group_a")?.children?.map((c) => c.nodeId)).toEqual([
      "h1",
    ])
    const sibling = findNode(after, "s_1")
    expect(sibling?.structure).toBe("group")
    expect(sibling?.children?.map((c) => c.nodeId)).toEqual(["t1"])
  })

  it("splits nested containers within their grandparent", () => {
    const tree = [
      container("outer", "panel", [
        container("inner", "group", [leaf("a"), leaf("b"), leaf("c")]),
      ]),
    ]
    const after = splitContainerBefore(tree, "c", makeIdFactory("s"))
    const outer = findNode(after, "outer")
    expect(outer?.children?.map((c) => c.nodeId)).toEqual(["inner", "s_1"])
    expect(findNode(after, "inner")?.children?.map((c) => c.nodeId)).toEqual([
      "a",
      "b",
    ])
    expect(findNode(after, "s_1")?.children?.map((c) => c.nodeId)).toEqual(["c"])
  })

  it("preserves the parent's prune state on the new sibling", () => {
    const tree = [
      { ...container("g", "group", [leaf("a"), leaf("b")]), isPruned: true },
    ]
    const after = splitContainerBefore(tree, "b", makeIdFactory("s"))
    expect(findNode(after, "s_1")?.isPruned).toBe(true)
  })

  it("is a no-op for top-level nodes and first children", () => {
    const before = sample()
    expect(splitContainerBefore(before, "t2", makeIdFactory())).toBe(before)
    expect(splitContainerBefore(before, "h1", makeIdFactory())).toBe(before)
  })
})

describe("splitNodesBefore", () => {
  it("splits at a top-level node", () => {
    const result = splitNodesBefore(sample(), "t2", makeIdFactory("s"))
    expect(result?.before.map((n) => n.nodeId)).toEqual([
      "group_a",
      "image_group_a",
    ])
    expect(result?.after.map((n) => n.nodeId)).toEqual(["t2"])
  })

  it("splits ancestor containers along the path to a nested node", () => {
    const result = splitNodesBefore(sample(), "t1", makeIdFactory("s"))
    // Kept half: group_a with only h1.
    expect(result?.before.map((n) => n.nodeId)).toEqual(["group_a"])
    expect(result?.before[0].children?.map((c) => c.nodeId)).toEqual(["h1"])
    // Moved half: a fresh-id clone of group_a carrying t1, then the
    // following top-level nodes.
    expect(result?.after.map((n) => n.nodeId)).toEqual([
      "s_1",
      "image_group_a",
      "t2",
    ])
    expect(result?.after[0].structure).toBe("group")
    expect(result?.after[0].children?.map((c) => c.nodeId)).toEqual(["t1"])
  })

  it("drops ancestor shells left empty on the kept side", () => {
    const tree = [
      leaf("intro"),
      container("outer", "panel", [
        container("inner", "group", [leaf("a"), leaf("b")]),
      ]),
    ]
    // Splitting before "a" empties both inner and outer on the kept side.
    const result = splitNodesBefore(tree, "a", makeIdFactory("s"))
    expect(result?.before.map((n) => n.nodeId)).toEqual(["intro"])
    expect(result?.after.map((n) => n.nodeId)).toEqual(["s_2"])
    expect(result?.after[0].children?.map((c) => c.nodeId)).toEqual(["s_1"])
    expect(result?.after[0].children?.[0].children?.map((c) => c.nodeId)).toEqual([
      "a",
      "b",
    ])
  })

  it("returns null when the split would leave the kept half empty", () => {
    const tree = [container("g", "group", [leaf("a"), leaf("b")])]
    expect(splitNodesBefore(tree, "a", makeIdFactory())).toBeNull()
  })

  it("returns null for unknown nodes", () => {
    expect(splitNodesBefore(sample(), "nope", makeIdFactory())).toBeNull()
  })
})

describe("mergeContainerWithPrevious", () => {
  it("appends the container's children into the previous sibling container", () => {
    const after = mergeContainerWithPrevious(sample(), "image_group_a")
    expect(after.map((n) => n.nodeId)).toEqual(["group_a", "t2"])
    expect(findNode(after, "group_a")?.children?.map((c) => c.nodeId)).toEqual([
      "h1",
      "t1",
      "img1",
      "cap1",
    ])
    // The surviving container keeps its own structure.
    expect(findNode(after, "group_a")?.structure).toBe("group")
  })

  it("merges nested sibling containers in place", () => {
    const tree = [
      container("outer", "panel", [
        container("g1", "group", [leaf("a")]),
        container("g2", "group", [leaf("b")]),
        leaf("tail"),
      ]),
    ]
    const after = mergeContainerWithPrevious(tree, "g2")
    expect(findNode(after, "outer")?.children?.map((c) => c.nodeId)).toEqual([
      "g1",
      "tail",
    ])
    expect(findNode(after, "g1")?.children?.map((c) => c.nodeId)).toEqual([
      "a",
      "b",
    ])
  })

  it("is a no-op when the previous sibling is a leaf, or there is none", () => {
    const tree = [
      leaf("t"),
      container("g", "group", [leaf("a")]),
    ]
    expect(mergeContainerWithPrevious(tree, "g")).toBe(tree)
    expect(mergeContainerWithPrevious(tree, "t")).toBe(tree)
    const first = sample()
    expect(mergeContainerWithPrevious(first, "group_a")).toBe(first)
  })
})

describe("mergeAdjacentContainers", () => {
  it("collapses runs of same-structure siblings, keeping order", () => {
    const tree = [
      container("g1", "group", [leaf("a")]),
      container("g2", "group", [leaf("b")]),
      leaf("t"),
      container("g3", "group", [leaf("c")]),
    ]
    const after = mergeAdjacentContainers(tree)
    expect(after.map((n) => n.nodeId)).toEqual(["g1", "t", "g3"])
    expect(findNode(after, "g1")?.children?.map((c) => c.nodeId)).toEqual([
      "a",
      "b",
    ])
    expect(findNode(after, "g3")?.children?.map((c) => c.nodeId)).toEqual(["c"])
  })

  it("does not merge containers of different structures", () => {
    const before = sample() // group followed by image_group
    expect(mergeAdjacentContainers(before)).toBe(before)
  })

  it("recurses into nested containers", () => {
    const tree = [
      container("outer", "activity", [
        container("g1", "group", [leaf("a")]),
        container("g2", "group", [leaf("b")]),
        container("g3", "group", [leaf("c")]),
      ]),
    ]
    const after = mergeAdjacentContainers(tree)
    expect(findNode(after, "outer")?.children?.map((c) => c.nodeId)).toEqual([
      "g1",
    ])
    expect(findNode(after, "g1")?.children?.map((c) => c.nodeId)).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("does not merge across differing prune states", () => {
    const tree = [
      container("g1", "group", [leaf("a")]),
      { ...container("g2", "group", [leaf("b")]), isPruned: true },
    ]
    expect(mergeAdjacentContainers(tree)).toBe(tree)
  })
})
