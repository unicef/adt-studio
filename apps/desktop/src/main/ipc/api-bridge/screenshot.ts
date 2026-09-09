import {
  screenshotIpcReplyErrorSchema,
  screenshotIpcReplySuccessSchema,
  screenshotIpcUtilityToMainSchema,
} from "@adt/types";
import {
  screenshot,
  close as closeScreenshotWindows,
} from "../../services/screenshot";

/*
    The child (API) process cannot access Electron APIs directly, 
    so the main process handles screenshot operations on its behalf via IPC messaging.
*/
export function handleScreenshotMessages(apiProcess: Electron.UtilityProcess) {
  return async (msg: unknown) => {
    const parsed = screenshotIpcUtilityToMainSchema.safeParse(msg);
    if (!parsed.success) {
      // Not a screenshot message — let other handlers process it.
      return;
    }

    const m = parsed.data;

    if (m.type === "screenshot-base64") {
      try {
        const base64 = await screenshot(
          m.html,
          m.viewport ?? { width: 1024, height: 768 },
          m.timeoutMs,
        );
        apiProcess.postMessage(
          screenshotIpcReplySuccessSchema.parse({
            type: "screenshot-base64-reply",
            id: m.id,
            base64,
          }),
        );
      } catch (error) {
        apiProcess.postMessage(
          screenshotIpcReplyErrorSchema.parse({
            type: "screenshot-base64-reply",
            id: m.id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      return;
    }

    if (m.type === "screenshot-close") {
      await closeScreenshotWindows();
    }
  };
}
