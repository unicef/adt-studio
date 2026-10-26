import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessibilityAuditIpcUtilityToMainSchema } from "@adt/types";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  close: vi.fn(),
  resolvePaths: vi.fn(),
}));

vi.mock("../../services/accessibility-audit", () => ({
  audit: mocks.audit,
  close: mocks.close,
}));

vi.mock("../../api-server/paths", () => ({
  resolvePaths: mocks.resolvePaths,
}));

import {
  handleAccessibilityAuditMessages,
  validateAuditFilePath,
} from "./accessibility-audit";

const temporaryDirectories: string[] = [];

function createFixture(): { rootDir: string; booksDir: string } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-audit-path-"));
  const booksDir = path.join(rootDir, "books");
  fs.mkdirSync(booksDir);
  temporaryDirectories.push(rootDir);
  return { rootDir, booksDir };
}

afterEach(() => {
  mocks.audit.mockReset();
  mocks.close.mockReset();
  mocks.resolvePaths.mockReset();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("validateAuditFilePath", () => {
  it("accepts a regular file inside the books directory", () => {
    const { booksDir } = createFixture();
    const filePath = path.join(booksDir, "page.html");
    fs.writeFileSync(filePath, "<main />");

    expect(validateAuditFilePath(filePath, fs.realpathSync(booksDir))).toBe(
      fs.realpathSync(filePath),
    );
  });

  it("rejects a .. path that resolves outside the books directory", () => {
    const { rootDir, booksDir } = createFixture();
    const outsideFile = path.join(rootDir, "outside.html");
    fs.writeFileSync(outsideFile, "<main />");

    expect(() =>
      validateAuditFilePath(
        path.join(booksDir, "..", "outside.html"),
        fs.realpathSync(booksDir),
      ),
    ).toThrow(/inside the books directory/);
  });

  it("rejects a symlink to a file outside the books directory", () => {
    const { rootDir, booksDir } = createFixture();
    const outsideDir = path.join(rootDir, "outside");
    const outsideFile = path.join(outsideDir, "page.html");
    const linkedDir = path.join(booksDir, "linked-outside");
    fs.mkdirSync(outsideDir);
    fs.writeFileSync(outsideFile, "<main />");
    // A junction is a directory symlink on Windows and does not require the
    // privilege that a file symlink does. It also exercises realpath's
    // protection against a path that traverses a reparse point.
    fs.symlinkSync(outsideDir, linkedDir, "junction");

    expect(() =>
      validateAuditFilePath(
        path.join(linkedDir, "page.html"),
        fs.realpathSync(booksDir),
      ),
    ).toThrow(/inside the books directory/);
  });

  it("rejects a directory inside the books directory", () => {
    const { booksDir } = createFixture();
    const directory = path.join(booksDir, "page-directory");
    fs.mkdirSync(directory);

    expect(() =>
      validateAuditFilePath(directory, fs.realpathSync(booksDir)),
    ).toThrow(/regular file/);
  });

  it("rejects a missing file", () => {
    const { booksDir } = createFixture();

    expect(() =>
      validateAuditFilePath(
        path.join(booksDir, "missing.html"),
        fs.realpathSync(booksDir),
      ),
    ).toThrow();
  });

  it("rejects the books directory itself", () => {
    const { booksDir } = createFixture();

    expect(() =>
      validateAuditFilePath(booksDir, fs.realpathSync(booksDir)),
    ).toThrow(/inside the books directory/);
  });
});

describe("accessibility audit IPC", () => {
  it("rejects an outside file before invoking the browser audit", async () => {
    const { rootDir, booksDir } = createFixture();
    const filePath = path.join(rootDir, "outside.html");
    fs.writeFileSync(filePath, "<main />");
    mocks.resolvePaths.mockReturnValue({ booksDir });
    const postMessage = vi.fn();
    const handler = handleAccessibilityAuditMessages({ postMessage } as never);
    const id = "c2c50630-8c37-4ac8-9f93-9c1245f2d16f";

    await handler({ type: "axe-audit", id, filePath, ruleIds: [] });

    expect(mocks.audit).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: "axe-audit-reply",
      id,
      error: expect.stringContaining("inside the books directory"),
    });
  });

  it("never forwards child-supplied JavaScript to the browser audit", async () => {
    const { booksDir } = createFixture();
    const filePath = path.join(booksDir, "page.html");
    fs.writeFileSync(filePath, "<main />");
    mocks.resolvePaths.mockReturnValue({ booksDir });
    const handler = handleAccessibilityAuditMessages({
      postMessage: vi.fn(),
    } as never);

    await handler({
      type: "axe-audit",
      id: "c2c50630-8c37-4ac8-9f93-9c1245f2d16f",
      filePath,
      ruleIds: [],
      axeSource: "globalThis.injected = true",
    });

    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not accept axeSource from the API utility process", () => {
    const result = accessibilityAuditIpcUtilityToMainSchema.safeParse({
      type: "axe-audit",
      id: "c2c50630-8c37-4ac8-9f93-9c1245f2d16f",
      filePath: "/books/page.html",
      ruleIds: ["color-contrast"],
      axeSource: "window.axe = maliciousSource",
    });

    expect(result.success).toBe(false);
  });

  it("resolves the books root once when the handler is registered", async () => {
    const { booksDir } = createFixture();
    const filePath = path.join(booksDir, "page.html");
    fs.writeFileSync(filePath, "<main />");
    mocks.resolvePaths.mockReturnValue({ booksDir });
    mocks.audit.mockResolvedValue({
      title: null,
      violations: [],
      incomplete: [],
      passCount: 0,
      inapplicableCount: 0,
    });
    const apiProcess = { postMessage: vi.fn() } as never;
    const handler = handleAccessibilityAuditMessages(apiProcess);
    const request = {
      type: "axe-audit" as const,
      id: "c2c50630-8c37-4ac8-9f93-9c1245f2d16f",
      filePath,
      ruleIds: ["color-contrast"],
    };

    await handler(request);
    await handler({ ...request, id: "8017df48-84b5-43a0-9aea-b7189e8b3bdf" });

    expect(mocks.resolvePaths).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledTimes(2);
  });
});
