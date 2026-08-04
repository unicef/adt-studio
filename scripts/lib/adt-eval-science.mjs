const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

function randomFactory(seed) {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function interval(values) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return {
    low: sorted[Math.floor((sorted.length - 1) * 0.025)],
    high: sorted[Math.ceil((sorted.length - 1) * 0.975)],
  }
}

export function clusterBootstrap(records, {
  cluster = (record) => record.documentId,
  value = (record) => record.score,
  seed = 1,
  samples = 5_000,
} = {}) {
  if (!records.length) return null
  const groups = new Map()
  for (const record of records) {
    const key = cluster(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  }
  const clusters = [...groups.values()]
  const point = mean(clusters.map((rows) => mean(rows.map(value))))
  if (clusters.length < 2) return { point, low: point, high: point, clusters: clusters.length, inferenceEligible: false }
  const random = randomFactory(seed)
  const estimates = []
  for (let sample = 0; sample < samples; sample++) {
    const selected = Array.from({ length: clusters.length }, () => clusters[Math.floor(random() * clusters.length)])
    estimates.push(mean(selected.map((rows) => mean(rows.map(value)))))
  }
  return { point, ...interval(estimates), clusters: clusters.length, inferenceEligible: true }
}

export function pairedClusterBootstrap(left, right, { seed = 1, samples = 5_000 } = {}) {
  const meansByDocument = (records) => {
    const values = new Map()
    for (const record of records) {
      if (!values.has(record.documentId)) values.set(record.documentId, [])
      values.get(record.documentId).push(record.score)
    }
    return new Map([...values].map(([documentId, scores]) => [documentId, mean(scores)]))
  }
  const leftByDocument = meansByDocument(left)
  const rightByDocument = meansByDocument(right)
  const pairs = [...leftByDocument].flatMap(([documentId, score]) => rightByDocument.has(documentId)
    ? [{ documentId, difference: score - rightByDocument.get(documentId) }]
    : [])
  if (!pairs.length) return null
  const point = mean(pairs.map((pair) => pair.difference))
  if (pairs.length < 2) return { point, low: point, high: point, probabilityLeftBetter: null, documents: 1, inferenceEligible: false }
  const random = randomFactory(seed)
  const estimates = []
  for (let sample = 0; sample < samples; sample++) {
    estimates.push(mean(Array.from({ length: pairs.length }, () => pairs[Math.floor(random() * pairs.length)].difference)))
  }
  return {
    point,
    ...interval(estimates),
    probabilityLeftBetter: estimates.filter((value) => value > 0).length / estimates.length,
    documents: pairs.length,
    inferenceEligible: true,
  }
}

function confusion(reference, prediction, positive) {
  let tp = 0; let fp = 0; let fn = 0
  for (let index = 0; index < reference.length; index++) {
    if (reference[index] === positive && prediction[index] === positive) tp++
    else if (reference[index] !== positive && prediction[index] === positive) fp++
    else if (reference[index] === positive && prediction[index] !== positive) fn++
  }
  return { tp, fp, fn }
}

export function macroF1(reference, prediction, labels = [...new Set([...reference, ...prediction])]) {
  if (!reference.length || reference.length !== prediction.length) return null
  return mean(labels.map((label) => {
    const { tp, fp, fn } = confusion(reference, prediction, label)
    return 2 * tp + fp + fn === 0 ? 1 : (2 * tp) / (2 * tp + fp + fn)
  }))
}

export function cohenKappa(reference, prediction) {
  if (!reference.length || reference.length !== prediction.length) return null
  const labels = [...new Set([...reference, ...prediction])]
  const observed = reference.filter((value, index) => value === prediction[index]).length / reference.length
  const expected = labels.reduce((sum, label) => {
    const left = reference.filter((value) => value === label).length / reference.length
    const right = prediction.filter((value) => value === label).length / prediction.length
    return sum + left * right
  }, 0)
  return expected === 1 ? 1 : (observed - expected) / (1 - expected)
}

export function krippendorffAlphaNominal(ratingsByItem) {
  const usable = ratingsByItem.map((ratings) => ratings.filter((value) => value != null)).filter((ratings) => ratings.length > 1)
  if (!usable.length) return null
  let observedDisagreement = 0; let coincidenceMass = 0
  const all = usable.flat()
  for (const ratings of usable) {
    const counts = new Map(ratings.map((value) => [value, ratings.filter((candidate) => candidate === value).length]))
    const orderedDisagreements = ratings.length ** 2 - [...counts.values()].reduce((sum, count) => sum + count ** 2, 0)
    observedDisagreement += orderedDisagreements / (ratings.length - 1)
    coincidenceMass += ratings.length
  }
  const labels = [...new Set(all)]
  const expectedDisagreement = coincidenceMass > 1
    ? (coincidenceMass ** 2 - labels.reduce((sum, label) => sum + all.filter((value) => value === label).length ** 2, 0))
      / (coincidenceMass * (coincidenceMass - 1))
    : 0
  return expectedDisagreement === 0 ? 1 : 1 - (observedDisagreement / coincidenceMass) / expectedDisagreement
}

export function bradleyTerry(comparisons, modelIds, { iterations = 1_000, tolerance = 1e-10 } = {}) {
  const index = new Map(modelIds.map((id, position) => [id, position]))
  const wins = Array(modelIds.length).fill(0)
  const meetings = Array.from({ length: modelIds.length }, () => Array(modelIds.length).fill(0))
  for (const comparison of comparisons) {
    const [leftId, rightId] = comparison.candidateIds ?? []
    if (!index.has(leftId) || !index.has(rightId) || leftId === rightId) continue
    const left = index.get(leftId); const right = index.get(rightId)
    const weight = Number(comparison.weight ?? 1)
    meetings[left][right] += weight; meetings[right][left] += weight
    if (comparison.winnerCandidateId == null) { wins[left] += weight / 2; wins[right] += weight / 2 }
    else wins[index.get(comparison.winnerCandidateId)] += weight
  }
  let strength = Array(modelIds.length).fill(1)
  for (let iteration = 0; iteration < iterations; iteration++) {
    const next = strength.map((_, left) => {
      let denominator = 0
      for (let right = 0; right < strength.length; right++) {
        if (left !== right) denominator += meetings[left][right] / (strength[left] + strength[right])
      }
      return denominator > 0 ? Math.max(1e-12, wins[left] / denominator) : strength[left]
    })
    const scale = Math.exp(mean(next.map(Math.log)))
    for (let position = 0; position < next.length; position++) next[position] /= scale
    if (Math.max(...next.map((value, position) => Math.abs(value - strength[position]))) < tolerance) { strength = next; break }
    strength = next
  }
  return modelIds.map((candidateId, position) => ({ candidateId, strength: strength[position] }))
    .sort((left, right) => right.strength - left.strength)
    .map((row, position) => ({ rank: position + 1, ...row }))
}

export function auditPairwiseBias(comparisons) {
  const groups = new Map()
  for (const comparison of comparisons) {
    const reviewer = String(comparison.reviewerId ?? "unknown").replace(/:pass\d+$/, "")
    const pair = [...(comparison.candidateIds ?? [])].sort().join("|")
    const key = `${reviewer}:${comparison.sampleId ?? "unknown"}:${pair}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(comparison)
  }
  const repeated = [...groups.values()].filter((rows) => rows.length > 1)
  const consistent = repeated.filter((rows) => new Set(rows.map((row) => row.winnerCandidateId ?? "tie")).size === 1).length
  const decided = comparisons.filter((row) => row.winnerCandidateId != null && (row.presentationOrder ?? row.candidateIds)?.length)
  const firstPositionWins = decided.filter((row) => row.winnerCandidateId === (row.presentationOrder ?? row.candidateIds)[0]).length
  return {
    repeatedPairs: repeated.length,
    positionConsistency: repeated.length ? consistent / repeated.length : null,
    decidedComparisons: decided.length,
    firstPositionWinRate: decided.length ? firstPositionWins / decided.length : null,
    abstentionRate: comparisons.length ? comparisons.filter((row) => row.winnerCandidateId == null).length / comparisons.length : null,
  }
}

export function holmBonferroni(pValues) {
  const ordered = pValues.map((pValue, index) => ({ pValue, index })).sort((left, right) => left.pValue - right.pValue)
  const adjusted = Array(pValues.length).fill(1)
  let previous = 0
  for (let rank = 0; rank < ordered.length; rank++) {
    const value = Math.min(1, (ordered.length - rank) * ordered[rank].pValue)
    previous = Math.max(previous, value)
    adjusted[ordered[rank].index] = previous
  }
  return adjusted
}

function documentStrata(document) {
  const declared = document.strata ?? {}
  return {
    language: declared.language ?? document.language ?? "unknown",
    domain: declared.domain ?? "unknown",
    contentType: declared.contentType ?? "unknown",
    audience: declared.audience ?? "unknown",
    layoutComplexity: declared.layoutComplexity ?? "unknown",
    sourceQuality: declared.sourceQuality ?? "unknown",
    riskLevel: declared.riskLevel ?? "standard",
  }
}

export function analyzeSystems(candidates, documents, comparisons = [], suite = {}) {
  const documentsById = new Map(documents.map((document) => [document.id, document]))
  const groups = new Map()
  for (const candidate of candidates) {
    const systemId = candidate.systemId ?? candidate.id
    if (!groups.has(systemId)) groups.set(systemId, [])
    groups.get(systemId).push({
      candidateId: candidate.id,
      documentId: candidate.documentId,
      score: candidate.scores.leaderboards.quality,
      eligible: candidate.scores.eligible,
      latencyMs: candidate.runDurationMs,
      costUsd: candidate.costUsd,
      worstReviewedRunScore: candidate.scores.review?.worstRunScore ?? null,
      runs: candidate.runSummaries ?? [],
    })
  }
  const minimumDocuments = suite.recommendationPolicy?.minimumDocuments ?? 5
  const minimumDocumentsPerStratum = suite.recommendationPolicy?.minimumDocumentsPerStratum ?? 3
  const minimumPracticalDifference = suite.recommendationPolicy?.minimumPracticalDifference ?? 2
  const systems = [...groups.entries()].map(([systemId, rows]) => {
    const strata = {}
    for (const dimension of Object.keys(documentStrata({}))) {
      const values = new Map()
      for (const row of rows) {
        const key = documentStrata(documentsById.get(row.documentId) ?? {})[dimension]
        if (!values.has(key)) values.set(key, [])
        values.get(key).push(row)
      }
      strata[dimension] = [...values.entries()].map(([value, records]) => ({
        value,
        documents: new Set(records.map((record) => record.documentId)).size,
        quality: clusterBootstrap(records, { seed: (suite.seed ?? 1) + dimension.length + value.length }),
        recommendationEligible: new Set(records.map((record) => record.documentId)).size >= minimumDocumentsPerStratum,
      }))
    }
    const documentCount = new Set(rows.map((row) => row.documentId)).size
    const allRuns = rows.flatMap((row) => row.runs)
    return {
      systemId,
      documentCount,
      quality: clusterBootstrap(rows, { seed: (suite.seed ?? 1) + systemId.length }),
      worstDocumentQuality: Math.min(...rows.map((row) => row.score)),
      worstReviewedRunScore: Math.min(...rows.map((row) => row.worstReviewedRunScore ?? 1)),
      technicalPassRate: rows.filter((row) => row.eligible).length / rows.length,
      runTechnicalPassRate: allRuns.length ? allRuns.filter((run) => run.technicalPassed).length / allRuns.length : null,
      worstRunLatencyMs: allRuns.length ? Math.max(...allRuns.map((run) => run.runDurationMs)) : null,
      medianLatencyMs: [...rows].sort((left, right) => left.latencyMs - right.latencyMs)[Math.floor(rows.length / 2)]?.latencyMs ?? null,
      meanCostUsd: mean(rows.map((row) => row.costUsd)),
      recommendationEligible: documentCount >= minimumDocuments && rows.every((row) => row.eligible),
      strata,
      rows,
    }
  })
  const paired = []
  for (let left = 0; left < systems.length; left++) for (let right = left + 1; right < systems.length; right++) {
    const result = pairedClusterBootstrap(systems[left].rows, systems[right].rows, { seed: (suite.seed ?? 1) + left * 31 + right })
    const twoSidedP = result?.probabilityLeftBetter == null
      ? null
      : Math.min(1, 2 * Math.min(result.probabilityLeftBetter, 1 - result.probabilityLeftBetter))
    paired.push({ leftSystemId: systems[left].systemId, rightSystemId: systems[right].systemId, ...result, twoSidedP })
  }
  const adjusted = holmBonferroni(paired.map((comparison) => comparison.twoSidedP ?? 1))
  paired.forEach((comparison, index) => {
    comparison.holmAdjustedP = comparison.twoSidedP == null ? null : adjusted[index]
    comparison.recommendationEligible = comparison.documents >= minimumDocuments
      && Math.abs(comparison.point) >= minimumPracticalDifference
      && comparison.holmAdjustedP != null && comparison.holmAdjustedP < 0.05
  })
  const modelIds = [...groups.keys()]
  const candidateToSystem = new Map(candidates.map((candidate) => [candidate.id, candidate.systemId ?? candidate.id]))
  const systemComparisons = comparisons.map((comparison) => ({
    ...comparison,
    candidateIds: (comparison.candidateIds ?? []).map((id) => candidateToSystem.get(id) ?? id),
    winnerCandidateId: comparison.winnerCandidateId == null ? null : candidateToSystem.get(comparison.winnerCandidateId) ?? comparison.winnerCandidateId,
  })).filter((comparison) => new Set(comparison.candidateIds).size === 2)
  return {
    policy: { minimumDocuments, minimumDocumentsPerStratum, minimumPracticalDifference, unitOfAnalysis: "document", interval: "document-clustered bootstrap 95% CI" },
    systems: systems.map(({ rows, ...system }) => system),
    pairedComparisons: paired,
    bradleyTerry: systemComparisons.length ? bradleyTerry(systemComparisons, modelIds) : null,
    pairwiseBiasAudit: auditPairwiseBias(comparisons),
  }
}

function verdict(item) {
  if (["met", "not_met", "uncertain"].includes(item.verdict)) return item.verdict
  if (Number.isFinite(item.score)) return item.score >= 0.5 ? "met" : "not_met"
  return null
}

export function metaEvaluateJudges(reviews, {
  humanReviewerIds = [], minimumHumanReviewers = 2, minimumMetaExamples = 50,
  minimumMacroF1 = 0.8, minimumKappa = 0.6, minimumCoverage = 0.9,
} = {}) {
  const humans = reviews.filter((review) => !review.judgeModel && (!humanReviewerIds.length || humanReviewerIds.includes(review.reviewerId)))
  const judges = reviews.filter((review) => review.judgeModel)
  const expandedItems = (review) => (review.items ?? []).flatMap((item) => item.atomicCriteria?.length
    ? item.atomicCriteria.map((criterion) => ({ ...criterion, itemId: item.itemId, rubricId: criterion.rubricId }))
    : [item])
  const keyFor = (review, item) => `${review.candidateId}:${item.itemId}:${item.rubricId ?? "overall"}`
  const humanVotes = new Map()
  for (const review of humans) for (const item of expandedItems(review)) {
    const key = keyFor(review, item)
    if (!humanVotes.has(key)) humanVotes.set(key, [])
    const value = verdict(item); if (value && value !== "uncertain") humanVotes.get(key).push(value)
  }
  const gold = new Map([...humanVotes].flatMap(([key, votes]) => {
    const met = votes.filter((value) => value === "met").length
    const notMet = votes.filter((value) => value === "not_met").length
    return met === notMet ? [] : [[key, met > notMet ? "met" : "not_met"]]
  }))
  const byJudge = new Map()
  for (const review of judges) {
    const id = review.reviewerId
    if (!byJudge.has(id)) byJudge.set(id, [])
    for (const item of expandedItems(review)) {
      const reference = gold.get(keyFor(review, item)); const predicted = verdict(item)
      if (reference && predicted) byJudge.get(id).push({ reference, predicted })
    }
  }
  const judgeReports = [...byJudge.entries()].map(([reviewerId, rows]) => {
    const decided = rows.filter((row) => row.predicted !== "uncertain")
    const reference = decided.map((row) => row.reference); const prediction = decided.map((row) => row.predicted)
    return {
      reviewerId,
      examples: rows.length,
      coverage: rows.length ? decided.length / rows.length : 0,
      accuracy: decided.length ? reference.filter((value, index) => value === prediction[index]).length / decided.length : null,
      macroF1: macroF1(reference, prediction, ["met", "not_met"]),
      cohenKappa: cohenKappa(reference, prediction),
    }
  })
  const ratings = new Map()
  for (const review of judges) for (const item of expandedItems(review)) {
    const key = keyFor(review, item)
    if (!ratings.has(key)) ratings.set(key, [])
    ratings.get(key).push(verdict(item))
  }
  return {
    humanReviewers: new Set(humans.map((review) => review.reviewerId)).size,
    humanGoldItems: gold.size,
    judges: judgeReports,
    interJudgeAlpha: krippendorffAlphaNominal([...ratings.values()]),
    policy: { minimumHumanReviewers, minimumMetaExamples, minimumMacroF1, minimumKappa, minimumCoverage },
    calibrated: new Set(humans.map((review) => review.reviewerId)).size >= minimumHumanReviewers
      && judgeReports.length > 0 && judgeReports.every((report) => report.examples >= minimumMetaExamples
        && report.coverage >= minimumCoverage && report.macroF1 >= minimumMacroF1 && report.cohenKappa >= minimumKappa),
  }
}
