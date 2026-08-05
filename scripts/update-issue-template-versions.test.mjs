// End-to-end tests for scripts/update-issue-template-versions.mjs
//
// The script is a standalone CLI that mutates `.github/ISSUE_TEMPLATE/*.yml`
// relative to the current working directory, and pulls its version candidates
// from `git tag --list`. Each test sets up a throwaway git repo in a temp dir
// and runs the real script as a child process.

import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "update-issue-template-versions.mjs",
);

/** A minimal but realistic issue-form template with a `version` dropdown. */
function versionTemplate(options = ["v0.0.0", "Older / unsure"]) {
  return [
    "name: Bug Report",
    "description: File a bug report",
    "body:",
    "  - type: dropdown",
    "    id: version",
    "    attributes:",
    "      label: Version",
    "      description: What version are you running?",
    "      options:",
    ...options.map((o) => `        - ${o}`),
    "    validations:",
    "      required: true",
    "",
  ].join("\n");
}

let cwd;
let templateDir;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "issue-tpl-"));
  templateDir = join(cwd, ".github", "ISSUE_TEMPLATE");
  mkdirSync(templateDir, { recursive: true });
  // Every run shells out to git; init a fresh repo with one empty commit so
  // `git tag` works. `-c` keeps the test off the user's global git config.
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync(
    "git",
    [
      "-c",
      "user.email=t@t.t",
      "-c",
      "user.name=t",
      "commit",
      "--allow-empty",
      "-m",
      "init",
      "-q",
    ],
    { cwd },
  );
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writeTemplate(name, contents) {
  writeFileSync(join(templateDir, name), contents);
}

function readTemplate(name) {
  return readFileSync(join(templateDir, name), "utf8");
}

function gitTag(...names) {
  for (const name of names) {
    execFileSync("git", ["tag", name], { cwd });
  }
}

/** Extract just the version dropdown's option values from a written template. */
function versionOptions(name) {
  const lines = readTemplate(name).split(/\r?\n/);
  const optionsIdx = lines.findIndex((l) => l.trim() === "options:");
  const out = [];
  for (let i = optionsIdx + 1; i < lines.length; i++) {
    const m = /^\s+-\s+(.+)$/.exec(lines[i]);
    if (!m) break;
    out.push(m[1].trim());
  }
  return out;
}

function run(...args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
  });
}

