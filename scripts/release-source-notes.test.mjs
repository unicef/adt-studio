import { describe, expect, it } from "vitest";
import {
  formatReleaseSourceSection,
  parseReleasePresentation,
  parseReleaseSourceSection,
  stripReleaseSourceSection,
} from "./release-source-notes.mjs";

const source = {
  branch: "develop",
  coverUrl:
    "https://github.com/user-attachments/assets/7565356c-97ea-4969-9ad1-3cf47d134be5",
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
  title: "Reliable translations and persistent glossary edits",
  description:
    "This beta keeps manually added, edited, and pruned glossary terms across re-runs.",
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

  it("parses presentation fields from the release source section", () => {
    const body = [
      "### What's Changed",
      "",
      "- Fixed glossary persistence",
      "",
      formatReleaseSourceSection(source),
    ].join("\n");
    const parsed = parseReleaseSourceSection(body);

    expect(parsed.notes).toContain("### What's Changed");
    expect(parsed.source).toMatchObject({
      title: source.title,
      description: source.description,
      coverUrl: source.coverUrl,
    });
  });

  it("ignores invalid presentation values in the source section", () => {
    const body = [
      "### Release source",
      "",
      "- Cover: `https://example.com/cover.png`",
      "- Title: `What's Changed`",
      `- Description: \`${"x".repeat(501)}\``,
    ].join("\n");
    expect(parseReleaseSourceSection(body)).toEqual({
      notes: body,
      source: undefined,
    });
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

  it("extracts an editorial title and trusted cover from the first block", () => {
    const parsed = parseReleasePresentation(
      [
        "## **Reliable translations** and `glossary` edits",
        "",
        "![Translation workspace](https://github.com/user-attachments/assets/cover-id)",
        "",
        "A focused beta for multilingual books.",
      ].join("\n"),
    );

    expect(parsed).toEqual({
      title: "Reliable translations and glossary edits",
      coverUrl: "https://github.com/user-attachments/assets/cover-id",
      coverAlt: "Translation workspace",
      notes: "A focused beta for multilingual books.",
    });
  });

  it("accepts user-images covers and CRLF notes", () => {
    const parsed = parseReleasePresentation(
      "\r\n# Clearer exports\r\n\r\n![](https://user-images.githubusercontent.com/1/cover.png)\r\n\r\nDetails",
    );
    expect(parsed.title).toBe("Clearer exports");
    expect(parsed.coverUrl).toBe(
      "https://user-images.githubusercontent.com/1/cover.png",
    );
    expect(parsed.coverAlt).toBeUndefined();
    expect(parsed.notes).toBe("Details");
  });

  it("keeps untrusted images in notes while still consuming the title", () => {
    const body =
      "### Faster setup\n\n![Cover](https://example.com/cover.png)\n\nDetails";
    expect(parseReleasePresentation(body)).toEqual({
      title: "Faster setup",
      coverUrl: undefined,
      coverAlt: undefined,
      notes: "![Cover](https://example.com/cover.png)\n\nDetails",
    });
  });

  it("does not promote generic, long, or non-leading headings", () => {
    const cases = [
      "## What's Changed\n\n- Fix",
      `# ${"x".repeat(121)}\n\nDetails`,
      "Intro first\n\n## Editorial title\n\nDetails",
    ];
    for (const body of cases) {
      expect(parseReleasePresentation(body)).toEqual({ notes: body });
    }
  });
});
