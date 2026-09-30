/**
 * Outer container classes for a LanguageSettings tab.
 *
 * Most tabs are single-column forms and read better constrained to `max-w-2xl`.
 * Two exceptions:
 *
 * - `prompt` is a full-height editor that manages its own padding, so it must
 *   not inherit the forms' `p-4`/`space-y-6`.
 * - `voices` is a six-column table (language + four providers + remove). At
 *   `max-w-2xl` that left roughly 130px per voice cell — not enough for an Azure
 *   name like `en-US-JennyNeural` or the ElevenLabs voice picker.
 *
 * The settings route wraps this in an `overflow-auto` pane with no width cap of
 * its own, so a wider tab is free to use the space.
 */
export function tabContainerClass(tab: string): string {
  if (tab === "prompt") return "h-full w-full"
  if (tab === "voices") return "p-4 max-w-5xl space-y-6"
  return "p-4 max-w-2xl space-y-6"
}
