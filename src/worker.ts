// ADT Backlog Wizard: a GitHub App on a Cloudflare Worker.
//
// GitHub sends the App's `projects_v2_item` webhook here when a card on an
// org Project changes. For cards on the Kanban Project (PROJECTS):
//
//   - a Status move runs the hand-off rules (rules/handoff.ts): credit and
//     unassign whoever finished a stage, assign whoever picked the card up,
//     tell the story at Done; and the block rules (rules/blocks.ts);
//   - a Block edit by a person copies the block to the issue's `block:` label.
//
// The webhook says who moved the card (sender) and from where to where, so the
// bot keeps no state: past credits are read back from its own comments.
// Everything it writes shows as the App (<slug>[bot]), with the App's
// permissions, on the repos it is installed on. See docs/FLOW.md.
//
// Hourly it asks GitHub to redeliver deliveries that failed, and puts back in
// step any card whose Block field and `block:` label differ.
//
// Secrets: WEBHOOK_SECRET, APP_PRIVATE_KEY (PKCS#8 PEM).
// Vars: APP_ID, BOT_LOGIN (<slug>[bot]), PROJECTS (comma-separated project node ids).
import { api, graphql, installationToken, appJwt, postComment, verifySignature, type AppEnv } from './github'
import { blockLabel, blockName, blockOnMove, isBlockLabel, reconcileBlock, type Block } from './rules/blocks'
import { columnFromStatusName } from './rules/flow'
import { creditsFromComments, handoff } from './rules/handoff'

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

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    if (request.method !== 'POST') return new Response('ADT Backlog Wizard: GitHub webhooks go to POST /github.\n')
    const body = await request.text()
    if (!(await verifySignature(env.WEBHOOK_SECRET, body, request.headers.get('x-hub-signature-256')))) return new Response('Bad signature', { status: 401 })

    const event = request.headers.get('x-github-event')
    if (event === 'ping') return new Response('pong')
    if (event !== 'projects_v2_item') return new Response(`Ignored: ${event}`, { status: 202 })

    const e = JSON.parse(body) as ItemEvent
    const item = e.projects_v2_item
    if (!item || !e.installation || !e.sender) return new Response('Ignored: no item', { status: 202 })
    if (!projects(env).includes(item.project_node_id)) return new Response('Ignored: another project', { status: 202 })
    if (item.content_type !== 'Issue') return new Response('Ignored: not an issue', { status: 202 })
    // The bot's own edits (the Block field it sets) come back as events too.
    if (e.sender.type === 'Bot' || e.sender.login === env.BOT_LOGIN) return new Response('Ignored: a bot', { status: 202 })
    if (e.action !== 'edited') return new Response(`Ignored: ${e.action}`, { status: 202 })

    // GitHub waits 10 s for an answer: answer now, do the work after.
    const delivery = request.headers.get('x-github-delivery') ?? '?'
    const run = (what: string, work: Promise<unknown>) => {
      ctx.waitUntil(work.catch((err) => console.error(`delivery ${delivery} (${what}): ${(err as Error).message}`)))
      return new Response(what, { status: 202 })
    }

    const change = e.changes?.field_value
    if (change?.field_name === BLOCK_FIELD) return run('Block edited: syncing the label', onBlockEdit(env, e.installation.id, item))
    if (change?.field_name !== STATUS_FIELD) return new Response('Ignored: not Status or Block', { status: 202 })
    const from = columnFromStatusName(change.from?.name)?.id
    const to = columnFromStatusName(change.to?.name)?.id
    if (!from || !to || from === to) return new Response(`Ignored: ${change.from?.name ?? 'none'} → ${change.to?.name ?? 'none'}`, { status: 202 })
    return run(`Moved: ${from} → ${to} by @${e.sender.login}`, onMove(env, e.installation.id, item, from, to, e.sender.login))
  },

  async scheduled(_controller: unknown, env: Env) {
    await redeliverFailed(env)
    await reconcileBlocks(env)
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
    content { ... on Issue { number state repository { nameWithOwner }
      assignees(first: 20) { nodes { login } }
      labels(first: 50) { nodes { name } }
      closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { reviews(states: APPROVED, first: 20) { nodes { author { login } } } } } } } } } }`

type Card = {
  itemId: string
  projectId: string
  number: number
  open: boolean
  repo: string // owner/name
  assignees: string[]
  labels: string[]
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
    number: issue.number,
    open: issue.state === 'OPEN',
    repo: issue.repository.nameWithOwner,
    assignees: issue.assignees.nodes.map((a: { login: string }) => a.login),
    labels: issue.labels.nodes.map((l: { name: string }) => l.name),
    approvers: [...new Set<string>(issue.closedByPullRequestsReferences.nodes.flatMap((pr: any) => pr.reviews.nodes.map((r: any) => r.author?.login).filter(Boolean)))],
    block: item.block?.title ?? null,
    blockField: f?.configuration ? { id: f.id, iterations: [...f.configuration.completedIterations, ...f.configuration.iterations] } : null,
  }
}

async function onMove(env: Env, installation: number, item: { node_id: string }, from: string, to: string, mover: string) {
  const token = await installationToken(env, installation)
  const card = await readCard(token, item.node_id)
  if (!card) return
  const issue = `/repos/${card.repo}/issues/${card.number}`

  // Past credits, from the bot's own comments only: anyone could paste the marker.
  const comments: { body: string | null; user: { login: string } | null }[] = []
  for (let page = 1; ; page++) {
    const batch = (await api(token, 'GET', `${issue}/comments?per_page=100&page=${page}`)) as typeof comments
    comments.push(...batch)
    if (batch.length < 100) break
  }
  const credits = creditsFromComments(comments.filter((c) => c.user?.login === env.BOT_LOGIN).map((c) => c.body ?? ''))

  const h = handoff({ from, to, assignees: card.assignees, mover, approvers: card.approvers, credits })
  console.log(`${card.repo}#${card.number} ${from} → ${to} by @${mover}: comment=${!!h.comment} unassign=[${h.unassign}] assign=[${h.assign}]`)
  if (h.comment) await postComment(token, issue, h.comment, env.BOT_LOGIN)
  if (h.unassign.length) await api(token, 'DELETE', `${issue}/assignees`, { assignees: h.unassign })
  if (h.assign.length) await api(token, 'POST', `${issue}/assignees`, { assignees: h.assign })

  const current = card.block ?? card.labels.find(isBlockLabel) ?? null
  const next = blockOnMove({ from, to, block: current ? blockName(current) : null, blocks: card.blockField?.iterations ?? [] })
  if (next !== undefined) await setBlock(token, card, next, { field: true })
}

