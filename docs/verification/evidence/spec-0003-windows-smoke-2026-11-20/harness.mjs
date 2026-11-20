import { spawn, execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const TARGET = process.argv[2] ?? "api"
const REPS = Number(process.argv[3] ?? 3)
const REPO = path.resolve(process.env.ADT_REPO ?? process.cwd())
const S = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(process.env.WIN1_OUT ?? path.join(os.tmpdir(), "adt-win1-smoke"))
const RUN = path.join(OUT, `${TARGET}-${new Date().toISOString().replace(/[:.]/g, "-")}`)
const LABEL = "Education_Activities_v2"
const FIXTURE = path.join(REPO, "books", LABEL)
const STORAGE_DIST = path.join(REPO, "packages", "storage", "dist", "index.js")
const SQLITE_FROM = path.join(REPO, "packages", "storage", "package.json")
const DESKTOP_DIR = path.join(REPO, "apps", "desktop", "release", "win-unpacked")
const USER_DATA = path.join(RUN, "desktop-user-data")
const BOOKS = TARGET === "desktop" ? path.join(USER_DATA, "books") : path.join(RUN, "books")
const BOOK = path.join(BOOKS, LABEL)
const LEASE = path.join(BOOK, ".book-writer.json")
fs.mkdirSync(BOOKS, { recursive: true })

const results = { target: TARGET, env: {}, checks: [], notes: [], cycles: [], transient: [] }
const check = (id, pass, detail) => {
  results.checks.push({ id, pass: !!pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${id}${detail === undefined ? "" : " " + JSON.stringify(detail).slice(0, 400)}`)
  return !!pass
}
const note = (text) => { results.notes.push(text); console.log(`NOTE ${text}`) }
const delay = (ms) => new Promise(r => setTimeout(r, ms))
const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === "EPERM" } }
const ps = (cmd) => { try { return execFileSync("powershell.exe", ["-NoProfile", "-Command", cmd], { encoding: "utf8" }).trim() } catch (e) { return `ERROR: ${(e.stderr || e.message).toString().trim().split("\n")[0]}` } }
const psJson = (cmd) => { const out = ps(cmd); try { return JSON.parse(out) } catch { return out } }
const artifacts = (dir = BOOK) => fs.readdirSync(dir).filter(n => n.startsWith(".book-writer.json") || n.endsWith(".db.lock")).sort()
const blockingArtifacts = (dir = BOOK) => artifacts(dir).filter(n => {
  if (n === ".book-writer.json" || n.endsWith(".db.lock")) return true
  const full = path.join(dir, n)
  return !(fs.lstatSync(full).isDirectory() && fs.readdirSync(full).length === 0)
})
const isDbFamily = (rel) => /\.db(-wal|-journal|-shm)?$/.test(rel) && !rel.includes("\\")
const isLease = (rel) => rel.startsWith(".book-writer.json") || /\.db\.lock(\\|$)/.test(rel)

function snapshotFiles(dir) {
  const out = {}
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      const rel = path.relative(dir, full)
      if (isLease(rel) || isDbFamily(rel)) continue
      if (e.isDirectory()) walk(full)
      else out[rel] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex")
    }
  }
  walk(dir)
  return out
}
function diffFiles(a, b) {
  const changed = [], removed = [], added = []
  for (const k of Object.keys(a)) if (!(k in b)) removed.push(k); else if (a[k] !== b[k]) changed.push(k)
  for (const k of Object.keys(b)) if (!(k in a)) added.push(k)
  return { changed, removed, added }
}
const sameFiles = (d) => !d.changed.length && !d.removed.length && !d.added.length
let snapCount = 0
function dbSnap(tag, bookDir = BOOK, label = LABEL) {
  const out = path.join(RUN, `db-${String(++snapCount).padStart(2, "0")}-${tag}.json`)
  execFileSync(process.execPath, [path.join(S, "dbsnap.mjs"), SQLITE_FROM, path.join(bookDir, `${label}.db`), out], { stdio: "inherit" })
  return JSON.parse(fs.readFileSync(out, "utf8"))
}
function rowsPreserved(before, after) {
  const lost = {}
  for (const [table, rows] of Object.entries(before.tables)) {
    if (table === "node_current") continue
    const set = new Set(after.tables[table] ?? [])
    const n = rows.filter(h => !set.has(h)).length
    if (n) lost[table] = n
  }
  return lost
}
const titles = (snap) => snap.metadata.map(m => m.title)

async function call(base, method, p, body) {
  const res = await fetch(base + p, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json; try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, json }
}
const busy = (r) => r.status === 409 && JSON.stringify(r.json).includes("BOOK_BUSY")
const titleOf = (r) => r.json?.title
let meta = {}
const editBody = (title) => ({ title, authors: meta.authors ?? [], publisher: meta.publisher ?? null, language_code: meta.languageCode ?? meta.language_code ?? null })

async function waitHttp(base, ms = 120_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if ((await fetch(`${base}/books`)).status === 200) return true } catch { }
    await delay(300)
  }
  return false
}

let launchCount = 0
const apiTarget = {
  async launch(booksDir = BOOKS, tag = "") {
    const n = ++launchCount
    const port = 3730 + n
    const logFile = path.join(RUN, `launch-${String(n).padStart(2, "0")}${tag}.log`)
    const log = fs.openSync(logFile, "w")
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: path.join(REPO, "apps", "api"),
      env: { ...process.env, BOOKS_DIR: booksDir, PORT: String(port) },
      stdio: ["ignore", log, log],
    })
    const exited = new Promise(r => child.on("exit", (code, signal) => r({ code, signal })))
    const base = `http://127.0.0.1:${port}/api`
    if (!await waitHttp(base)) throw new Error(`API launch ${n} did not start`)
    return {
      n, base, logFile, writerPid: child.pid, crashPids: [], exited,
      async close() {
        execFileSync("taskkill", ["/F", "/PID", String(child.pid)], { stdio: "pipe" })
        return { graceful: false, how: "TerminateProcess at idle (bare API has no window to close)", exit: await Promise.race([exited, delay(15000).then(() => "timeout")]) }
      },
      async afterCrash() { return { exit: await Promise.race([exited, delay(15000).then(() => "timeout")]) } },
    }
  },
}

const desktopExe = () => {
  const exe = fs.readdirSync(DESKTOP_DIR).find(n => n.endsWith(".exe") && !/^uninstall/i.test(n) && !/^elevate/i.test(n))
  return path.join(DESKTOP_DIR, exe)
}
const desktopProcesses = () => {
  const out = psJson(`@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${USER_DATA.replaceAll("'", "''")}*' } | Select-Object ProcessId,ParentProcessId,CommandLine) | ConvertTo-Json -Compress`)
  return Array.isArray(out) ? out : out && typeof out === "object" ? [out] : []
}
const desktopTarget = {
  async launch() {
    const n = ++launchCount
    const logFile = path.join(RUN, `launch-${String(n).padStart(2, "0")}-desktop.log`)
    const log = fs.createWriteStream(logFile)
    const child = spawn(desktopExe(), [`--user-data-dir=${USER_DATA}`], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } })
    const exited = new Promise(r => child.on("exit", (code, signal) => r({ code, signal })))
    let port
    const onData = (d) => { log.write(d); const m = d.toString().match(/API server running on http:\/\/localhost:(\d+)/); if (m) port = Number(m[1]) }
    child.stdout.on("data", onData)
    child.stderr.on("data", onData)
    const end = Date.now() + 120_000
    let writerPid
    while (Date.now() < end && !writerPid) {
      await delay(500)
      const utility = desktopProcesses().find(p => p.ParentProcessId === child.pid && /--type=utility/.test(p.CommandLine) && /node\.mojom\.NodeService/.test(p.CommandLine))
      if (!utility) continue
      if (!port) {
        const listen = psJson(`@(Get-NetTCPConnection -State Listen -OwningProcess ${utility.ProcessId} -ErrorAction SilentlyContinue | Select-Object LocalPort) | ConvertTo-Json -Compress`)
        const ports = (Array.isArray(listen) ? listen : listen && typeof listen === "object" ? [listen] : []).map(l => l.LocalPort)
        if (ports.length) port = ports[0]
      }
      if (port) writerPid = utility.ProcessId
    }
    if (!writerPid) throw new Error(`desktop launch ${n}: API utility process/port not found`)
    const base = `http://127.0.0.1:${port}/api`
    if (!await waitHttp(base)) throw new Error(`desktop launch ${n}: API not ready`)
    const killStragglers = () => {
      const left = desktopProcesses().filter(p => alive(p.ProcessId))
      for (const p of left) { try { process.kill(p.ProcessId, "SIGKILL") } catch { } }
      return left.length
    }
    return {
      n, base, logFile, writerPid, mainPid: child.pid, crashPids: [child.pid], exited,
      async close() {
        try { execFileSync("taskkill", ["/PID", String(child.pid)], { stdio: "pipe" }) } catch (e) { note(`graceful taskkill error: ${String(e.stderr ?? e.message).trim()}`) }
        const exit = await Promise.race([exited, delay(30000).then(() => "timeout")])
        const graceful = exit !== "timeout"
        if (!graceful) { try { execFileSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "pipe" }) } catch { } }
        await delay(1500)
        return { graceful, how: "WM_CLOSE via taskkill without /F", exit, apiGone: !alive(writerPid), stragglersKilled: killStragglers() }
      },
      async afterCrash(kind) {
        if (kind === "api") {
          await delay(2000)
          const mainAlive = alive(child.pid)
          const closed = mainAlive ? await this.close() : { exit: await exited }
          return { kind, mainSurvivedApiKill: mainAlive, closed }
        }
        const exit = await Promise.race([exited, delay(15000).then(() => "timeout")])
        await delay(1500)
        return { kind, exit, stragglersKilled: killStragglers() }
      },
    }
  },
}
const target = TARGET === "desktop" ? desktopTarget : apiTarget

