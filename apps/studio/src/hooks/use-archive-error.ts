import { useLingui } from "@lingui/react/macro"

export interface FriendlyError {
  title: string
  hint: string
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
      hint: t`Choose a smaller ADT bundle and try again.`,
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

  if (e.includes("exact exported adt revision is already imported")) {
    return {
      title: t`This revision is already in the project`,
      hint: t`Nothing was changed. Open the existing project, or choose Create a new project to keep a separate copy.`,
    }
  }

  if (e.includes("different page structure")) {
    return {
      title: t`This publication can't be added as a revision`,
      hint: t`Its page structure no longer matches the selected project. Choose Create a new project to import it separately.`,
    }
  }

  if (e.includes("selected project does not match")) {
    return {
      title: t`This publication doesn't match the selected project`,
      hint: t`Choose the recommended project, or create a new project instead.`,
    }
  }

  if (e.includes("selected project no longer exists")) {
    return {
      title: t`The selected project is no longer available`,
      hint: t`Choose another destination or create a new project.`,
    }
  }

  if (e.includes("legacy adt export") || e.includes("recognized legacy adt studio export")) {
    return {
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
      title: t`This isn't an editable ADT bundle`,
      hint: t`Choose a Web Export ZIP created by a current version of ADT Studio.`,
    }
  }

  return {
    title: t`Invalid project archive`,
    hint: t`Make sure you're uploading a .zip file exported from ADT Studio.`,
  }
}
