import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { assertBookWriter, withBookWriter } from "@adt/storage"

import { SectioningSafetyError } from "../sectioning-errors.js"

const journalFormat = "adt-web-stage-v1\n"
const stageFormat = "adt-web-build-v1\n"
const activeStages = new Set<string>()

function ownedStage(directory: string, token: string): boolean {
  const marker = path.join(directory, ".stage-owner")
  const expected = `${stageFormat}${token}\n`
  const stat = fs.lstatSync(marker, { throwIfNoEntry: false })
  return fs.lstatSync(directory, { throwIfNoEntry: false })?.isDirectory() === true &&
    stat?.isFile() === true && stat.size === Buffer.byteLength(expected) && fs.readFileSync(marker, "utf8") === expected
}

/** Admission excludes other processes; the local set also protects reentrant
 * work in this writer scope. Names/age alone never authorize removal. Legacy
 * unmarked staging and unknown/symlinked entries remain untouched. */
function cleanAbandonedStages(work: string): void {
  const root = fs.realpathSync(work)
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const token = /^(?:build-|\.preparing-)([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(entry.name)?.[1]
    if (!token || !entry.isDirectory()) continue
    const directory = path.join(root, entry.name)
    if (!activeStages.has(directory) && ownedStage(directory, token)) fs.rmSync(directory, { recursive: true })
  }
}

function isJournal(work: string): boolean {
  const marker = path.join(work, "format")
  return fs.lstatSync(work, { throwIfNoEntry: false })?.isDirectory() === true &&
    fs.lstatSync(marker, { throwIfNoEntry: false })?.isFile() === true &&
    fs.readFileSync(marker, "utf8") === journalFormat
}

export function openPackageWork(bookDir: string): string {
  assertBookWriter(bookDir)
  const work = path.join(bookDir, ".adt-package-work")
  if (!fs.lstatSync(work, { throwIfNoEntry: false })) {
    fs.mkdirSync(work)
    fs.writeFileSync(path.join(work, "format"), journalFormat, { flag: "wx" })
  }
  if (!isJournal(work)) throw new SectioningSafetyError("PACKAGE_RECOVERY_UNSAFE", "Unrecognized package work directory. Existing files have been retained.")
  cleanAbandonedStages(work)
  return work
}

/** Publish an ownership marker before any potentially large package data. A
 * crash before the marker completes leaves only a small, unproven directory. */
export function createPackageStaging(work: string): string {
  assertBookWriter(path.dirname(work))
  const root = fs.realpathSync(work), token = randomUUID()
  const prepared = path.join(root, `.preparing-${token}`), staging = path.join(root, `build-${token}`)
  fs.mkdirSync(prepared)
  try {
    fs.writeFileSync(path.join(prepared, ".stage-owner"), `${stageFormat}${token}\n`, { flag: "wx" })
    fs.renameSync(prepared, staging)
  } catch (error) { fs.rmSync(prepared, { recursive: true, force: true }); throw error }
  activeStages.add(staging)
  return staging
}

export function removePackageStaging(staging: string): void {
  if (!activeStages.has(staging)) throw new SectioningSafetyError("PACKAGE_RECOVERY_UNSAFE", "Package staging ownership is unavailable. Existing files have been retained.")
  try { fs.rmSync(staging, { recursive: true, force: true }) }
  finally { activeStages.delete(staging) }
}

/** A crash between directory renames leaves the complete prior package in
 * previous/. Restore that one entry under shared admission on the first read;
 * never promote staging, delete a lock, or require another successful build. */
export function publishedAdtDirectory(bookDir: string): string {
  const published = path.join(bookDir, "adt")
  const work = path.join(bookDir, ".adt-package-work"), previous = path.join(work, "previous")
  if (!fs.lstatSync(published, { throwIfNoEntry: false }) && isJournal(work) &&
      fs.lstatSync(previous, { throwIfNoEntry: false })?.isDirectory()) {
    withBookWriter(bookDir, () => {
      if (!fs.lstatSync(published, { throwIfNoEntry: false }) && isJournal(work) &&
          fs.lstatSync(previous, { throwIfNoEntry: false })?.isDirectory()) fs.renameSync(previous, published)
    })
  }
  return published
}