function scanTransient(logFile) {
  const text = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : ""
  return text.split(/\r?\n/).filter(l => /EPERM|EBUSY|EACCES|temporarily unavailable|ownership changed|could not be (recovered|released)/i.test(l)).slice(0, 50)
}

async function editBurst(app, watcherDone, label) {
  const acked = [], refusals = []
  let inflight, transportError
  for (let i = 1; i <= 5000; i++) {
    if (watcherDone.value) break
    inflight = `${label} burst ${i}`
    try {
      const r = await call(app.base, "PUT", `/books/${LABEL}/metadata`, editBody(inflight))
      if (r.status === 200) acked.push(inflight)
      else { refusals.push({ i, status: r.status, body: JSON.stringify(r.json).slice(0, 300) }); inflight = undefined }
    } catch (e) { transportError = String(e.cause?.code ?? e.message); break }
  }
  return { acked, refusals, inflight, transportError }
}

async function openWithPatience(app) {
  const attempts = []
  for (let i = 0; i < 5; i++) {
    const r = await call(app.base, "GET", `/books/${LABEL}`)
    attempts.push(r.status)
    if (r.status === 200) return { r, attempts }
    await delay(2000)
  }
  return { r: await call(app.base, "GET", `/books/${LABEL}`), attempts }
}

