import { dirname, join } from "path";
import { app, utilityProcess, type UtilityProcess } from "electron";
import { resolvePaths } from "./paths";
import { waitForApiReady } from "./wait-ready";
import type { LogForwarder } from "./types";
import { pushDebugLog } from "../services/debug-info";

let apiProcess: UtilityProcess | null = null;
let apiPort: number | null = null;
let logForwarder: LogForwarder | null = null;
const isApiDebugMode = process.env.ADT_DEBUG === "true";

const READY_TIMEOUT_MS = 120_000;

function setLogForwarder(fn: LogForwarder | null): void {
  logForwarder = fn;
}

async function startApiServer(): Promise<{
  apiProcess: UtilityProcess;
  apiPort: number;
}> {
  if (apiProcess && apiPort) return { apiProcess, apiPort };

  const paths = resolvePaths();

  console.table({
    "Starting API server": paths.serverPath,
    "Books dir": paths.booksDir,
    "Prompts dir": paths.promptsDir,
    "Config path": paths.configPath,
    "Debug mode": isApiDebugMode ? "true" : "false",
  });

  // Development uses the Studio Vite proxy's standard API port so the LAN
  // URL (for example, http://192.168.x.x:5173) works outside Electron too.
  // Packaged builds still use port 0, allowing the OS to select a free port.
  apiProcess = utilityProcess.fork(paths.serverPath, [], {
    cwd: paths.root,
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? "production",
      NODE_PATH: join(dirname(paths.serverPath), "node_modules"),
      BOOKS_DIR: paths.booksDir,
      PROMPTS_DIR: paths.promptsDir,
      CONFIG_PATH: paths.configPath,
      PROJECT_ROOT: paths.root,
      ADT_RESOURCES_ZIP: paths.adtResourcesZip,
      WEB_ASSETS_DIR: paths.webAssetsDir,
      STUDIO_ASSETS_DIR: paths.studioAssetsDir,
      ADT_ENVIRONMENT: "electron",
      ...(!app.isPackaged ? { PORT: process.env.PORT ?? "3001" } : {}),
    },
  });

  apiProcess.stdout?.on("data", (data: Buffer) => {
    const line = data.toString().trimEnd();
    console.log("[api-server]", line);
    const entry = { stream: "stdout" as const, line, timestamp: Date.now() };
    pushDebugLog(entry);
    if (isApiDebugMode) logForwarder?.(entry);
  });

  apiProcess.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trimEnd();
    console.error("[api-server]", line);
    const entry = { stream: "stderr" as const, line, timestamp: Date.now() };
    pushDebugLog(entry);
    if (isApiDebugMode) logForwarder?.(entry);
  });

  const exitBeforeReady = new Promise<never>((_, reject) => {
    apiProcess!.once("exit", (code) =>
      reject(new Error(`API server exited early (code=${code})`)),
    );
  });

  apiProcess.on("exit", (code) => {
    console.log(`[api-process] API server exited (code=${code})`);
    pushDebugLog({
      stream: "main",
      line: `API server exited (code=${code})`,
      timestamp: Date.now(),
    });
    apiProcess = null;
    apiPort = null;
  });

  const ready = await Promise.race([
    waitForApiReady(apiProcess, READY_TIMEOUT_MS),
    exitBeforeReady,
  ]);

  apiPort = ready.port;

  console.log(`[api-process] API server ready on port ${apiPort}`);

  return { apiProcess, apiPort };
}

function stopApiServer(): void {
  if (!apiProcess) return;

  console.log("[api-process] Stopping API server");
  apiProcess.kill();
  apiProcess = null;
  apiPort = null;
}

export {
  apiProcess,
  apiPort,
  startApiServer,
  stopApiServer,
  setLogForwarder,
  isApiDebugMode,
};
