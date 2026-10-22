// Which issues a pull request is about, the way adt-studio links them
// (docs/SPEC_DRIVEN_DEVELOPMENT.md and the PR template):
//   - GitHub's own link (Development box, "Closes #N"),
//   - the branch name: fix/940-…, issue-705, codex/fix-812-…,
//   - the PR template's "**Issue:** #N" and closing words in the body,
//   - "(#N)" in the title.
// Only numbers that are real issues count, so a release PR listing many
// changes is not taken as linked to all of them.
// Ported from the Done board (adt-team, src/lib/github/linking.ts).

const SPEC_ID = /SPEC[-_ ]?(\d{4})/gi
const SPEC_FILE = /^docs\/specs\/SPEC-\d{4}[^/]*\.md$/i
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?|part of|issue:?\**)\s*:?\**\s*#(\d+)/gi

// "spec/890-per-element-audio" → 890, "fix/846-gemini" → 846, "issue-705" → 705,
// "codex/fix-812-template-heading" → 812. Needs 2+ digits to skip "v2", "gemma-3",
// and ignores spec ids ("spec/SPEC-0009-…" is a spec, not issue #9).
export function issueNumberFromBranch(branch: string): number | null {
  const m = /(?:^|[/-])(\d{2,6})(?=-|$|\/)/.exec(branch.replace(SPEC_ID, 'spec'))
  return m ? Number(m[1]) : null
}

export function issueNumbersFromBody(body: string | null | undefined): number[] {
  if (!body) return []
  const out = new Set<number>()
  for (const m of body.matchAll(CLOSING)) out.add(Number(m[1]))
  return [...out]
}

// "(#705)" in a PR title
export function issueNumbersFromTitle(title: string): number[] {
  return [...title.matchAll(/\(#(\d+)\)/g)].map((m) => Number(m[1]))
}

export type PrLinkInput = { title: string; body: string | null; headRefName: string; closing: number[] }

export function linkedIssues(pr: PrLinkInput, knownIssues: Set<number>): number[] {
  return issueCandidates(pr).filter((n) => knownIssues.has(n))
}

// Every number the PR points at; some may be PRs or issues not on the board.
export function issueCandidates(pr: PrLinkInput): number[] {
  const candidates = new Set<number>(pr.closing)
  const fromBranch = issueNumberFromBranch(pr.headRefName)
  if (fromBranch !== null) candidates.add(fromBranch)
  for (const n of issueNumbersFromBody(pr.body)) candidates.add(n)
  for (const n of issueNumbersFromTitle(pr.title)) candidates.add(n)
  return [...candidates]
}

// A spec PR adds or edits a spec: docs/specs/SPEC-NNNN-slug.md (editing only
// docs/specs/INDEX.md does not count).
export function isSpecPr(files: string[]) {
  return files.some((f) => SPEC_FILE.test(f))
}