async function crashCycle(app, mode, kind, index, history, files) {
  const id = `CYCLE-${String(index).padStart(2, "0")}-${mode}${TARGET === "desktop" ? `-${kind}` : ""}`
  const out = path.join(RUN, `${id}.watcher.json`)
  const extra = kind === "app" ? app.crashPids : []
  const watcher = spawn(process.execPath, [path.join(S, "watcher.mjs"), BOOK, String(app.writerPid), mode, out, extra.join(",")], { stdio: "inherit" })
  const watcherDone = { value: false }
  const watcherExit = new Promise(r => watcher.on("exit", c => { watcherDone.value = true; r(c) }))
  while (!fs.existsSync(out + ".ready")) await delay(10)
  const burst = await editBurst(app, watcherDone, id)
  const watcherCode = await watcherExit
  const kill = JSON.parse(fs.readFileSync(out, "utf8"))
  const cycle = { id, mode, kind, watcherCode, kill, acked: burst.acked.length, refusals: burst.refusals, inflight: burst.inflight, transportError: burst.transportError }
  results.cycles.push(cycle)
  if (!kill.killed) {
    note(`${id}: phase not observed within the watcher window (${burst.acked.length} edits acked); app left running`)
    for (const t of burst.acked) history.push(t)
    return { app, observed: false }
  }
  const after = await app.afterCrash(kind)
  cycle.after = after
  cycle.transientLogLines = scanTransient(app.logFile)
  if (burst.refusals.length || cycle.transientLogLines.length) results.transient.push({ id, refusals: burst.refusals, logLines: cycle.transientLogLines })
  check(`${id}-writer-killed`, !alive(app.writerPid), { atKill: kill.artifactsAtKill, afterKill: kill.artifactsAfterKill, acked: burst.acked.length, transportError: burst.transportError })
  cycle.leftOnDisk = artifacts()

  const snap = dbSnap(id)
  const prefix = [...history, ...burst.acked]
  const got = titles(snap)
  const okHistory = JSON.stringify(got) === JSON.stringify(prefix) || (burst.inflight && JSON.stringify(got) === JSON.stringify([...prefix, burst.inflight]))
  check(`${id}-db-integrity`, snap.integrity.join() === "ok", snap.integrity)
  check(`${id}-history-atomic`, okHistory, { tail: got.slice(-3), lastAcked: burst.acked.at(-1), inflight: burst.inflight })
  check(`${id}-versioned-rows-preserved`, Object.keys(rowsPreserved(results.lastSnap, snap)).length === 0, rowsPreserved(results.lastSnap, snap))
  check(`${id}-media-and-files-preserved`, sameFiles(diffFiles(files, snapshotFiles(BOOK))), diffFiles(files, snapshotFiles(BOOK)))
  history.splice(0, history.length, ...got)
  results.lastSnap = snap

  const next = await target.launch()
  const { r: opened, attempts } = await openWithPatience(next)
  cycle.reopenAttempts = attempts
  if (!check(`${id}-reopen-not-BOOK_BUSY`, opened.status === 200, { attempts, leftOnDisk: cycle.leftOnDisk, body: opened.status === 200 ? undefined : opened.json })) {
    const copy = await call(next.base, "POST", `/books/${LABEL}/recover-copy`, { label: `win1-${id.toLowerCase()}-copy`, preserveOriginal: true })
    cycle.recoverCopy = copy
    note(`${id}: reopen refused; Recover a copy -> ${copy.status}`)
    return { app: next, observed: true, stuck: true }
  }
  check(`${id}-reopen-shows-last-committed`, titleOf(opened) === history.at(-1), { title: titleOf(opened) })
  check(`${id}-no-blocking-artifacts-after-reopen`, blockingArtifacts().length === 0, artifacts())
  cycle.leftAfterReopen = artifacts()
  const post = `${id} post-restart edit`
  const e = await call(next.base, "PUT", `/books/${LABEL}/metadata`, editBody(post))
  const seen = await call(next.base, "GET", `/books/${LABEL}`)
  check(`${id}-edit-after-restart`, e.status === 200 && titleOf(seen) === post, { status: e.status, title: titleOf(seen) })
  history.push(post)
  return { app: next, observed: true }
}

