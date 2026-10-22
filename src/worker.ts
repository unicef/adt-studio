// ADT Backlog Wizard: a GitHub App on a Cloudflare Worker.
//
// GitHub sends the App's `projects_v2_item` webhook here when a card on an
// org Project changes. For cards on the Kanban Project (PROJECTS):
//
//   - a Status move runs the hand-off rules (rules/handoff.ts): credit and
//     unassign whoever finished a stage, assign whoever picked the card up,
//     tell the story at Done; and the block rules (rules/blocks.ts), which
//     only ever touch the Project's Block field, never the issue;
//   - a card moved to Done by GitHub's own automation (the Project's "Item
//     closed" workflow, e.g. a merged PR closed the issue) gets the same
//     treatment, without a mover;
//   - reviews on a PR move the PR's issue cards (\`pull_request\` and
//     \`pull_request_review\` events): a review requested or given moves the
//     card into Reviewing with the reviewer on it; changes requested send it
//     back to Doing, to the PR's author.
//
// The webhook says who moved the card (sender) and from where to where, so the
// bot keeps no state: past credits are read back from its own comments.
// Everything it writes shows as the App (<slug>[bot]), with the App's
// permissions, on the repos it is installed on. See docs/FLOW.md.
//
// Hourly it asks GitHub to redeliver deliveries that failed, and moves cards
// whose spec PR was merged on to To do (a merged spec is an approved spec).
//
// Secrets: WEBHOOK_SECRET, APP_PRIVATE_KEY (PKCS#8 PEM).
// Vars: APP_ID, BOT_LOGIN (<slug>[bot]), PROJECTS (comma-separated project node ids).
import { api, graphql, installationToken, appJwt, postComment, verifySignature, type AppEnv } from './github'
import { blockName, blockOnMove, type Block } from './rules/blocks'
import { COLUMN_BY_ID, columnFromStatusName, columnIndex } from './rules/flow'
import { creditsFromComments, handoff, type HandoffInput, type SpecPr } from './rules/handoff'
import { isSpecPr, issueCandidates, linkedIssues } from './rules/linking'

type Env = AppEnv & { WEBHOOK_SECRET: string; BOT_LOGIN: string; PROJECTS: string }

// Only the parts of ExecutionContext / ScheduledController the Worker uses.
type Ctx = { waitUntil(promise: Promise<unknown>): void }

type ItemEvent = {
  action: string
  installation?: { id: number }
  sender?: { login: string; type: string }
  projects_v2_item?: { node_id: string; project_node_id: string; content_node_id: string; content_type: string }
  changes?: { field_value?: { field_name?: string; from?: { name?: string } | null; to?: { name?: string } | null } }
}

