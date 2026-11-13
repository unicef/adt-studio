import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { BookBusyError, withBookWriter } from "../book-writer.js"

let dir: string
const children: ChildProcess[] = []
beforeEach(() => { dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "adt-writer-recovery-"))) })
afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit"); child.kill("SIGKILL"); await exited
  }
  fs.rmSync(dir, { recursive: true, force: true })
})

// Intercept filesystem boundaries in a real process: SIGKILL cannot run finally.
it.each(["read", "write"])("recovers a %s killed immediately after reserving admission", async kind => {
  const recovery = path.join(dir, ".book-writer.json.recovery")
  const paused = path.join(dir, "paused")
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import fs from 'node:fs';
    import {withBookWriter, retainBookDatabase} from ${JSON.stringify(path.resolve("packages/storage/dist/book-writer.js"))};
    function stop() {
      fs.writeFileSync(${JSON.stringify(paused)}, 'reserved');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);
      throw new Error('barrier timeout');
    }
    const open=fs.openSync, rename=fs.renameSync;
    fs.openSync=function(file,...args) {
      const result=open.call(fs,file,...args);
      if(String(file)===${JSON.stringify(recovery)} && args[0]==='wx') stop();
      return result;
    };
    fs.renameSync=function(from,to) {
      const result=rename.call(fs,from,to);
      if(String(to)===${JSON.stringify(recovery)}) stop();
      return result;
    };
    ${kind === "read" ? `retainBookDatabase(${JSON.stringify(path.join(dir, "book.db"))})()` : `withBookWriter(${JSON.stringify(dir)},()=>{})`};
  `], { stdio: ["ignore", "pipe", "pipe"] })
  children.push(child)
  let stderr = ""; child.stderr!.on("data", data => { stderr += data })
  await vi.waitFor(() => {
    if (child.exitCode !== null) throw new Error(`Child exited before barrier: ${stderr}`)
    expect(fs.existsSync(paused)).toBe(true)
  }, { timeout: 3000 })
  expect(() => withBookWriter(dir, () => "unsafe")).toThrow("BOOK_BUSY")
  const exited = once(child, "exit"); child.kill("SIGKILL"); await exited
  expect(withBookWriter(dir, () => "recovered")).toBe("recovered")
  expect(fs.existsSync(recovery)).toBe(false)
})

async function pausedAdmission(boundary: string, resume?: string) {
  const marker = path.join(dir, `paused-${children.length}`)
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import fs from 'node:fs';
    import {retainBookDatabase,withBookWriter} from ${JSON.stringify(path.resolve("packages/storage/dist/book-writer.js"))};
    const lock=${JSON.stringify(path.join(dir, ".book-writer.json"))};
    const recovery=lock+'.recovery'; let owners=0;
    function stop() {
      fs.writeFileSync(${JSON.stringify(marker)},'paused');
      if (${JSON.stringify(resume ?? "")}) {
        const deadline=Date.now()+10000;
        while(!fs.existsSync(${JSON.stringify(resume ?? "")})) {
          if(Date.now()>deadline) throw new Error('resume timeout');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);
        }
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);
      throw new Error('barrier timeout');
    }
    const rename=fs.renameSync;
    fs.renameSync=function(from,to) {
      to=String(to); from=String(from);
      const event=to===lock ? (++owners===1 ? 'owner' : 'capability')
        : to===recovery || (to.startsWith(recovery+'.') && !to.includes('.completed-')) ? 'reservation'
        : from===recovery ? 'retirement' : 'other';
      if('before-'+event===${JSON.stringify(boundary)}) stop();
      const result=rename.call(fs,from,to);
      if('after-'+event===${JSON.stringify(boundary)}) stop();
      return result;
    };
    try {
      const open=()=>retainBookDatabase(${JSON.stringify(path.join(dir, "book.db"))})();
      // Additional registration remains a distinct boundary when a writer
      // opens its first database after acquiring a general-purpose lease.
      if (${JSON.stringify(boundary.includes("capability"))}) withBookWriter(${JSON.stringify(dir)},open);
      else open();
    }
    catch(error) { process.stderr.write(String(error.code)); process.exitCode=23; }
  `], { stdio: ["ignore", "pipe", "pipe"] })
  children.push(child)
  let stderr = ""; child.stderr!.on("data", data => { stderr += data })
  await vi.waitFor(() => {
    if (child.exitCode !== null) throw new Error(`Child exited before ${boundary}: ${stderr}`)
    expect(fs.existsSync(marker)).toBe(true)
  }, { timeout: 3000 })
  return child
}
async function kill(child: ChildProcess) {
  const exited = once(child, "exit"); child.kill("SIGKILL"); await exited
}

