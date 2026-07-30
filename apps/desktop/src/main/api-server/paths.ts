import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { app } from "electron";

function resolveAppResourcesRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return join(app.getAppPath(), "..", "..");
}

export interface ApiServerPaths {
  serverPath: string;
  root: string;
  booksDir: string;
  promptsDir: string;
  promptOverridesDir: string;
  configPath: string;
  adtResourcesZip: string;
  webAssetsDir: string;
}

export function resolvePaths(): ApiServerPaths {
  const appDataDir = app.getPath("userData");
  const booksDir = join(appDataDir, "books");
  const promptOverridesDir = join(appDataDir, "prompt-overrides");

  for (const writableDir of [booksDir, promptOverridesDir]) {
    if (!existsSync(writableDir)) {
      mkdirSync(writableDir, { recursive: true });
    }
  }

  const root = resolveAppResourcesRoot();

  console.table({
    "App data dir": appDataDir,
    "Books dir": booksDir,
    Root: root,
  });

  if (app.isPackaged) {
    return {
      serverPath: join(root, "api/api-server.mjs"),
      root,
      booksDir,
      promptsDir: join(root, "prompts"),
      promptOverridesDir,
      configPath: join(root, "config.yaml"),
      adtResourcesZip: join(root, "assets", "adt-resources.zip"),
      webAssetsDir: join(root, "assets", "adt"),
    };
  }

  return {
    serverPath: join(root, "apps", "api", "dist-electron", "api-server.mjs"),
    root,
    booksDir,
    promptsDir: join(root, "prompts"),
    promptOverridesDir,
    configPath: join(root, "config.yaml"),
    adtResourcesZip: join(root, "assets", "adt-resources.zip"),
    webAssetsDir: join(root, "assets", "adt"),
  };
}