const STATUS_FIELD = 'Status'
const BLOCK_FIELD = 'Block'
// The Project's built-in workflows act as this account.
const PROJECT_AUTOMATION = 'github-project-automation[bot]'

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    if (request.method !== 'POST') return new Response('ADT Backlog Wizard: GitHub webhooks go to POST /github.\n')
    const body = await request.text()
    if (!(await verifySignature(env.WEBHOOK_SECRET, body, request.headers.get('x-hub-signature-256')))) return new Response('Bad signature', { status: 401 })

    const event = request.headers.get('x-github-event')
    if (event === 'ping') return new Response('pong')
    if (event === 'pull_request' || event === 'pull_request_review') return onPrEvent(env, ctx, event, JSON.parse(body), request.headers.get('x-github-delivery') ?? '?')
    if (event !== 'projects_v2_item') return new Response(`Ignored: ${event}`, { status: 202 })

    const e = JSON.parse(body) as ItemEvent
    const item = e.projects_v2_item
    if (!item || !e.installation || !e.sender) return new Response('Ignored: no item', { status: 202 })
    if (!projects(env).includes(item.project_node_id)) return new Response('Ignored: another project', { status: 202 })
    if (item.content_type !== 'Issue') return new Response('Ignored: not an issue', { status: 202 })
    // The bot's own edits (Block field, a merged spec's move) come back as events
    // too; other bots are ignored, except the Project's own automation (below).
    const automated = e.sender.login === PROJECT_AUTOMATION
    if ((e.sender.type === 'Bot' && !automated) || e.sender.login === env.BOT_LOGIN) return new Response('Ignored: a bot', { status: 202 })
    if (e.action !== 'edited') return new Response(`Ignored: ${e.action}`, { status: 202 })

    // GitHub waits 10 s for an answer: answer now, do the work after.
    const delivery = request.headers.get('x-github-delivery') ?? '?'
    const run = (what: string, work: Promise<unknown>) => {
      ctx.waitUntil(work.catch((err) => console.error(`delivery ${delivery} (${what}): ${(err as Error).message}`)))
      return new Response(what, { status: 202 })
    }

    const change = e.changes?.field_value
    if (change?.field_name !== STATUS_FIELD) return new Response('Ignored: not a Status move', { status: 202 })
    const from = columnFromStatusName(change.from?.name)?.id
    const to = columnFromStatusName(change.to?.name)?.id
    if (!from || !to || from === to) return new Response(`Ignored: ${change.from?.name ?? 'none'} → ${change.to?.name ?? 'none'}`, { status: 202 })
    // The Project's automation only counts when it closes the loop: an issue
    // closed (usually by its merged PR) goes to Done.
    if (automated && to !== 'done') return new Response('Ignored: automation, not to Done', { status: 202 })
    const mover = automated ? null : e.sender.login
    return run(`Moved: ${from} → ${to} by ${mover ? `@${mover}` : 'GitHub'}`, onMove(env, e.installation.id, item, from, to, mover))
  },

  async scheduled(_controller: unknown, env: Env) {
    await redeliverFailed(env)
    await moveMergedSpecs(env)
  },
}

function projects(env: Env) {
  return env.PROJECTS.split(',').map((s) => s.trim()).filter(Boolean)
}

// ---------------------------------------------------------------------------
// A card moved

const CARD = `query($item: ID!) {
  item: node(id: $item) { ... on ProjectV2Item {
    block: fieldValueByName(name: "${BLOCK_FIELD}") { ... on ProjectV2ItemFieldIterationValue { title } }
    project { id field(name: "${BLOCK_FIELD}") { ... on ProjectV2IterationField { id configuration {
      iterations { id title startDate duration } completedIterations { id title startDate duration } } } } }
    content { ... on Issue { id number state repository { nameWithOwner }
      assignees(first: 20) { nodes { login } }
      closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { reviews(states: APPROVED, first: 20) { nodes { author { login } } } } } } } } } }`

type Card = {
  itemId: string
  projectId: string
  issueId: string
  number: number
  open: boolean
  repo: string // owner/name
  assignees: string[]
  approvers: string[]
  block: string | null // the Block field
  blockField: { id: string; iterations: (Block & { id: string })[] } | null
}

async function readCard(token: string, itemId: string): Promise<Card | null> {
  const item = (await graphql(token, CARD, { item: itemId })).item
  const issue = item?.content
  if (!issue?.number) return null
  const f = item.project.field
  return {
    itemId,
    projectId: item.project.id,
    issueId: issue.id,
    number: issue.number,
    open: issue.state === 'OPEN',
    repo: issue.repository.nameWithOwner,
    assignees: issue.assignees.nodes.map((a: { login: string }) => a.login),
    approvers: [...new Set<string>(issue.closedByPullRequestsReferences.nodes.flatMap((pr: any) => pr.reviews.nodes.map((r: any) => r.author?.login).filter(Boolean)))],
    block: item.block?.title ?? null,
    blockField: f?.configuration ? { id: f.id, iterations: [...f.configuration.completedIterations, ...f.configuration.iterations] } : null,
  }
}

