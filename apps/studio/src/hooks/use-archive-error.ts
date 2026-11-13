import { useLingui } from "@lingui/react/macro"

/** What kind of failure it is, so a screen can choose its layout without
 * matching English again. "not-recognized": no archive type ADT Studio
 * imports was found. "adt-unreadable": an ADT export was recognized but one of
 * its files is broken. "server": ADT Studio failed, not the file. */
export type FriendlyErrorKind = "not-recognized" | "adt-unreadable" | "server" | "other"

export interface FriendlyError {
  title: string
  hint: string
  kind?: FriendlyErrorKind
}

/**
 * Map a raw server validation message (import + part-merge archive checks) to a
 * localized title + hint. The API returns English messages, so this matches on
 * stable substrings — the single place the studio localizes those errors, used
 * by both the project import and the part merge flows.
 *
 * Longer term the API should return stable error codes so we don't match
 * English at all; until then keep the match tokens in sync with the throwers in
 * `part-service.ts` / `import-service.ts`.
 */
export function useFriendlyArchiveError(rawError: string | null): FriendlyError | null {
  const { t } = useLingui()
  if (!rawError) return null
  const e = rawError.toLowerCase()

  if (e.includes("size limit") || e.includes("exceeds the size")) {
    return {
      title: t`This archive is too large`,
      hint: t`ADT Studio accepts ZIP archives up to 512 MiB compressed. Choose a smaller bundle and try again.`,
    }
  }

  if (e.includes("read-only distribution format") || e.includes("cannot be re-imported yet")) {
    return {
      title: t`This export format can't be re-imported yet`,
      hint: t`EPUB, PNLD, and WebPub are read-only distribution formats. Re-import the ADT Web ZIP or a Project backup instead.`,
    }
  }

  // Order matters: more specific phrases are checked before broader ones.
  if (e.includes("invalid zip file") || e.includes("valid .zip archive")) {
    return {
      title: t`This file couldn't be read as a ZIP archive`,
      hint: t`The file may be damaged or incomplete. Try downloading it again from the source.`,
    }
  }

  if (e.includes("completed part")) {
    return {
      title: t`This isn't a completed part`,
      hint: t`Export the finished part from its Export step, then upload that file.`,
    }
  }

  if (e.includes("legacy adt export") || e.includes("recognized legacy adt studio export")) {
    return {
      kind: "adt-unreadable",
      title: t`This legacy ADT export is incomplete`,
      hint: t`ADT Studio recognized the publication, but required book files are missing or inconsistent. Open the error details to see what must be repaired.`,
    }
  }

  if (e.includes("already being edited") || e.includes("database is locked")) {
    return {
      title: t`This project is busy`,
      hint: t`Wait for the current operation to finish, then try the import again.`,
    }
  }

  if (e.includes("regular project")) {
    return {
      title: t`This is a project, not a book part`,
      hint: t`Only parts exported from this book can be merged back.`,
    }
  }

  if (
    e.includes("different pdf") ||
    e.includes("schema version") ||
    e.includes("different prompts") ||
    e.includes("prompts/models")
  ) {
    return {
      title: t`This part doesn't match this book`,
      hint: t`It was created from a different PDF or settings, so it can't be merged here.`,
    }
  }

  if (
    e.includes("adt tables") ||
    e.includes("no pages") ||
    e.includes("project database") ||
    e.includes("expected a .db")
  ) {
    return {
      kind: "not-recognized",
      title: t`This isn't a valid ADT Studio project`,
      hint: t`The archive must contain a project database and its PDF. Re-export it from ADT Studio.`,
    }
  }

  if (e.includes("part file") || e.includes("book part")) {
    return {
      title: t`This isn't a valid part file`,
      hint: t`Choose the part file that was shared with you, or export it again.`,
    }
  }

  if (e.includes("unsafe") || e.includes("escape the project") || e.includes("unexpected file paths")) {
    return {
      title: t`This archive can't be opened safely`,
      hint: t`It contains unexpected file paths. Use a .zip exported from ADT Studio.`,
    }
  }

  if (
    e.includes("adt bundle") ||
    e.includes("manifest.json") ||
    e.includes("invalid shape") ||
    e.includes("offline cache")
  ) {
    return {
      kind: "adt-unreadable",
      title: t`This isn't an editable ADT bundle`,
      hint: t`Choose a Web Export ZIP created by a current version of ADT Studio.`,
    }
  }

  // An unexpected server failure says nothing about the file, so don't blame it.
  if (e.includes("internal server error") || /request failed: 5\d\d/.test(e)) {
    return {
      kind: "server",
      title: t`ADT Studio couldn't check this archive`,
      hint: t`Something went wrong in ADT Studio, not necessarily in your file. Try again; if it keeps failing, report the problem and include the archive.`,
    }
  }

  // The request never got an answer (the browser's fetch failure, in Chrome,
  // Firefox and Safari wording): the file was not checked at all.
  if (e.includes("failed to fetch") || e.includes("networkerror") || e.includes("load failed")) {
    return {
      kind: "server",
      title: t`ADT Studio couldn't check this archive`,
      hint: t`ADT Studio's server didn't answer, so the file wasn't checked. Try again in a moment; if it keeps failing, restart ADT Studio.`,
    }
  }

  return {
    title: t`Invalid project archive`,
    hint: t`Make sure you're uploading a .zip file exported from ADT Studio.`,
  }
}
