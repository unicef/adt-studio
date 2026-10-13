/**
 * Written while an ADT import is seeding a project directory and removed once
 * the import commits. `listBooks` skips directories that still carry it, so a
 * crashed import never surfaces as a usable book.
 */
export const ADT_IMPORT_IN_PROGRESS_MARKER = ".adt-recovery-workspace.json"
