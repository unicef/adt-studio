import type { UpdateInfo } from "electron-updater";
import { stripReleaseSourceSection } from "@root/scripts/release-source-notes.mjs";

export interface RawReleaseNotes {
  version: string;
  releaseNotes?: string;
}

export function normalizeUpdaterReleaseNotes(
  notes: UpdateInfo["releaseNotes"],
): string | undefined {
  if (!notes) return undefined;
  const normalized =
    typeof notes === "string"
      ? notes
      : notes
          .map((entry) =>
            typeof entry === "string" ? entry : (entry.note ?? ""),
          )
          .filter(Boolean)
          .join("\n\n");
  return stripReleaseSourceSection(normalized);
}

export function preferredReleaseNotes(
  info: Pick<UpdateInfo, "version" | "releaseNotes">,
  rawRelease: RawReleaseNotes | null,
): string | undefined {
  const rawNotes =
    rawRelease &&
    rawRelease.version.replace(/^v/, "") === info.version.replace(/^v/, "")
      ? rawRelease.releaseNotes
      : undefined;
  return rawNotes?.trim()
    ? rawNotes
    : normalizeUpdaterReleaseNotes(info.releaseNotes);
}
