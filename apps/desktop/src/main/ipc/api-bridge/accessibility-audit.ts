import fs from "node:fs";
import path from "node:path";
import { resolvePaths } from "../../api-server/paths";
import {
  accessibilityAuditIpcReplyErrorSchema,
  accessibilityAuditIpcReplySuccessSchema,
  accessibilityAuditIpcUtilityToMainSchema,
} from "@adt/types";
import {
  audit,
  close as closeAccessibilityAuditWindows,
} from "../../services/accessibility-audit";

function getAxeSource(mod: unknown): string {
  if (typeof mod === "object" && mod !== null && "source" in mod) {
    const source = (mod as { source?: unknown }).source;
    if (typeof source === "string") return source;
  }
  if (typeof mod === "object" && mod !== null && "default" in mod) {
    const source = (mod as { default?: { source?: unknown } }).default?.source;
    if (typeof source === "string") return source;
  }
  throw new Error("Unable to load axe-core source");
}

function validateAuditFilePath(filePath: string): string {
  const { booksDir } = resolvePaths();
  const booksRoot = fs.realpathSync(booksDir);
  const resolvedFilePath = fs.realpathSync(filePath);
  const relativePath = path.relative(booksRoot, resolvedFilePath);

  if (
    !relativePath ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    !fs.statSync(resolvedFilePath).isFile()
  ) {
    throw new Error("Accessibility audit file must be a regular file inside the books directory");
  }

  return resolvedFilePath;
}

/*
    The child (API) process cannot access Electron APIs directly,
    so the main process handles accessibility audit operations on its behalf via IPC messaging.
*/
export function handleAccessibilityAuditMessages(
  apiProcess: Electron.UtilityProcess,
) {
  return async (msg: unknown) => {
    const parsed = accessibilityAuditIpcUtilityToMainSchema.safeParse(msg);
    if (!parsed.success) {
      // Not an accessibility audit message — let other handlers process it.
      return;
    }

    const m = parsed.data;

    if (m.type === "axe-audit") {
      try {
        const filePath = validateAuditFilePath(m.filePath);
        const axeSource = getAxeSource(await import("axe-core"));
        const result = await audit({
          filePath,
          ruleIds: m.ruleIds,
          axeSource,
          viewport: m.viewport,
        });
        apiProcess.postMessage(
          accessibilityAuditIpcReplySuccessSchema.parse({
            type: "axe-audit-reply",
            id: m.id,
            title: result.title,
            violations: result.violations,
            incomplete: result.incomplete,
            passCount: result.passCount,
            inapplicableCount: result.inapplicableCount,
          }),
        );
      } catch (error) {
        apiProcess.postMessage(
          accessibilityAuditIpcReplyErrorSchema.parse({
            type: "axe-audit-reply",
            id: m.id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      return;
    }

    if (m.type === "axe-audit-close") {
      await closeAccessibilityAuditWindows();
    }
  };
}
