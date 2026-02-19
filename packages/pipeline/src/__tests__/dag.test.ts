import { describe, it, expect } from "vitest"
import { runDAG, runPipelineDAG, type DAGNode, type NodeStatus, type StepExecutor } from "../dag.js"
import type { Progress } from "../progress.js"
import { StepName, type ProgressEvent } from "@adt/types"
import { PIPELINE, STAGE_BY_NAME } from "@adt/types"

// ── Helpers ─────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Track the order in which nodes start and finish. */
function orderTracker() {
  const events: string[] = []
  return {
    events,
    execute: (id: string, ms = 5) => async () => {
      events.push(`${id}:start`)
      await delay(ms)
      events.push(`${id}:end`)
    },
  }
}

function collectingProgress(): { events: ProgressEvent[]; progress: Progress } {
  const events: ProgressEvent[] = []
  return {
    events,
    progress: { emit: (e: ProgressEvent) => events.push(e) },
  }
}

// ── runDAG tests ────────────────────────────────────────────────

describe("runDAG", () => {
  it("handles empty graph", async () => {
    const result = await runDAG([], async () => {})
    expect(result.statuses.size).toBe(0)
    expect(result.errors.size).toBe(0)
  })

  it("runs a single node", async () => {
    let ran = false
    const result = await runDAG(
      [{ id: "a", dependsOn: [] }],
      async () => { ran = true },
    )
    expect(ran).toBe(true)
    expect(result.statuses.get("a")).toBe("complete")
  })

  it("runs a linear chain in order", async () => {
    const t = orderTracker()
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: ["a"] },
      { id: "c", dependsOn: ["b"] },
    ]
    const result = await runDAG(nodes, (id) => t.execute(id)())
    expect(result.statuses.get("a")).toBe("complete")
    expect(result.statuses.get("b")).toBe("complete")
    expect(result.statuses.get("c")).toBe("complete")

    // b must start after a ends, c must start after b ends
    expect(t.events.indexOf("b:start")).toBeGreaterThan(t.events.indexOf("a:end"))
    expect(t.events.indexOf("c:start")).toBeGreaterThan(t.events.indexOf("b:end"))
  })

  it("runs independent nodes in parallel", async () => {
    const t = orderTracker()
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: [] },
      { id: "c", dependsOn: [] },
    ]
    const result = await runDAG(nodes, (id) => t.execute(id, 20)())

    for (const id of ["a", "b", "c"]) {
      expect(result.statuses.get(id)).toBe("complete")
    }

    // All three should start before any finishes
    const starts = ["a", "b", "c"].map((id) => t.events.indexOf(`${id}:start`))
    const firstEnd = Math.min(
      ...["a", "b", "c"].map((id) => t.events.indexOf(`${id}:end`))
    )
    for (const s of starts) {
      expect(s).toBeLessThan(firstEnd)
    }
  })

  it("handles diamond dependency", async () => {
    //   a
    //  / \
    // b   c
    //  \ /
    //   d
    const t = orderTracker()
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: ["a"] },
      { id: "c", dependsOn: ["a"] },
      { id: "d", dependsOn: ["b", "c"] },
    ]
    const result = await runDAG(nodes, (id) => t.execute(id)())

    for (const id of ["a", "b", "c", "d"]) {
      expect(result.statuses.get(id)).toBe("complete")
    }

    // b and c start after a, d starts after both b and c
    expect(t.events.indexOf("b:start")).toBeGreaterThan(t.events.indexOf("a:end"))
    expect(t.events.indexOf("c:start")).toBeGreaterThan(t.events.indexOf("a:end"))
    expect(t.events.indexOf("d:start")).toBeGreaterThan(t.events.indexOf("b:end"))
    expect(t.events.indexOf("d:start")).toBeGreaterThan(t.events.indexOf("c:end"))
  })

  it("skips dependents when a node fails", async () => {
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: ["a"] },
      { id: "c", dependsOn: ["b"] },
    ]
    const skipped: string[] = []
    const result = await runDAG(
      nodes,
      async (id) => {
        if (id === "a") throw new Error("boom")
      },
      (id) => skipped.push(id),
    )

    expect(result.statuses.get("a")).toBe("failed")
    expect(result.statuses.get("b")).toBe("skipped")
    expect(result.statuses.get("c")).toBe("skipped")
    expect(result.errors.get("a")?.message).toBe("boom")
    expect(skipped).toEqual(["b", "c"])
  })

  it("only skips direct and transitive dependents, not siblings", async () => {
    //   a     b
    //   |     |
    //   c     d
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: [] },
      { id: "c", dependsOn: ["a"] },
      { id: "d", dependsOn: ["b"] },
    ]
    const result = await runDAG(
      nodes,
      async (id) => {
        if (id === "a") throw new Error("boom")
      },
    )

    expect(result.statuses.get("a")).toBe("failed")
    expect(result.statuses.get("c")).toBe("skipped")
    expect(result.statuses.get("b")).toBe("complete")
    expect(result.statuses.get("d")).toBe("complete")
  })

  it("handles multiple independent failures", async () => {
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: [] },
      { id: "c", dependsOn: ["a"] },
      { id: "d", dependsOn: ["b"] },
    ]
    const result = await runDAG(
      nodes,
      async (id) => {
        if (id === "a") throw new Error("a-fail")
        if (id === "b") throw new Error("b-fail")
      },
    )

    expect(result.statuses.get("a")).toBe("failed")
    expect(result.statuses.get("b")).toBe("failed")
    expect(result.statuses.get("c")).toBe("skipped")
    expect(result.statuses.get("d")).toBe("skipped")
    expect(result.errors.size).toBe(2)
  })

  it("skips transitive dependents in diamond when one branch fails", async () => {
    //   a
    //  / \
    // b   c (fails)
    //  \ /
    //   d
    const t = orderTracker()
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: [] },
      { id: "b", dependsOn: ["a"] },
      { id: "c", dependsOn: ["a"] },
      { id: "d", dependsOn: ["b", "c"] },
    ]
    const result = await runDAG(
      nodes,
      async (id) => {
        if (id === "c") throw new Error("c-fail")
        await t.execute(id)()
      },
    )

    expect(result.statuses.get("a")).toBe("complete")
    expect(result.statuses.get("b")).toBe("complete")
    expect(result.statuses.get("c")).toBe("failed")
    expect(result.statuses.get("d")).toBe("skipped")
  })

  it("converts non-Error throws to Error objects", async () => {
    const nodes: DAGNode<string>[] = [{ id: "a", dependsOn: [] }]
    const result = await runDAG(
      nodes,
      async () => { throw "string error" },
    )
    expect(result.errors.get("a")).toBeInstanceOf(Error)
    expect(result.errors.get("a")?.message).toBe("string error")
  })

  it("handles wide fan-out", async () => {
    // root → [a, b, c, d, e] → collector
    const children = ["a", "b", "c", "d", "e"]
    const nodes: DAGNode<string>[] = [
      { id: "root", dependsOn: [] },
      ...children.map((id) => ({ id, dependsOn: ["root"] })),
      { id: "collector", dependsOn: children },
    ]
    const t = orderTracker()
    const result = await runDAG(nodes, (id) => t.execute(id, 10)())

    for (const node of nodes) {
      expect(result.statuses.get(node.id)).toBe("complete")
    }

    // All children should start before collector
    for (const child of children) {
      expect(t.events.indexOf(`${child}:end`)).toBeLessThan(
        t.events.indexOf("collector:start")
      )
    }
  })
})

