import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("release asset regeneration workflow", () => {
  it("revalidates both beta and staging releases before every mutation", async () => {
    const workflow = await readFile(
      new URL("../.github/workflows/regenerate-release-assets.yml", import.meta.url),
      "utf8",
    );
    const prereleaseStateChecks = workflow.match(
      /\( "\$CHANNEL" == "beta" \|\| "\$CHANNEL" == "staging" \) &&/g,
    );

    expect(prereleaseStateChecks).toHaveLength(2);
  });

  it("does not upload localization metadata", async () => {
    const workflow = await readFile(
      new URL("../.github/workflows/regenerate-release-assets.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).not.toContain("regenerated-assets/release-i18n.json");
    expect(workflow).toContain('"release-i18n.json"');
  });
});