async function onMove(env: Env, installation: number, item: { node_id: string }, from: string, to: string, mover: string | null) {
  const token = await installationToken(env, installation)
  const card = await readCard(token, item.node_id)
  if (!card) return
  // Leaving Spec for later work: name the spec PR, when there is one.
  const leavesSpec = COLUMN_BY_ID.get(from)?.stage === 'spec' && COLUMN_BY_ID.get(to)?.stage !== 'spec' && columnIndex(to) > columnIndex(from)
  const specPr = leavesSpec ? await findSpecPr(token, card.issueId) : null
  await applyMove(env, token, card, from, to, mover, specPr)
}

// The hand-off for one move: comment, assignees, block.
type MoveExtra = Pick<HandoffInput, 'take' | 'via'>

async function applyMove(env: Env, token: string, card: Card, from: string, to: string, mover: string | null, specPr: SpecPr | null, extra: MoveExtra = {}) {
  const issue = `/repos/${card.repo}/issues/${card.number}`

  // Past credits, from the bot's own comments only: anyone could paste the marker.
  const comments: { body: string | null; user: { login: string } | null }[] = []
  for (let page = 1; ; page++) {
    const batch = (await api(token, 'GET', `${issue}/comments?per_page=100&page=${page}`)) as typeof comments
    comments.push(...batch)
    if (batch.length < 100) break
  }
  const credits = creditsFromComments(comments.filter((c) => c.user?.login === env.BOT_LOGIN).map((c) => c.body ?? ''))

  const h = handoff({ from, to, assignees: card.assignees, mover, approvers: card.approvers, credits, specPr, ...extra })
  console.log(`${card.repo}#${card.number} ${from} → ${to} by ${mover ? `@${mover}` : 'GitHub'}: comment=${!!h.comment} unassign=[${h.unassign}] assign=[${h.assign}]${specPr ? ` spec PR #${specPr.number}` : ''}`)
  if (h.comment) await postComment(token, issue, h.comment, env.BOT_LOGIN)
  if (h.unassign.length) await api(token, 'DELETE', `${issue}/assignees`, { assignees: h.unassign })
  if (h.assign.length) await api(token, 'POST', `${issue}/assignees`, { assignees: h.assign })

  const next = blockOnMove({ from, to, block: card.block ? blockName(card.block) : null, blocks: card.blockField?.iterations ?? [] })
  if (next !== undefined) await setBlock(token, card, next)
}

// ---------------------------------------------------------------------------
// Spec PRs

const PR_FIELDS = `number state merged author { __typename login } files(first: 50) { nodes { path } }
  reviews(states: APPROVED, first: 20) { nodes { author { login } } }`

type PrNode = { number: number; state: string; merged: boolean; author: { __typename: string; login: string } | null; files: { nodes: { path: string }[] }; reviews: { nodes: { author: { login: string } | null }[] } }

function toSpecPr(pr: PrNode): SpecPr {
  const author = pr.author && pr.author.__typename !== 'Bot' ? pr.author.login : null
  const approvers = [...new Set(pr.reviews.nodes.map((r) => r.author?.login).filter((l): l is string => !!l && l !== author))]
  return { number: pr.number, author, approvers, merged: pr.merged }
}

// The issue's spec PR: a PR that references the issue (GitHub link, "Closes
// #N", **Issue:** #N) and adds a docs/specs/SPEC-….md file. Merged ones first,
// then open ones, newest first. A spec PR linked only through its branch name
// does not reference the issue, so it is not found here.
async function findSpecPr(token: string, issueId: string): Promise<SpecPr | null> {
  const d = await graphql(
    token,
    `query($i: ID!) { node(id: $i) { ... on Issue { timelineItems(last: 50, itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]) { nodes {
      ... on CrossReferencedEvent { source { ... on PullRequest { ${PR_FIELDS} } } }
      ... on ConnectedEvent { subject { ... on PullRequest { ${PR_FIELDS} } } } } } } } }`,
    { i: issueId },
  ).catch(() => null)
  const prs: PrNode[] = (d?.node?.timelineItems?.nodes ?? []).map((n: any) => n.source ?? n.subject).filter((p: any) => p?.number && p.state !== 'CLOSED')
  const specs = prs.filter((p) => isSpecPr(p.files.nodes.map((f) => f.path)))
  const newestFirst = [...specs].reverse()
  const best = newestFirst.find((p) => p.merged) ?? newestFirst[0]
  return best ? toSpecPr(best) : null
}

// A merged spec PR is an approved spec: move its card from To spec, Specing
// or Spec review on to To do, crediting the PR's author and approvers. Looks
// at PRs merged in the last two days; a card already at To do or further is
// left alone, so running again changes nothing.
async function moveMergedSpecs(env: Env) {
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const jwt = await appJwt(env)
  for (const inst of (await api(jwt, 'GET', '/app/installations')) as { id: number }[]) {
    const token = await installationToken(env, inst.id)
    for (const projectId of projects(env)) {
      await moveMergedSpecsOn(env, token, projectId, since).catch((err) => console.error(`merged specs: ${(err as Error).message}`))
    }
  }
}

async function moveMergedSpecsOn(env: Env, token: string, projectId: string, since: string) {
  // Cards still before To do in the Spec stage, by repo and issue number.
  const waiting = new Map<string, Map<number, { itemId: string; from: string }>>()
  let status: { id: string; options: { id: string; name: string }[] } | null = null
  let after: string | null = null
  do {
    const d: any = await graphql(
      token,
      `query($p: ID!, $after: String) { node(id: $p) { ... on ProjectV2 {
        field(name: "${STATUS_FIELD}") { ... on ProjectV2SingleSelectField { id options { id name } } }
        items(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id
          status: fieldValueByName(name: "${STATUS_FIELD}") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          content { ... on Issue { number state repository { nameWithOwner } } } } } } } }`,
      { p: projectId, after },
    )
    const project = d?.node
    if (!project) return
    status = project.field
    for (const it of project.items.nodes) {
      const col = columnFromStatusName(it.status?.name)
      if (it.content?.state !== 'OPEN' || !col || !['to-spec', 'specing', 'spec-review'].includes(col.id)) continue
      const repo = it.content.repository.nameWithOwner
      const cards = waiting.get(repo) ?? new Map()
      cards.set(it.content.number, { itemId: it.id, from: col.id })
      waiting.set(repo, cards)
    }
    after = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null
  } while (after)
  const toDo = status?.options.find((o) => columnFromStatusName(o.name)?.id === 'to-do')
  if (!status || !toDo) return

  for (const [repo, cards] of waiting) {
    const [owner, name] = repo.split('/')
    const d = await graphql(
      token,
      `query($o: String!, $n: String!) { repository(owner: $o, name: $n) {
        pullRequests(first: 50, states: MERGED, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes {
          title body headRefName mergedAt closingIssuesReferences(first: 10) { nodes { number } } ${PR_FIELDS} } } } }`,
      { o: owner, n: name },
    )
    for (const pr of d.repository.pullRequests.nodes) {
      if (!pr.mergedAt || pr.mergedAt < since || !isSpecPr(pr.files.nodes.map((f: { path: string }) => f.path))) continue
      const closing = pr.closingIssuesReferences.nodes.map((n: { number: number }) => n.number)
      for (const n of linkedIssues({ title: pr.title, body: pr.body, headRefName: pr.headRefName, closing }, new Set(cards.keys()))) {
        const waitingCard = cards.get(n)!
        cards.delete(n) // once per card
        const card = await readCard(token, waitingCard.itemId)
        if (!card) continue
        await graphql(
          token,
          'mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) { updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) { clientMutationId } }',
          { p: projectId, i: card.itemId, f: status.id, o: toDo.id },
        )
        await applyMove(env, token, card, waitingCard.from, 'to-do', null, toSpecPr(pr))
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reviews on a PR move its issue cards

type PrEvent = {
  action: string
  installation?: { id: number }
  repository?: { full_name: string }
  sender?: { login: string; type: string }
  pull_request?: { number: number; draft: boolean; title: string; body: string | null; head: { ref: string }; user: { login: string; type: string } | null; requested_reviewers?: { login: string; type: string }[] }
  requested_reviewer?: { login: string; type: string }
  review?: { state: string; user: { login: string; type: string } | null }
}

const human = (u: { login: string; type: string } | null | undefined): u is { login: string; type: string } => !!u && u.type !== 'Bot' && !u.login.endsWith('[bot]')

// A review asked for or given: the card goes to Reviewing with the reviewer on
// it. Changes requested: back to Doing, with the PR's author. Approvals change
// nothing here: the merge closes the issue and the card goes to Done.
function onPrEvent(env: Env, ctx: Ctx, event: string, e: PrEvent, delivery: string): Response {
  const pr = e.pull_request
  if (!pr || !e.installation || !e.repository) return new Response('Ignored: no PR', { status: 202 })
  const author = human(pr.user) ? pr.user.login : null
  let reviewers: string[] = []
  let outcome: 'review' | 'changes'
  let via: string
  if (event === 'pull_request' && e.action === 'review_requested' && !pr.draft) {
    reviewers = human(e.requested_reviewer) ? [e.requested_reviewer.login] : []
    outcome = 'review'
    via = reviewers.length ? `when @${reviewers[0]} was asked to review PR #${pr.number}` : `when a review was requested on PR #${pr.number}`
  } else if (event === 'pull_request' && e.action === 'ready_for_review' && pr.requested_reviewers?.length) {
    reviewers = pr.requested_reviewers.filter(human).map((u) => u.login)
    outcome = 'review'
    via = `when PR #${pr.number} was ready for review`
  } else if (event === 'pull_request_review' && e.action === 'submitted' && human(e.review?.user) && e.review!.user!.login !== author) {
    reviewers = [e.review!.user!.login]
    outcome = e.review!.state === 'changes_requested' ? 'changes' : 'review'
    via = outcome === 'changes' ? `when @${reviewers[0]} requested changes on PR #${pr.number}` : `when @${reviewers[0]} reviewed PR #${pr.number}`
  } else {
    return new Response(`Ignored: ${event}.${e.action}`, { status: 202 })
  }
  const work = onReview(env, e.installation.id, e.repository.full_name, pr, author, reviewers, outcome, via)
  ctx.waitUntil(work.catch((err) => console.error(`delivery ${delivery} (${event}.${e.action}): ${(err as Error).message}`)))
  return new Response(`Review: ${outcome} on PR #${pr.number}`, { status: 202 })
}

async function onReview(env: Env, installation: number, repo: string, pr: NonNullable<PrEvent['pull_request']>, author: string | null, reviewers: string[], outcome: 'review' | 'changes', via: string) {
  const token = await installationToken(env, installation)
  for (const card of await prCards(env, token, repo, pr)) {
    if (outcome === 'review') {
      if (card.column === 'reviewing') {
        // Another reviewer on a card already in review: add them.
        const add = reviewers.filter((r) => !card.assignees.some((a) => a.toLowerCase() === r.toLowerCase()))
        if (add.length) await api(token, 'POST', `/repos/${card.repo}/issues/${card.number}/assignees`, { assignees: add })
        continue
      }
      if (!['to-review', 'doing'].includes(card.column)) continue
      await moveCard(env, token, card, 'reviewing', author, { take: reviewers, via })
    } else if (['reviewing', 'to-review'].includes(card.column)) {
      await moveCard(env, token, card, 'doing', author, { take: author ? [author] : [], via })
    }
  }
}

type PrCard = Card & { column: string; statusField: string; options: { id: string; name: string }[] }

// The PR's issues that are cards on the Kanban Project, with their column.
async function prCards(env: Env, token: string, repo: string, pr: NonNullable<PrEvent['pull_request']>): Promise<PrCard[]> {
  const [owner, name] = repo.split('/')
  const d = await graphql(token, `query($o: String!, $n: String!, $p: Int!) { repository(owner: $o, name: $n) { pullRequest(number: $p) { closingIssuesReferences(first: 10) { nodes { number } } } } }`, { o: owner, n: name, p: pr.number })
  const closing = (d.repository.pullRequest?.closingIssuesReferences.nodes ?? []).map((n: { number: number }) => n.number)
  const out: PrCard[] = []
  for (const n of issueCandidates({ title: pr.title, body: pr.body, headRefName: pr.head.ref, closing })) {
    const i = await graphql(
      token,
      `query($o: String!, $n: String!, $i: Int!) { repository(owner: $o, name: $n) { issue(number: $i) { state projectItems(first: 10) { nodes { id project { id }
        status: fieldValueByName(name: "${STATUS_FIELD}") { ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { id options { id name } } } } } } } } } }`,
      { o: owner, n: name, i: n },
    ).catch(() => null) // a PR number, or nothing
    const issue = i?.repository?.issue
    if (issue?.state !== 'OPEN') continue
    for (const it of issue.projectItems.nodes) {
      if (!projects(env).includes(it.project.id)) continue
      const column = columnFromStatusName(it.status?.name)?.id
      const card = await readCard(token, it.id)
      if (card && column && it.status?.field) out.push({ ...card, column, statusField: it.status.field.id, options: it.status.field.options })
    }
  }
  return out
}

// Moves a card on the Project (as the bot, so its own event is ignored) and
// does the hand-off for that move.
async function moveCard(env: Env, token: string, card: PrCard, to: string, mover: string | null, extra: MoveExtra) {
  const option = card.options.find((o) => columnFromStatusName(o.name)?.id === to)
  if (!option) return
  await graphql(
    token,
    'mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) { updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) { clientMutationId } }',
    { p: card.projectId, i: card.itemId, f: card.statusField, o: option.id },
  )
  await applyMove(env, token, card, card.column, to, mover, null, extra)
}

// ---------------------------------------------------------------------------
// Blocks live on the Project only: the card's Block field. The issue is not
// touched (no label), the way the V1 board kept its Iteration.

async function setBlock(token: string, card: Card, name: string | null) {
  if (!card.blockField) return
  const iteration = name ? card.blockField.iterations.find((b) => blockName(b.title).toLowerCase() === name.toLowerCase()) : null
  if (name && !iteration) return // a block the Project does not have
  console.log(`${card.repo}#${card.number} block → ${name ?? 'none'}`)
  await graphql(
    token,
    iteration
      ? 'mutation($p: ID!, $i: ID!, $f: ID!, $v: String!) { updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { iterationId: $v } }) { clientMutationId } }'
      : 'mutation($p: ID!, $i: ID!, $f: ID!) { clearProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f }) { clientMutationId } }',
    { p: card.projectId, i: card.itemId, f: card.blockField.id, ...(iteration ? { v: iteration.id } : {}) },
  )
}

// ---------------------------------------------------------------------------
// Hourly

// GitHub does not retry a delivery that failed (the Worker was down, or
// answered with an error). Ask for the failures of the last two hours again.
async function redeliverFailed(env: Env) {
  const jwt = await appJwt(env)
  const since = Date.now() - 2 * 3600_000
  const deliveries = (await api(jwt, 'GET', '/app/hook/deliveries?per_page=100')) as { id: string; guid: string; status_code: number; delivered_at: string }[]
  const handled = new Set(deliveries.filter((d) => d.status_code >= 200 && d.status_code < 300).map((d) => d.guid))
  for (const d of deliveries) {
    if (Date.parse(d.delivered_at) < since || handled.has(d.guid)) continue
    handled.add(d.guid)
    await api(jwt, 'POST', `/app/hook/deliveries/${d.id}/attempts`).catch((err) => console.error(`redeliver ${d.guid}: ${(err as Error).message}`))
  }
}
