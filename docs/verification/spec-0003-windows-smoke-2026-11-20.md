# SPEC-0003 Windows lease smoke (WIN-1 / N1) — 20 November 2026

Evidence for the [WIN-1 / N1 release gate (#1165)](https://github.com/unicef/adt-studio/issues/1165)
from [SPEC-0003](../specs/SPEC-0003-sectioning-modes.md#approval-and-remaining-follow-ups--2026-11-18).
It was run on an actual Windows machine with Defender real-time protection on, against both the
bare API process and the packaged desktop application. **No defect was found. This record does not
close the gate: #1165 still requires human acceptance.**

**Update, 22 November 2026:** the product owner
[accepted this evidence](https://github.com/unicef/adt-studio/issues/1165#issuecomment-7082529578)
and closed #1165. The record below is unchanged.

## Result

| Target | Kill/restart cycles | Checks | Transient rename errors |
|---|---|---|---|
| Bare API process (`node --import tsx apps/api/src/index.ts`) | 12 (3 per phase) | 150/150 | none |
| Packaged desktop app (`win-unpacked`, Electron) | 8 (2 per phase; 4 whole-app crashes, 4 API-only kills) | 99/99 | none |

Every interrupted owner was reclaimed on the next open: no cycle left the book `BOOK_BUSY` and
no retry was needed. No lock, lease or mutex was deleted by hand or by the harness at any point.

## Environment

| Item | Value |
|---|---|
| Commit | `e38a860f8cf148e5e9548a580dd0ac6da983ded8` (`spec/708-sectioning-mode-lifecycle`, equal to its `origin` head) |
| Working tree | One unrelated generated file modified (`apps/studio/src/routeTree.gen.ts`) |
| Windows | Windows 11 Pro 10.0.26300 (build 26300), 64-bit |
| Filesystem | NTFS, fixed local drive (books under `%TEMP%`) |
| Node.js | v22.22.0 |
| Electron | 41.2.0; app `ADT-Studio-Beta.exe` 0.8.0-beta.1, built locally from the commit above with `pnpm --filter @adt/desktop build:unpack` (unsigned) |
| Defender | Antivirus, real-time, on-access, behaviour monitoring, IOAV and tamper protection all on; engine 4.18.26100.4, signatures 1.463.389.0; Controlled Folder Access off |
| Defender exclusions | Not viewable without administrator rights; the test folders were not added to any exclusion |
| Fixture | Disposable copies of `books/Education_Activities_v2` (SQLite database plus 1,053 PDF, image, video and cache files, about 56 MB) |

## Reproduce

From the repository root, after `pnpm install` and `pnpm build`:

```bash
node docs/verification/evidence/spec-0003-windows-smoke-2026-11-20/harness.mjs api 3
pnpm --filter @adt/desktop build:unpack
node docs/verification/evidence/spec-0003-windows-smoke-2026-11-20/harness.mjs desktop 2
```

The second argument is the number of repetitions per phase. Each run copies the fixture into a new
folder under `%TEMP%\adt-win1-smoke` (override with `WIN1_OUT`), never touching `books/`. The desktop
target launches the app with `--user-data-dir` pointing at that folder, so the user's own library is
not used. Raw results are written there and redacted (`<repo>`, `<run>`, `<home>`, `<host>`, `<user>`).

The [evidence folder](evidence/spec-0003-windows-smoke-2026-11-20/) holds the scripts and the
redacted results of the two runs above (`results-api.json`, `results-desktop.json`):

- `harness.mjs` orchestrates the scenarios and checks.
- `watcher.mjs` is a separate process that spins on the book directory and calls `TerminateProcess`
  (`process.kill(pid, "SIGKILL")`) on the writer the moment the chosen lease phase is visible.
- `holder.mjs` is a real second process that takes the book writer lease through `@adt/storage` and
  holds it.
- `dbsnap.mjs` hashes every database row from a copy of the database file (plus WAL and journal),
  only while no app process is running.

## Scenarios mapped to #1165

**Open, edit, close, reopen.** Opened the book, saved a metadata edit, closed, reopened. The edit,
metadata history and all 1,053 non-database files were intact. The desktop close was a real
`WM_CLOSE` (`taskkill` without `/F`), and the app exited with code 0 within 30 s every time. The bare
API has no window, so its "close" is a process stop while idle and holding no lease.

**Kill during the lease path, restart, open and edit.** A burst of metadata edits ran while the
watcher killed the writer at a target phase. Each cycle then checked database integrity, that history
equals the previous history plus acknowledged edits plus at most the in-flight edit (no partial or
duplicate version), that no versioned row was lost, and that the files were byte-identical. It then
restarted, opened, checked the last committed title and saved a new edit.

| Phase targeted | Lease artifacts on disk when the kill was triggered |
|---|---|
| acquisition | `.book-writer.json.recovery.preparing-<uuid>` (reservation being prepared) |
| publication | `.book-writer.json.preparing-<uuid>` and `.book-writer.json.recovery` |
| held (writer active) | `.book-writer.json` naming the writer, with `<label>.db.lock` (SQLite WASM mutex); in 2 of the 3 API-target cycles the writer had released the mutex by the time termination took effect |
| random offset after the first artifact | a mix of the above: lease alone, lease with mutex, lease with reservation, or a preparing file with reservation |

Every kill landed on the first edit of its burst, so the in-flight edit never committed. Restart
removed the stale lease, reservation and mutex in every cycle; no artifact remained after the reopen.

**Desktop specifics.** Whole-app crashes killed the API utility process and the Electron main process,
and no stray processes remained. In API-only kills the Electron main process stayed alive. It was then
closed gracefully and relaunched.

**Known-live-owner control.** While `holder.mjs` held the lease, the running app refused open, edit and
Recover a copy with `BOOK_BUSY`. No copy was created and the lease bytes and book files were
unchanged. After the holder was hard-killed, its lease stayed on disk until the running app's next
open reclaimed it. The refused edit never landed.

**Ownership that cannot be proved** (API target, each on its own disposable copy, injected file left
in place):
- A lease naming a live PID that is not the owner was refused for open and for Recover a copy, with
  no copy created. On Windows this is the documented outcome for PID reuse after a reboot.
- An unreadable lease was refused for open, while Recover a copy succeeded. The copy holds every
  source file byte-identical (the PDF renamed to the new label), passes the database integrity check,
  opens with its content, and keeps the quarantined lease plus `audit.json`. The original's lease bytes
  and files were unchanged and it stayed refused.

**Final state.** After all cycles: database integrity `ok`, metadata history equal to every committed
edit in order (15 versions for the API run, 11 for desktop), the current pointer at the latest version,
no versioned row lost since the start, and the media byte-identical.

## Qualifications

- Windows leases carry no process-incarnation evidence. A same-host lease whose PID is currently live
  is treated as a live owner, even if the PID was reused after a reboot. Open and copy recovery are
  refused until that process exits. This is the limitation accepted on 17 November; reboot itself was
  not exercised.
- `TerminateProcess` is asynchronous. In some cycles the writer advanced one step between the trigger
  and its death, so the artifacts at the kill and after it differ; both are recorded per cycle.
- Lease release is a single unlink, so a kill "during release" leaves either the full lease or nothing.
  It was not isolated as its own phase. The reservation-retirement step was hit by random-offset kills.
- The only write exercised was the metadata edit path through writer admission. Long pipeline runs,
  exports and Storyboard writes were not killed.
- The live owner was a second Node process using the same `@adt/storage` build, not a second desktop
  instance.
- Not covered: the NSIS installer, a signed build, reboot, network or removable drives, and
  non-administrator verification of Defender exclusions.
