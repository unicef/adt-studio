import { describe, expect, it } from "vitest";
import {
  formatReleaseSourceSection,
  parseReleaseSourceSection,
  stripReleaseSourceSection,
} from "./release-source-notes.mjs";

const source = {
  branch: "develop",
  buildCommit: {
    sha: "1a2b3c4",
    url: "https://github.com/unicef/adt-studio/commit/1a2b3c4",
    subject: "RELEASE: beta",
  },
  changeCommit: {
    sha: "9f8e7d6",
    url: "https://github.com/unicef/adt-studio/commit/9f8e7d6",
    subject: "fix: `RTL` — splitting",
  },
  prs: [
    {
      number: 123,
      url: "https://github.com/unicef/adt-studio/pull/123",
      headRef: "feat/page-split",
      baseRef: "develop",
      author: "alice",
      title: "Fix `page splitting` — RTL books",
    },
  ],
  compare: {
    label: "v0.7.5-beta.1...v0.7.5-beta.2",
    url: "https://github.com/unicef/adt-studio/compare/v0.7.5-beta.1...v0.7.5-beta.2",
  },
};

describe("release source notes", () => {
  it("round-trips every supported field", () => {
    const section = formatReleaseSourceSection(source);
    const parsed = parseReleaseSourceSection(`Changes\n\n${section}`);
    expect(parsed.notes).toBe("Changes");
    expect(parsed.source).toEqual(source);
  });

  it("supports CRLF and unknown bullets", () => {
    const section = formatReleaseSourceSection(source).replace(/\n/g, "\r\n");
    const body = `${section}\r\n- Future field: value`;
    expect(parseReleaseSourceSection(body).source).toEqual(source);
  });

  it("uses the last heading and preserves earlier notes", () => {
    const body = `### Release source\n\nA mention in the notes.\n\n${formatReleaseSourceSection(source)}`;
    expect(parseReleaseSourceSection(body).notes).toContain("A mention");
    expect(parseReleaseSourceSection(body).source).toEqual(source);
  });

  it("leaves absent or malformed sections intact", () => {
    for (const body of [
      "Ordinary notes",
      "Ordinary notes\n\n### Release source\n\n- not valid",
      "Ordinary notes\n\n### Release source\n\n- Built from: bad",
    ]) {
      expect(parseReleaseSourceSection(body)).toEqual({
        notes: body,
        source: undefined,
      });
    }
  });

  it("rejects hostile URLs", () => {
    const body = [
      "### Release source",
      "",
      "- Built from: [`abc`](https://github.com.evil.test/commit/abc)",
      "- PR [#1](javascript:alert(1))",
      "- Compare: [a...b](https://example.com/compare/a...b)",
    ].join("\n");
    expect(parseReleaseSourceSection(body).source).toBeUndefined();
    expect(
      formatReleaseSourceSection({
        prs: [{ number: 1, url: "https://github.com.evil.test/pull/1" }],
      }),
    ).toBe("");
  });

  it("strips markdown and rendered HTML forms", () => {
    const markdown = `Notes\n\n${formatReleaseSourceSection(source)}`;
    expect(stripReleaseSourceSection(markdown)).toBe("Notes");
    expect(
      stripReleaseSourceSection(
        '<p>Notes</p>\n<h3 id="release-source">Release source</h3>\n<ul><li>Branch</li></ul>',
      ),
    ).toBe("<p>Notes</p>");
  });
});
