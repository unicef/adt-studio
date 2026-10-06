// Talks to GitHub as the App, to check a deployment. No dependencies.
//
//   APP_ID=123 APP_KEY=path/to/app.private-key.pem node scripts/app.mjs <command>
//
//   info              the App: owner, events, permissions, and where it is installed
//   deliveries        the last webhook deliveries and the Worker's answer to each
//   ping              ask GitHub to redeliver the most recent ping (checks URL and secret)
//   redeliver <id>    ask GitHub to redeliver one delivery
//
// Prints nothing secret. The key can be GitHub's download (PKCS#1) or PKCS#8.
import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'

const { APP_ID, APP_KEY } = process.env
if (!APP_ID || !APP_KEY) {
  console.error('Set APP_ID and APP_KEY (path to the private key .pem).')
  process.exit(1)
}

const now = Math.floor(Date.now() / 1000)
const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat: now - 60, exp: now + 300, iss: APP_ID })}`
const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(readFileSync(APP_KEY, 'utf8'), 'base64url')}`

async function api(path, method = 'GET') {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json', 'user-agent': 'adt-kanban-bot-check' },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`)
  // Delivery ids do not fit in a JS number: keep long ids as strings.
  return text ? JSON.parse(text.replace(/"id":(\d{16,})/g, '"id":"$1"')) : null
}

const [command, arg] = process.argv.slice(2)
const deliveries = () => api('/app/hook/deliveries?per_page=20')

if (command === 'info') {
  const app = await api('/app')
  console.log(`App ${app.slug} (id ${app.id}), owned by ${app.owner?.login}; the bot is ${app.slug}[bot]`)
  console.log(`Events: ${app.events.join(', ') || 'none'}`)
  console.log(`Permissions: ${Object.entries(app.permissions).map(([k, v]) => `${k}:${v}`).join(', ')}`)
  for (const i of await api('/app/installations')) console.log(`Installed on ${i.account.login} (installation ${i.id}, repos: ${i.repository_selection})`)
} else if (command === 'deliveries') {
  for (const d of await deliveries()) console.log(`${d.delivered_at}  ${d.event}${d.action ? '.' + d.action : ''}  →  ${d.status_code} ${d.status}${d.redelivery ? '  (redelivery)' : ''}  id=${d.id}`)
} else if (command === 'ping') {
  const ping = (await deliveries()).find((d) => d.event === 'ping')
  if (!ping) throw new Error('No ping delivery found: GitHub sends one when the webhook is set up.')
  await api(`/app/hook/deliveries/${ping.id}/attempts`, 'POST')
  console.log('Ping redelivered. In a few seconds, `deliveries` shows the answer: 200 means the URL and the secret are right.')
} else if (command === 'redeliver' && arg) {
  await api(`/app/hook/deliveries/${arg}/attempts`, 'POST')
  console.log(`Delivery ${arg} redelivered.`)
} else {
  console.error('Commands: info | deliveries | ping | redeliver <id>')
  process.exit(1)
}