async function liveOwnerControl(app, history, files) {
  const releaseFile = path.join(RUN, "holder.release")
  const holder = spawn(process.execPath, [path.join(S, "holder.mjs"), STORAGE_DIST, BOOK, releaseFile], { stdio: ["ignore", "pipe", "inherit"] })
  const holderExit = new Promise(r => holder.on("exit", (code, signal) => r({ code, signal })))
  const held = await new Promise((resolve, reject) => {
    holder.stdout.on("data", d => { const line = d.toString().split("\n").find(l => l.includes("held")); if (line) resolve(JSON.parse(line)) })
    holder.on("exit", c => reject(new Error(`holder exited ${c}`)))
  })
  const leaseHeld = fs.readFileSync(LEASE, "utf8")
  check("LIVE-holder-lease-published", JSON.parse(leaseHeld).pid === held.pid)
  const before = snapshotFiles(BOOK)
  check("LIVE-open-refused", busy(await call(app.base, "GET", `/books/${LABEL}`)))
  check("LIVE-edit-refused", busy(await call(app.base, "PUT", `/books/${LABEL}/metadata`, editBody("LIVE SHOULD NOT LAND"))))
  const copy = await call(app.base, "POST", `/books/${LABEL}/recover-copy`, { label: "win1-live-copy", preserveOriginal: true })
  check("LIVE-recover-copy-refused", busy(copy), copy)
  check("LIVE-no-copy-created", !fs.existsSync(path.join(BOOKS, "win1-live-copy")))
  check("LIVE-lease-bytes-unchanged", fs.readFileSync(LEASE, "utf8") === leaseHeld)
  check("LIVE-files-unchanged", sameFiles(diffFiles(before, snapshotFiles(BOOK))))
  process.kill(held.pid, "SIGKILL")
  await Promise.race([holderExit, delay(10000)])
  check("LIVE-holder-killed-lease-retained", !alive(held.pid) && fs.existsSync(LEASE) && JSON.parse(fs.readFileSync(LEASE, "utf8")).pid === held.pid)
  const after = await call(app.base, "GET", `/books/${LABEL}`)
  check("LIVE-dead-holder-reclaimed-by-running-app", after.status === 200 && titleOf(after) === history.at(-1), { status: after.status, title: titleOf(after) })
  check("LIVE-no-blocking-artifacts", blockingArtifacts().length === 0, artifacts())
  check("LIVE-not-landed", !JSON.stringify(after.json).includes("LIVE SHOULD NOT LAND"))
  void files
}

