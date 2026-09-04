import { describe, expect, it } from "vitest";
import {
  normalizeUpdaterReleaseNotes,
  preferredReleaseNotes,
} from "./update-release-notes";

describe("update release notes", () => {
  it("prefers the raw GitHub body for the matching updater version", () => {
    const raw =
      '<picture><img alt="Release cover" src="https://github.com/unicef/adt-studio/releases/download/v0.8.0/release-cover-light.png"></picture>\n\nEnglish notes';

    expect(
      preferredReleaseNotes(
        { version: "0.8.0", releaseNotes: "Updater feed notes" },
        { version: "v0.8.0", releaseNotes: raw },
      ),
    ).toBe(raw);
  });

  it("does not leak raw notes from a different selected version", () => {
    expect(
      preferredReleaseNotes(
        { version: "0.8.1", releaseNotes: "Updater feed notes" },
        { version: "0.8.0", releaseNotes: "Stale English notes" },
      ),
    ).toBe("Updater feed notes");
  });

  it("normalizes array notes and removes release provenance", () => {
    const notes = normalizeUpdaterReleaseNotes([
      { version: "0.8.0", note: "First change" },
      {
        version: "0.8.0",
        note: "Second change\n\n### Release source\n\n- Branch: `main`",
      },
    ]);

    expect(notes).toBe("First change\n\nSecond change");
  });
});