describe("update-issue-template-versions", () => {
  it("picks the 3 latest betas + 3 latest officials from git tags", () => {
    gitTag(
      "v0.4.8",
      "v0.5.0",
      "v0.5.1",
      "v0.6.0",
      "v0.7.0-beta.1",
      "v0.7.0-beta.2",
      "v0.7.0-beta.3",
    );
    writeTemplate("bug_report.yml", versionTemplate());

    const result = run();

    expect(result.status).toBe(0);
    expect(versionOptions("bug_report.yml")).toEqual([
      "v0.7.0-beta.3",
      "v0.7.0-beta.2",
      "v0.7.0-beta.1",
      "v0.6.0",
      "v0.5.1",
      "v0.5.0",
      "Older / unsure",
    ]);
    expect(result.stdout).toContain("bug_report.yml: updated version options");
  });

  it("folds the optional <tag> argument into the candidates (not-yet-pushed tag)", () => {
    // git has the historical tags but NOT the new one — the release workflow
    // runs this script before creating the tag.
    gitTag(
      "v0.4.8",
      "v0.5.0",
      "v0.5.1",
      "v0.6.0",
      "v0.7.0-beta.1",
      "v0.7.0-beta.2",
    );
    writeTemplate("bug_report.yml", versionTemplate());

    run("v0.7.0-beta.3");

    expect(versionOptions("bug_report.yml")).toEqual([
      "v0.7.0-beta.3",
      "v0.7.0-beta.2",
      "v0.7.0-beta.1",
      "v0.6.0",
      "v0.5.1",
      "v0.5.0",
      "Older / unsure",
    ]);
  });

  it("fails closed when release automation cannot see a complete version set", () => {
    gitTag("v0.7.0-beta.2", "v0.6.0");
    const original = versionTemplate([
      "v0.7.0-beta.2",
      "v0.7.0-beta.1",
      "v0.6.0",
      "v0.5.1",
      "Older / unsure",
    ]);
    writeTemplate("bug_report.yml", original);

    const result = run("v0.7.0", "--require-full-history");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Refusing to update issue templates from an incomplete tag set",
    );
    expect(readTemplate("bug_report.yml")).toBe(original);
  });

  it("accepts the release guard when all dropdown slots can be populated", () => {
    gitTag(
      "v0.5.0",
      "v0.6.0",
      "v0.7.0",
      "v0.8.0-beta.1",
      "v0.8.0-beta.2",
      "v0.8.0-beta.3",
    );
    writeTemplate("bug_report.yml", versionTemplate());

    const result = run("v0.8.0", "--require-full-history");

    expect(result.status).toBe(0);
    expect(versionOptions("bug_report.yml")).toEqual([
      "v0.8.0-beta.3",
      "v0.8.0-beta.2",
      "v0.8.0-beta.1",
      "v0.8.0",
      "v0.7.0",
      "v0.6.0",
      "Older / unsure",
    ]);
  });

  it("a new official tag pushes the oldest official out of the top 3", () => {
    gitTag(
      "v0.4.8",
      "v0.5.0",
      "v0.5.1",
      "v0.6.0",
      "v0.7.0-beta.1",
      "v0.7.0-beta.2",
    );
    writeTemplate("bug_report.yml", versionTemplate());

    run("v0.7.0");

    expect(versionOptions("bug_report.yml")).toEqual([
      "v0.7.0-beta.2",
      "v0.7.0-beta.1",
      "v0.7.0",
      "v0.6.0",
      "v0.5.1",
      "Older / unsure",
    ]);
  });

  it("trims the oldest betas beyond the 3 most recent", () => {
    gitTag(
      "v0.6.0",
      "v0.7.0-beta.1",
      "v0.7.0-beta.2",
      "v0.7.0-beta.3",
      "v0.7.0-beta.4",
    );
    writeTemplate("bug_report.yml", versionTemplate());

    run();

    expect(versionOptions("bug_report.yml")).toEqual([
      "v0.7.0-beta.4",
      "v0.7.0-beta.3",
      "v0.7.0-beta.2",
      "v0.6.0",
      "Older / unsure",
    ]);
  });

  it("ranks betas by semver, not lexically (beta.10 > beta.9 > beta.2)", () => {
    gitTag("v0.6.0", "v0.7.0-beta.2", "v0.7.0-beta.9", "v0.7.0-beta.10");
    writeTemplate("bug_report.yml", versionTemplate());

    run();

    expect(versionOptions("bug_report.yml")).toEqual([
      "v0.7.0-beta.10",
      "v0.7.0-beta.9",
      "v0.7.0-beta.2",
      "v0.6.0",
      "Older / unsure",
    ]);
  });

  it("excludes non-beta pre-releases from the beta slots", () => {
    gitTag(
      "v0.6.0",
      "v0.7.0-rc.1",
      "v0.7.0-rc.2",
      "v0.4.0-electron",
      "v0.7.0-beta.1",
    );
    writeTemplate("bug_report.yml", versionTemplate());

    run();

    expect(versionOptions("bug_report.yml")).toEqual([
      "v0.7.0-beta.1",
      "v0.6.0",
      "Older / unsure",
    ]);
  });

  it("ignores non-version-shaped tags in the repo", () => {
    gitTag(
      "v0.6.0",
      "v0.7.0",
      "release-2024-01",
      "internal-marker",
      "hotfix",
    );
    writeTemplate("bug_report.yml", versionTemplate());

    run();

    expect(versionOptions("bug_report.yml")).toEqual([
      "v0.7.0",
      "v0.6.0",
      "Older / unsure",
    ]);
  });

  it("matches the indentation of the options: key (+2 spaces)", () => {
    gitTag("v0.7.0-beta.3");
    writeTemplate("bug_report.yml", versionTemplate());
    run();
    const line = readTemplate("bug_report.yml")
      .split("\n")
      .find((l) => l.includes("v0.7.0-beta.3"));
    expect(line).toBe("        - v0.7.0-beta.3");
  });

  it("is idempotent: re-running with the same git tags leaves the file unchanged", () => {
    gitTag("v0.6.0", "v0.7.0-beta.1");
    writeTemplate("bug_report.yml", versionTemplate());

    run(); // first run rewrites the dropdown
    const after = readTemplate("bug_report.yml");
    const second = run();

    expect(second.status).toBe(0);
    expect(readTemplate("bug_report.yml")).toBe(after);
    expect(second.stdout).toContain("already up to date, skipping");
  });

  it("preserves non-version options literally", () => {
    gitTag("v0.6.0");
    writeTemplate(
      "bug_report.yml",
      versionTemplate(["v0.6.0", "Older / unsure"]),
    );

    run("v0.7.0");

    expect(versionOptions("bug_report.yml")).toEqual([
      "v0.7.0",
      "v0.6.0",
      "Older / unsure",
    ]);
  });

  it("only touches the version dropdown, not other dropdowns", () => {
    gitTag("v0.7.0");
    const tpl = [
      "body:",
      "  - type: dropdown",
      "    id: version",
      "    attributes:",
      "      label: Version",
      "      options:",
      "        - v0.0.0",
      "  - type: dropdown",
      "    id: platform",
      "    attributes:",
      "      label: Platform",
      "      options:",
      "        - Windows",
      "        - Linux",
      "",
    ].join("\n");
    writeTemplate("bug_report.yml", tpl);

    run();

    const lines = readTemplate("bug_report.yml").split("\n");
    expect(lines.filter((l) => l.includes("v0.7.0"))).toHaveLength(1);
    const platformIdx = lines.findIndex((l) => l.trim() === "id: platform");
    const platformOptionsIdx = lines.findIndex(
      (l, i) => i > platformIdx && l.trim() === "options:",
    );
    expect(lines[platformOptionsIdx + 1]).toBe("        - Windows");
    expect(lines[platformOptionsIdx + 2]).toBe("        - Linux");
  });

  it("reports files that have no version dropdown without changing them", () => {
    gitTag("v0.7.0");
    const tpl = [
      "body:",
      "  - type: textarea",
      "    id: what-happened",
      "    attributes:",
      "      label: What happened?",
      "",
    ].join("\n");
    writeTemplate("config.yml", tpl);

    const result = run();

    expect(result.status).toBe(0);
    expect(readTemplate("config.yml")).toBe(tpl);
    expect(result.stdout).toContain("config.yml: no version dropdown found");
  });

  it("processes both .yml and .yaml files", () => {
    gitTag("v0.7.0-beta.3");
    writeTemplate("bug_report.yml", versionTemplate());
    writeTemplate("question.yaml", versionTemplate());

    const result = run();

    expect(result.status).toBe(0);
    expect(readTemplate("bug_report.yml")).toContain("- v0.7.0-beta.3");
    expect(readTemplate("question.yaml")).toContain("- v0.7.0-beta.3");
    expect(result.stdout).toContain("bug_report.yml: updated version options");
    expect(result.stdout).toContain("question.yaml: updated version options");
  });

  it("ignores non-template files in the directory", () => {
    gitTag("v0.7.0-beta.3");
    writeTemplate("README.md", "# not a template\n- v0.7.0\n");
    writeTemplate("bug_report.yml", versionTemplate());

    const result = run();

    expect(result.status).toBe(0);
    expect(readTemplate("README.md")).toBe("# not a template\n- v0.7.0\n");
    expect(result.stdout).not.toContain("README.md");
  });

  it("preserves CRLF line endings", () => {
    gitTag("v0.7.0-beta.3");
    writeTemplate("bug_report.yml", versionTemplate().replace(/\n/g, "\r\n"));

    run();

    const out = readTemplate("bug_report.yml");
    expect(out).toContain("\r\n");
    expect(out).not.toMatch(/[^\r]\n/);
    expect(out).toContain("        - v0.7.0-beta.3\r\n");
  });

  it("preserves LF line endings", () => {
    gitTag("v0.7.0-beta.3");
    writeTemplate("bug_report.yml", versionTemplate());

    run();

    const out = readTemplate("bug_report.yml");
    expect(out).not.toContain("\r\n");
  });

  it("prints a summary when no files change", () => {
    gitTag("v0.7.0");
    const tpl = ["body:", "  - type: input", "    id: foo", ""].join("\n");
    writeTemplate("config.yml", tpl);

    const result = run();

    expect(result.stdout).toContain("No files changed.");
  });

  it("exits 1 with a helpful message when not run in a git repo", () => {
    // Replace the temp dir with a fresh one that has NO .git directory.
    rmSync(cwd, { recursive: true, force: true });
    cwd = mkdtempSync(join(tmpdir(), "issue-tpl-nogit-"));
    templateDir = join(cwd, ".github", "ISSUE_TEMPLATE");
    mkdirSync(templateDir, { recursive: true });
    writeTemplate("bug_report.yml", versionTemplate());

    const result = run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Failed to list git tags");
  });
});