async function injectedCases() {
  for (const kind of ["live-pid", "unverifiable"]) {
    const books = path.join(RUN, `books-${kind}`)
    const dir = path.join(books, LABEL)
    fs.cpSync(FIXTURE, dir, { recursive: true })
    const lease = path.join(dir, ".book-writer.json")
    const bytes = kind === "live-pid"
      ? JSON.stringify({ token: crypto.randomUUID(), pid: process.pid, host: os.hostname(), coordinatedDatabases: [`${LABEL}.db`] })
      : '{"legacy-owner":'
    fs.writeFileSync(lease, bytes)
    const before = snapshotFiles(dir)
    const app = await apiTarget.launch(books, `-${kind}`)
    const tag = kind === "live-pid" ? "PIDREUSE" : "UNVERIFIABLE"
    check(`${tag}-open-refused`, busy(await call(app.base, "GET", `/books/${LABEL}`)))
    const copy = await call(app.base, "POST", `/books/${LABEL}/recover-copy`, { label: `win1-${kind}-copy`, preserveOriginal: true })
    if (kind === "live-pid") {
      check(`${tag}-recover-copy-refused`, busy(copy), copy)
      check(`${tag}-no-copy-created`, !fs.existsSync(path.join(books, `win1-${kind}-copy`)))
    } else {
      check(`${tag}-recover-copy-201`, copy.status === 201, copy)
      const copyDir = path.join(books, `win1-${kind}-copy`)
      const opened = await call(app.base, "GET", `/books/win1-${kind}-copy`)
      check(`${tag}-copy-opens`, opened.status === 200, opened.status)
      const cf = Object.fromEntries(Object.entries(snapshotFiles(copyDir)).map(([k, v]) => [k === `win1-${kind}-copy.pdf` ? `${LABEL}.pdf` : k, v]))
      const missing = Object.keys(before).filter(k => !(k in cf))
      const differing = Object.keys(before).filter(k => k in cf && cf[k] !== before[k])
      const extra = Object.keys(cf).filter(k => !(k in before))
      check(`${tag}-copy-complete-and-identical`, !missing.length && !differing.length, { missing, differing })
      check(`${tag}-copy-keeps-quarantined-evidence-and-audit`, extra.some(k => /\.book-recovery-[^\\]+\\audit\.json$/.test(k)) && extra.some(k => /\\locks\\\.book-writer\.json$/.test(k)), extra)
      const copyDb = dbSnap(`${kind}-copy`, copyDir, `win1-${kind}-copy`)
      check(`${tag}-copy-db-integrity`, copyDb.integrity.join() === "ok")
    }
    check(`${tag}-original-lease-bytes-preserved`, fs.readFileSync(lease, "utf8") === bytes)
    check(`${tag}-original-files-unchanged`, sameFiles(diffFiles(before, snapshotFiles(dir))))
    check(`${tag}-original-still-refused`, busy(await call(app.base, "GET", `/books/${LABEL}`)))
    await app.close()
    note(`${tag}: injected lease left in place in its disposable copy (no lock was deleted)`)
  }
}