it.each(["before-reservation", "before-owner", "after-owner", "before-retirement", "after-retirement", "before-capability", "after-capability"])(
  "reopens after SIGKILL at %s without changing database bytes", async boundary => {
    const file = path.join(dir, "book.db")
    fs.writeFileSync(file, "untouched content")
    const child = await pausedAdmission(boundary)
    await kill(child)
    expect(withBookWriter(dir, () => "reopened")).toBe("reopened")
    expect(fs.readFileSync(file, "utf8")).toBe("untouched content")
  },
)

it("recovers repeated killed reapers, excluding competitors at each successor", async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const child = await pausedAdmission("after-reservation")
    expect(() => withBookWriter(dir, () => "unsafe")).toThrow("BOOK_BUSY")
    await kill(child)
  }
  expect(withBookWriter(dir, () => "reopened")).toBe("reopened")
  expect(fs.readdirSync(dir).filter(name => name.startsWith(".book-writer.json.recovery"))).toEqual([])
})

it("a delayed successor cannot replace a new live owner after its old root completes", async () => {
  await kill(await pausedAdmission("after-reservation"))
  const resume = path.join(dir, "resume")
  const contender = await pausedAdmission("before-reservation", resume)
  await withBookWriter(dir, async () => {
    const lock = path.join(dir, ".book-writer.json")
    const bytes = fs.readFileSync(lock)
    const exited = once(contender, "exit")
    fs.writeFileSync(resume, "resume")
    await exited
    expect(contender.exitCode).toBe(23)
    expect(fs.readFileSync(lock)).toEqual(bytes)
  })
  expect(withBookWriter(dir, () => "still usable")).toBe("still usable")
})

it.each(["foreign host", "changed root", "extra file", "symlink record", "missing previous owner"])(
  "preserves unverified reservation evidence: %s", async kind => {
    const lock = path.join(dir, ".book-writer.json")
    const recovery = `${lock}.recovery`, recordFile = path.join(recovery, "owner.json")
    // Leave an owner before reserving its recovery for the missing-owner case.
    if (kind === "missing previous owner") await kill(await pausedAdmission("after-retirement"))
    await kill(await pausedAdmission("after-reservation"))
    const record = JSON.parse(fs.readFileSync(recordFile, "utf8"))
    if (kind === "foreign host") record.owner.host += "-unknown"
    if (kind === "changed root") record.rootToken = "e0eae0d2-d209-4b35-839f-0743e83a828c"
    fs.writeFileSync(recordFile, JSON.stringify(record))
    if (kind === "extra file") fs.writeFileSync(path.join(recovery, "unrelated"), "preserve")
    if (kind === "symlink record") {
      const outside = path.join(dir, "saved-owner.json")
      fs.renameSync(recordFile, outside); fs.symlinkSync(outside, recordFile)
    }
    if (kind === "missing previous owner") fs.unlinkSync(lock)
    const saved = fs.readFileSync(recordFile)
    expect(() => withBookWriter(dir, () => "unsafe")).toThrow("BOOK_BUSY")
    expect(fs.readFileSync(recordFile)).toEqual(saved)
  },
)

// Adapted from SPEC-0010 / PR #886 at 876cc2ae: a reaper can die after
// removing the old owner but before establishing the next owner's lease.
it("keeps an orphan recovery reservation exclusive even without an owner file", () => {
  const marker = path.join(dir, ".book-writer.json.recovery")
  fs.writeFileSync(marker, "unfinished recovery evidence")
  const operation = () => { fs.writeFileSync(path.join(dir, "unsafe-write"), "must not run") }
  expect(() => withBookWriter(dir, operation)).toThrow(BookBusyError)
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { withBookWriter } from ${JSON.stringify(path.resolve("packages/storage/dist/book-writer.js"))};
    try { withBookWriter(${JSON.stringify(dir)}, () => process.exit(24)); }
    catch (error) { if (error.code !== 'BOOK_BUSY') throw error; }
  `], { encoding: "utf8", timeout: 5000 })
  expect(child.status, child.stderr).toBe(0)
  expect(fs.readFileSync(marker, "utf8")).toBe("unfinished recovery evidence")
  expect(fs.readdirSync(dir)).toEqual([".book-writer.json.recovery"])
})