// Someone set or cleared the Block field by hand: the label follows. (Hourly,
// the label wins over an empty field, so a clear has to be copied right away.)
async function onBlockEdit(env: Env, installation: number, item: { node_id: string }) {
  const token = await installationToken(env, installation)
  const card = await readCard(token, item.node_id)
  if (!card?.open) return
  if (card.block === null) await setBlock(token, card, null, { field: false })
  else await reconcileCard(token, card)
}

// ---------------------------------------------------------------------------
// Blocks: the Block field and the `block:` label say the same

async function reconcileCard(token: string, card: Card) {
  const r = reconcileBlock({ field: card.block, labels: card.labels })
  if (r.field !== undefined || r.addLabel || r.removeLabels.length) await setBlock(token, card, r.block, { field: r.field !== undefined })
}

async function setBlock(token: string, card: Card, name: string | null, opts: { field: boolean }) {
  const issue = `/repos/${card.repo}/issues/${card.number}`
  const want = name ? blockLabel(name) : null
  for (const l of card.labels.filter((l) => isBlockLabel(l) && l.toLowerCase() !== want?.toLowerCase())) {
    await api(token, 'DELETE', `${issue}/labels/${encodeURIComponent(l)}`)
  }
  if (want && !card.labels.some((l) => l.toLowerCase() === want.toLowerCase())) {
    await api(token, 'POST', `/repos/${card.repo}/labels`, { name: want, color: 'c5def5', description: 'Sprint block this work is planned in' }).catch(() => {
      // 422: the label already exists in the repo.
    })
    await api(token, 'POST', `${issue}/labels`, { labels: [want] })
  }
  console.log(`${card.repo}#${card.number} block → ${name ?? 'none'}${opts.field ? ' (label and field)' : ' (label)'}`)
  if (!opts.field || !card.blockField) return
  const iteration = name ? card.blockField.iterations.find((b) => blockName(b.title).toLowerCase() === name.toLowerCase()) : null
  if (name && !iteration) return // a block the Project does not have: label only
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

// A `block:` label added by hand fills the Block field in; the bot hears no
// event for labels, so it looks once an hour.
async function reconcileBlocks(env: Env) {
  const jwt = await appJwt(env)
  for (const inst of (await api(jwt, 'GET', '/app/installations')) as { id: number }[]) {
    const token = await installationToken(env, inst.id)
    for (const projectId of projects(env)) {
      let after: string | null = null
      do {
        const page: any = await graphql(
          token,
          `query($p: ID!, $after: String) { node(id: $p) { ... on ProjectV2 { items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor } nodes { id content { ... on Issue { state } } } } } } }`,
          { p: projectId, after },
        ).catch(() => null) // a Project this installation cannot see
        const items = page?.node?.items
        if (!items) break
        for (const it of items.nodes) {
          if (it.content?.state !== 'OPEN') continue
          const card = await readCard(token, it.id)
          if (card) await reconcileCard(token, card).catch((err) => console.error(`${card.repo}#${card.number} block: ${(err as Error).message}`))
        }
        after = items.pageInfo.hasNextPage ? items.pageInfo.endCursor : null
      } while (after)
    }
  }
}
