import fs from "node:fs"
import path from "node:path"
import { withBookWriter } from "@adt/storage"

const journalFormat = "adt-web-stage-v1\n"

function isJournal(work: string): boolean {
  const marker = path.join(work, "format")
  return fs.lstatSync(work, { throwIfNoEntry: false })?.isDirectory() === true &&
    fs.lstatSync(marker, { throwIfNoEntry: false })?.isFile() === true &&
    fs.readFileSync(marker, "utf8") === journalFormat
}

export function openPackageWork(bookDir: string): string {
  const work = path.join(bookDir, ".adt-package-work")
  if (!fs.lstatSync(work, { throwIfNoEntry: false })) {
    fs.mkdirSync(work)
    fs.writeFileSync(path.join(work, "format"), journalFormat, { flag: "wx" })
  }
  if (!isJournal(work)) throw new Error("Unrecognized package work directory. Existing files have been retained.")
  return work
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