// ── runPipelineDAG tests ────────────────────────────────────────

describe("runPipelineDAG", () => {
  it("completes all steps with no-op executors", async () => {
    const { events, progress } = collectingProgress()
    const result = await runPipelineDAG(new Map(), progress)

    // All stages should complete
    for (const stage of PIPELINE) {
      expect(result.stages.statuses.get(stage.name)).toBe("complete")
    }

    // All steps should complete
    for (const stage of PIPELINE) {
      for (const step of stage.steps) {
        expect(result.steps.statuses.get(step.name)).toBe("complete")
      }
    }

    // Every step should have a start and complete event
    for (const stage of PIPELINE) {
      for (const step of stage.steps) {
        const starts = events.filter(
          (e) => e.type === "step-start" && e.step === step.name
        )
        const completes = events.filter(
          (e) => e.type === "step-complete" && e.step === step.name
        )
        expect(starts).toHaveLength(1)
        expect(completes).toHaveLength(1)
      }
    }
  })

  it("runs executors that are provided", async () => {
    const ran: StepName[] = []
    const executors = new Map<StepName, StepExecutor>([
      ["extract", async () => { ran.push("extract") }],
      ["metadata", async () => { ran.push("metadata") }],
    ])
    const { progress } = collectingProgress()
    await runPipelineDAG(executors, progress)
    expect(ran).toContain("extract")
    expect(ran).toContain("metadata")
  })

  it("emits step-error and skips dependents on failure", async () => {
    const executors = new Map<StepName, StepExecutor>([
      ["extract", async () => { throw new Error("extract failed") }],
    ])
    const { events, progress } = collectingProgress()
    const result = await runPipelineDAG(executors, progress)

    // Extract step failed
    expect(result.steps.statuses.get("extract")).toBe("failed")
    const errorEvents = events.filter(
      (e) => e.type === "step-error" && e.step === "extract"
    )
    expect(errorEvents).toHaveLength(1)
    expect((errorEvents[0] as { error: string }).error).toBe("extract failed")

    // Dependent steps within extract stage should be skipped
    expect(result.steps.statuses.get("metadata")).toBe("skipped")
    expect(result.steps.statuses.get("translation")).toBe("skipped")

    // Extract stage failed → storyboard stage skipped → all downstream skipped
    expect(result.stages.statuses.get("extract")).toBe("failed")
    expect(result.stages.statuses.get("storyboard")).toBe("skipped")
    expect(result.stages.statuses.get("package")).toBe("skipped")

    // All steps in skipped stages should be skipped
    for (const step of STAGE_BY_NAME["storyboard"].steps) {
      expect(result.steps.statuses.get(step.name)).toBe("skipped")
    }
  })

  it("continues parallel stages when one branch fails", async () => {
    // Make quiz-generation fail — captions and glossary should still complete
    const completed: StepName[] = []
    const executors = new Map<StepName, StepExecutor>([
      ["quiz-generation", async () => { throw new Error("quiz fail") }],
      ["image-captioning", async () => { completed.push("image-captioning") }],
      ["glossary", async () => { completed.push("glossary") }],
    ])
    const { progress } = collectingProgress()
    const result = await runPipelineDAG(executors, progress)

    expect(result.stages.statuses.get("quizzes")).toBe("failed")
    expect(result.stages.statuses.get("captions")).toBe("complete")
    expect(result.stages.statuses.get("glossary")).toBe("complete")
    expect(completed).toContain("image-captioning")
    expect(completed).toContain("glossary")

    // text-and-speech depends on all three → skipped because quizzes failed
    expect(result.stages.statuses.get("text-and-speech")).toBe("skipped")
    expect(result.stages.statuses.get("package")).toBe("skipped")
  })

  it("respects step-level dependencies within a stage", async () => {
    const t = orderTracker()
    const executors = new Map<StepName, StepExecutor>([
      ["text-catalog", t.execute("text-catalog", 15)],
      ["catalog-translation", t.execute("catalog-translation", 5)],
      ["tts", t.execute("tts", 5)],
    ])
    const { progress } = collectingProgress()
    await runPipelineDAG(executors, progress)

    // catalog-translation depends on text-catalog
    expect(t.events.indexOf("catalog-translation:start")).toBeGreaterThan(
      t.events.indexOf("text-catalog:end")
    )
    // tts depends on catalog-translation
    expect(t.events.indexOf("tts:start")).toBeGreaterThan(
      t.events.indexOf("catalog-translation:end")
    )
  })

  it("runs independent steps within a stage in parallel", async () => {
    const t = orderTracker()
    const executors = new Map<StepName, StepExecutor>([
      ["extract", t.execute("extract", 5)],
      // metadata and text-classification both depend only on extract
      ["metadata", t.execute("metadata", 20)],
      ["text-classification", t.execute("text-classification", 20)],
      ["image-filtering", t.execute("image-filtering", 20)],
    ])
    const { progress } = collectingProgress()
    await runPipelineDAG(executors, progress)

    // All three should start before any of them finishes
    const parallelSteps = ["metadata", "text-classification", "image-filtering"]
    const starts = parallelSteps.map((id) => t.events.indexOf(`${id}:start`))
    const firstEnd = Math.min(
      ...parallelSteps.map((id) => t.events.indexOf(`${id}:end`))
    )
    for (const s of starts) {
      expect(s).toBeLessThan(firstEnd)
    }
  })

  it("runs quizzes/captions/glossary stages in parallel", async () => {
    const t = orderTracker()
    const executors = new Map<StepName, StepExecutor>([
      ["quiz-generation", t.execute("quiz-generation", 20)],
      ["image-captioning", t.execute("image-captioning", 20)],
      ["glossary", t.execute("glossary", 20)],
    ])
    const { progress } = collectingProgress()
    await runPipelineDAG(executors, progress)

    // All three should start before any finishes
    const parallelSteps = ["quiz-generation", "image-captioning", "glossary"]
    const starts = parallelSteps.map((id) => t.events.indexOf(`${id}:start`))
    const firstEnd = Math.min(
      ...parallelSteps.map((id) => t.events.indexOf(`${id}:end`))
    )
    for (const s of starts) {
      expect(s).toBeLessThan(firstEnd)
    }
  })

  it("step-start comes before step-complete in event order", async () => {
    const { events, progress } = collectingProgress()
    await runPipelineDAG(new Map(), progress)

    for (const stage of PIPELINE) {
      for (const step of stage.steps) {
        const startIdx = events.findIndex(
          (e) => e.type === "step-start" && e.step === step.name
        )
        const completeIdx = events.findIndex(
          (e) => e.type === "step-complete" && e.step === step.name
        )
        expect(startIdx).toBeGreaterThanOrEqual(0)
        expect(completeIdx).toBeGreaterThan(startIdx)
      }
    }
  })

  it("executor can emit step-progress events", async () => {
    const executors = new Map<StepName, StepExecutor>([
      ["extract", async (p) => {
        p.emit({ type: "step-progress", step: "extract", message: "page 1/3", page: 1, totalPages: 3 })
        p.emit({ type: "step-progress", step: "extract", message: "page 2/3", page: 2, totalPages: 3 })
        p.emit({ type: "step-progress", step: "extract", message: "page 3/3", page: 3, totalPages: 3 })
      }],
    ])
    const { events, progress } = collectingProgress()
    await runPipelineDAG(executors, progress)

    const progressEvents = events.filter(
      (e) => e.type === "step-progress" && e.step === "extract"
    )
    expect(progressEvents).toHaveLength(3)
  })

  it("mid-stage failure skips remaining steps but not already-complete ones", async () => {
    // In the extract stage: extract succeeds, then text-classification fails
    // metadata (parallel to text-classification) should still complete
    // translation (depends on text-classification) should be skipped
    const executors = new Map<StepName, StepExecutor>([
      ["text-classification", async () => { throw new Error("classify fail") }],
    ])
    const { progress } = collectingProgress()
    const result = await runPipelineDAG(executors, progress)

    expect(result.steps.statuses.get("extract")).toBe("complete")
    expect(result.steps.statuses.get("metadata")).toBe("complete")
    expect(result.steps.statuses.get("text-classification")).toBe("failed")
    expect(result.steps.statuses.get("translation")).toBe("skipped")
  })

  it("pipeline definition covers all step names in StepName enum", () => {
    const stepsInPipeline = new Set(
      PIPELINE.flatMap((s) => s.steps.map((step) => step.name))
    )
    for (const step of StepName.options) {
      expect(stepsInPipeline.has(step)).toBe(true)
    }
  })

  it("step dependsOn references are valid within their stage", () => {
    for (const stage of PIPELINE) {
      const stepNames = new Set(stage.steps.map((s) => s.name))
      for (const step of stage.steps) {
        for (const dep of step.dependsOn ?? []) {
          expect(stepNames.has(dep)).toBe(true)
        }
      }
    }
  })

  it("stage dependsOn references are valid stage names", () => {
    const stageNames = new Set(PIPELINE.map((s) => s.name))
    for (const stage of PIPELINE) {
      for (const dep of stage.dependsOn) {
        expect(stageNames.has(dep)).toBe(true)
      }
    }
  })

  it("no circular dependencies in stages", () => {
    // Topological sort should visit every stage exactly once
    const visited = new Set<string>()
    const stageMap = new Map(PIPELINE.map((s) => [s.name, s]))

    function visit(name: string, path: Set<string>) {
      if (path.has(name)) throw new Error(`Cycle detected: ${[...path, name].join(" → ")}`)
      if (visited.has(name)) return
      path.add(name)
      for (const dep of stageMap.get(name)!.dependsOn) {
        visit(dep, path)
      }
      path.delete(name)
      visited.add(name)
    }

    for (const stage of PIPELINE) {
      visit(stage.name, new Set())
    }
    expect(visited.size).toBe(PIPELINE.length)
  })

  it("no circular dependencies in steps within each stage", () => {
    for (const stage of PIPELINE) {
      const visited = new Set<string>()
      const stepMap = new Map(stage.steps.map((s) => [s.name, s]))

      function visit(name: string, path: Set<string>) {
        if (path.has(name)) throw new Error(`Cycle in ${stage.name}: ${[...path, name].join(" → ")}`)
        if (visited.has(name)) return
        path.add(name)
        for (const dep of stepMap.get(name)?.dependsOn ?? []) {
          visit(dep, path)
        }
        path.delete(name)
        visited.add(name)
      }

      for (const step of stage.steps) {
        visit(step.name, new Set())
      }
      expect(visited.size).toBe(stage.steps.length)
    }
  })
})
