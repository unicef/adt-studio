import { describe, expect, it } from "vitest"
import {
  analyzeSystems,
  auditPairwiseBias,
  bradleyTerry,
  clusterBootstrap,
  cohenKappa,
  holmBonferroni,
  krippendorffAlphaNominal,
  macroF1,
  metaEvaluateJudges,
  pairedClusterBootstrap,
} from "./lib/adt-eval-science.mjs"

describe("ADT evaluation science", () => {
  it("bootstraps by document instead of treating page items as independent", () => {
    const result = clusterBootstrap([
      { documentId: "a", score: 100 }, { documentId: "a", score: 100 },
      { documentId: "b", score: 0 },
    ], { seed: 7, samples: 1_000 })
    expect(result.point).toBe(50)
    expect(result.clusters).toBe(2)
    expect(result.low).toBe(0)
    expect(result.high).toBe(100)
  })

  it("computes paired document effects and probability of superiority", () => {
    const result = pairedClusterBootstrap(
      [{ documentId: "a", score: 90 }, { documentId: "b", score: 80 }],
      [{ documentId: "a", score: 70 }, { documentId: "b", score: 60 }],
      { seed: 2, samples: 500 },
    )
    expect(result.point).toBe(20)
    expect(result.probabilityLeftBetter).toBe(1)
  })

  it("reports judge agreement without redundant metrics", () => {
    const truth = ["met", "met", "not_met", "not_met"]
    const predicted = ["met", "not_met", "not_met", "not_met"]
    expect(macroF1(truth, predicted, ["met", "not_met"])).toBeCloseTo(0.7333, 3)
    expect(cohenKappa(truth, predicted)).toBe(0.5)
    expect(krippendorffAlphaNominal([["met", "met"], ["not_met", "not_met"]])).toBe(1)
  })

  it("meta-evaluates atomic judges against human labels", () => {
    const review = (reviewerId, judgeModel, verdicts) => ({
      reviewerId, judgeModel, candidateId: "a", items: verdicts.map((verdict, index) => ({
        itemId: `i${index}`, atomicCriteria: [{ rubricId: "groundedness", verdict }],
      })),
    })
    const result = metaEvaluateJudges([
      review("human-1", null, ["met", "not_met"]),
      review("human-2", null, ["met", "not_met"]),
      review("judge", "judge-model", ["met", "not_met"]),
    ], { minimumMetaExamples: 2, minimumMacroF1: 0.8, minimumKappa: 0.6 })
    expect(result.calibrated).toBe(true)
    expect(result.judges[0]).toMatchObject({ examples: 2, coverage: 1, accuracy: 1, cohenKappa: 1 })
  })

  it("does not let selective judge abstention pass calibration", () => {
    const review = (reviewerId, judgeModel, verdicts) => ({
      reviewerId, judgeModel, candidateId: "a", items: verdicts.map((verdict, index) => ({
        itemId: `i${index}`, atomicCriteria: [{ rubricId: "groundedness", verdict }],
      })),
    })
    const result = metaEvaluateJudges([
      review("human-1", null, ["met", "not_met"]),
      review("human-2", null, ["met", "not_met"]),
      review("judge", "judge-model", ["met", "uncertain"]),
    ], { minimumMetaExamples: 2, minimumMacroF1: 0, minimumKappa: -1, minimumCoverage: 0.9 })
    expect(result.judges[0].coverage).toBe(0.5)
    expect(result.calibrated).toBe(false)
  })

  it("fits a Bradley-Terry ranking from pairwise wins", () => {
    const ranking = bradleyTerry([
      { candidateIds: ["a", "b"], winnerCandidateId: "a" },
      { candidateIds: ["a", "b"], winnerCandidateId: "a" },
      { candidateIds: ["a", "b"], winnerCandidateId: null },
    ], ["a", "b"])
    expect(ranking[0].candidateId).toBe("a")
    expect(ranking[0].strength).toBeGreaterThan(ranking[1].strength)
  })

  it("controls family-wise error across model comparisons", () => {
    expect(holmBonferroni([0.01, 0.03, 0.2])).toEqual([0.03, 0.06, 0.2])
  })

  it("audits position consistency across swapped presentations", () => {
    const audit = auditPairwiseBias([
      { reviewerId: "judge:x:pass1", sampleId: "s", candidateIds: ["a", "b"], presentationOrder: ["a", "b"], winnerCandidateId: "a" },
      { reviewerId: "judge:x:pass2", sampleId: "s", candidateIds: ["b", "a"], presentationOrder: ["b", "a"], winnerCandidateId: "a" },
    ])
    expect(audit.positionConsistency).toBe(1)
    expect(audit.firstPositionWinRate).toBe(0.5)
  })

  it("refuses recommendation status without enough documents", () => {
    const candidate = (id, documentId, score) => ({
      id: `${id}-${documentId}`, systemId: id, documentId, runDurationMs: 10, costUsd: 0,
      scores: { eligible: true, leaderboards: { quality: score } },
    })
    const report = analyzeSystems([
      candidate("a", "d1", 90), candidate("a", "d2", 80),
      candidate("b", "d1", 70), candidate("b", "d2", 60),
    ], [
      { id: "d1", strata: { language: "en", domain: "story" } },
      { id: "d2", strata: { language: "pt-BR", domain: "medical" } },
    ], [], { seed: 1, recommendationPolicy: { minimumDocuments: 3, minimumDocumentsPerStratum: 2 } })
    expect(report.systems.every((system) => !system.recommendationEligible)).toBe(true)
    expect(report.pairedComparisons[0].point).toBe(20)
  })
})
