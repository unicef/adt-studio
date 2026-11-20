import fs from "node:fs"
import path from "node:path"

const [bookDir, writerPidArg, mode, outFile, extraPidsArg = ""] = process.argv.slice(2)
const writerPid = Number(writerPidArg)
const extraPids = extraPidsArg.split(",").filter(Boolean).map(Number)
const lockName = ".book-writer.json"
const mutex = `${path.basename(bookDir)}.db.lock`
const deadline = Date.now() + 90_000
const randomSpinMicros = Math.floor(Math.random() * 20_000)

const leaseArtifacts = () => fs.readdirSync(bookDir).filter(n => n.startsWith(lockName) || n.endsWith(".db.lock"))
const ownedByWriter = () => {
  try { return JSON.parse(fs.readFileSync(path.join(bookDir, lockName), "utf8")).pid === writerPid } catch { return false }
}
const triggers = {
  acquire: (names) => names.some(n => n === `${lockName}.recovery` || n.startsWith(`${lockName}.recovery.`)),
  publish: (names) => names.some(n => /^\.book-writer\.json\.preparing-/.test(n)),
  held: (names) => names.includes(lockName) && names.includes(mutex) && ownedByWriter(),
  random: (names) => names.length > 0,
}
const trigger = triggers[mode]
fs.writeFileSync(outFile + ".ready", String(process.pid))

let names
for (;;) {
  if (Date.now() > deadline) { fs.writeFileSync(outFile, JSON.stringify({ killed: false, mode })); process.exit(2) }
  try { names = leaseArtifacts() } catch { continue }
  if (trigger(names)) break
}
if (mode === "random") {
  const until = process.hrtime.bigint() + BigInt(randomSpinMicros) * 1000n
  while (process.hrtime.bigint() < until) { }
}
let atKill
try { atKill = leaseArtifacts() } catch { atKill = names }
const leaseAtKill = (() => { try { return fs.readFileSync(path.join(bookDir, lockName), "utf8") } catch { return null } })()
const killedAt = new Date().toISOString()
let killError
try { process.kill(writerPid, "SIGKILL") } catch (e) { killError = e.code }
for (const pid of extraPids) { try { process.kill(pid, "SIGKILL") } catch { } }
let afterKill
try { afterKill = leaseArtifacts() } catch (e) { afterKill = [`readdir error ${e.code}`] }
fs.writeFileSync(outFile, JSON.stringify({ killed: !killError, killError, mode, randomSpinMicros: mode === "random" ? randomSpinMicros : undefined, killedAt, triggerArtifacts: names, artifactsAtKill: atKill, leaseAtKill, artifactsAfterKill: afterKill }))
process.exit(0)