function redact(text) {
  const user = os.userInfo().username
  const pairs = [[RUN, "<run>"], [S, "<scratch>"], [REPO, "<repo>"], [os.homedir(), "<home>"], [os.hostname(), "<host>"], [user, "<user>"]]
  let out = text
  for (const [from, to] of pairs) {
    out = out.split(from).join(to).split(from.replaceAll("\\", "\\\\")).join(to).split(from.replaceAll("\\", "/")).join(to)
  }
  return out
}

async function main() {
  const os_ = psJson("Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture | ConvertTo-Json -Compress")
  const drive = RUN.slice(0, 1)
  results.env = {
    when: new Date().toISOString(),
    windows: os_,
    filesystem: psJson(`Get-Volume -DriveLetter ${drive} | Select-Object DriveLetter,FileSystem,DriveType | ConvertTo-Json -Compress`),
    node: process.version,
    git: execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    branch: execFileSync("git", ["-C", REPO, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim(),
    worktreeChanges: execFileSync("git", ["-C", REPO, "status", "--short"], { encoding: "utf8" }).trim(),
    defender: psJson("Get-MpComputerStatus | Select-Object AMServiceEnabled,AntivirusEnabled,RealTimeProtectionEnabled,OnAccessProtectionEnabled,BehaviorMonitorEnabled,IoavProtectionEnabled,IsTamperProtected,AMProductVersion,AntivirusSignatureVersion | ConvertTo-Json -Compress"),
    defenderExclusions: ps("(Get-MpPreference).ExclusionPath -join ';'"),
    controlledFolderAccess: ps("(Get-MpPreference).EnableControlledFolderAccess"),
  }
  if (TARGET === "desktop") {
    const exe = desktopExe()
    results.env.desktop = {
      exe: path.basename(exe),
      exeVersion: psJson(`(Get-Item '${exe}').VersionInfo | Select-Object FileVersion,ProductVersion | ConvertTo-Json -Compress`),
      electron: JSON.parse(fs.readFileSync(path.join(REPO, "apps", "desktop", "node_modules", "electron", "package.json"), "utf8")).version,
      builtAt: fs.statSync(path.join(DESKTOP_DIR, "resources")).mtime.toISOString(),
    }
  }
  console.log(JSON.stringify(results.env, null, 1))
  check("ENV-defender-realtime-on", results.env.defender.RealTimeProtectionEnabled === true && results.env.defender.AntivirusEnabled === true)

  fs.cpSync(FIXTURE, BOOK, { recursive: true })
  const snap0 = dbSnap("initial")
  results.lastSnap = snap0
  const history = titles(snap0)

  console.log("\n== Open, edit, close, reopen")
  let app = await target.launch()
  note(`launch ${app.n}: writer pid ${app.writerPid}`)
  const opened = await call(app.base, "GET", `/books/${LABEL}`)
  check("BASE-open", opened.status === 200 && blockingArtifacts().length === 0, opened.status)
  meta = opened.json
  const baseTitle = "WIN1 close-reopen edit"
  const e = await call(app.base, "PUT", `/books/${LABEL}/metadata`, editBody(baseTitle))
  check("BASE-edit-saved", e.status === 200 && titleOf(await call(app.base, "GET", `/books/${LABEL}`)) === baseTitle, e.status)
  history.push(baseTitle)
  const closed = await app.close()
  check("BASE-close", closed.exit !== "timeout" && !alive(app.writerPid), closed)
  check("BASE-close-left-no-lease", artifacts().length === 0, artifacts())
  const snap1 = dbSnap("after-close")
  check("BASE-history-after-close", JSON.stringify(titles(snap1)) === JSON.stringify(history), titles(snap1))
  check("BASE-rows-preserved", Object.keys(rowsPreserved(snap0, snap1)).length === 0, rowsPreserved(snap0, snap1))
  results.lastSnap = snap1
  const files = snapshotFiles(BOOK)
  note(`tracked non-DB files (media, PDF, assets, cache): ${Object.keys(files).length}`)
  app = await target.launch()
  const reopened = await call(app.base, "GET", `/books/${LABEL}`)
  check("BASE-reopen-shows-edit", reopened.status === 200 && titleOf(reopened) === baseTitle, titleOf(reopened))
  check("BASE-media-intact-after-reopen", sameFiles(diffFiles(files, snapshotFiles(BOOK))))

  console.log("\n== Kill/restart cycles")
  const modes = ["acquire", "publish", "held", "random"]
  let index = 0
  for (let rep = 0; rep < REPS; rep++) {
    for (const mode of modes) {
      const kind = TARGET === "desktop" ? (index % 2 === 0 ? "app" : "api") : "process"
      const res = await crashCycle(app, mode, kind, ++index, history, files)
      app = res.app
      if (res.stuck) { note("stopping cycles: book left BOOK_BUSY"); rep = REPS; break }
    }
  }

  console.log("\n== Known-live-owner control")
  await liveOwnerControl(app, history, files)

  console.log("\n== Final close")
  const fin = await app.close()
  check("FINAL-close", fin.exit !== "timeout", fin)
  check("FINAL-no-lease-left", artifacts().length === 0, artifacts())
  const last = dbSnap("final")
  check("FINAL-db-integrity", last.integrity.join() === "ok")
  check("FINAL-history-equals-every-committed-edit-in-order", JSON.stringify(titles(last)) === JSON.stringify(history), { versions: last.metadata.length, current: last.currentMetadataVersion })
  check("FINAL-current-pointer-is-latest", last.currentMetadataVersion === last.metadata.at(-1).version)
  check("FINAL-no-versioned-row-lost-since-start", Object.keys(rowsPreserved(snap0, last)).length === 0, rowsPreserved(snap0, last))
  check("FINAL-media-and-files-preserved", sameFiles(diffFiles(files, snapshotFiles(BOOK))), diffFiles(files, snapshotFiles(BOOK)))

  if (TARGET === "api") {
    console.log("\n== Injected ownership cases on separate disposable copies")
    await injectedCases()
  }
}

try { await main() } catch (e) { check("HARNESS-error", false, String(e.stack ?? e)) }
delete results.lastSnap
const observed = results.cycles.reduce((acc, c) => {
  const k = c.mode
  acc[k] ??= { attempted: 0, killed: 0, leaseArtifactsAtKill: [] }
  acc[k].attempted++
  if (c.kill.killed) { acc[k].killed++; acc[k].leaseArtifactsAtKill.push(c.kill.artifactsAtKill) }
  return acc
}, {})
results.phaseSummary = observed
fs.writeFileSync(path.join(RUN, "results.json"), redact(JSON.stringify(results, null, 2)))
for (const f of fs.readdirSync(RUN).filter(f => f.endsWith(".log"))) fs.writeFileSync(path.join(RUN, f.replace(/\.log$/, ".redacted.log")), redact(fs.readFileSync(path.join(RUN, f), "utf8")))
const failed = results.checks.filter(c => !c.pass)
console.log(`\nphases: ${JSON.stringify(Object.fromEntries(Object.entries(observed).map(([k, v]) => [k, `${v.killed}/${v.attempted}`])))}`)
console.log(`transient: ${JSON.stringify(results.transient).slice(0, 600)}`)
console.log(`${results.checks.length - failed.length}/${results.checks.length} checks passed. Results: ${path.join(RUN, "results.json")}`)
process.exit(failed.length ? 1 : 0)
