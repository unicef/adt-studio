export class SectioningSafetyError extends Error {
  readonly status = 409

  constructor(readonly code: "PACKAGE_RECOVERY_UNSAFE" | "STORYBOARD_PAGE_OUTSIDE_WINDOW" | "PACKAGE_INPUTS_CHANGED" | "PACKAGE_FILES_INCOMPLETE" | "SECTIONING_WINDOW_INVALID" | "SECTIONING_REGENERATION_BLOCKED" | "SECTIONING_INPUT_UNREADABLE" | "STORYBOARD_INPUT_CHANGED" | "STORYBOARD_PUBLICATION_INCOMPLETE" | "STORYBOARD_PAGE_INPUT_MISSING", message: string) {
    super(message.startsWith(`${code}:`) ? message : `${code}: ${message}`)
    this.name = "SectioningSafetyError"
  }
}
