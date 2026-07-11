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
  configPath: string;
  adtResourcesZip: string;
  webAssetsDir: string;
  studioAssetsDir: string;
}

export function resolvePaths(): ApiServerPaths {
  const appDataDir = app.getPath("userData");
  const booksDir = join(appDataDir, "books");

  if (!existsSync(booksDir)) {
    mkdirSync(booksDir, { recursive: true });
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
      configPath: join(root, "config.yaml"),
      adtResourcesZip: join(root, "assets", "adt-resources.zip"),
      webAssetsDir: join(root, "assets", "adt"),
      studioAssetsDir: join(root, "studio"),
    };
  }

  return {
    serverPath: join(root, "apps", "api", "dist-electron", "api-server.mjs"),
    root,
    booksDir,
    promptsDir: join(root, "prompts"),
    configPath: join(root, "config.yaml"),
    adtResourcesZip: join(root, "assets", "adt-resources.zip"),
    webAssetsDir: join(root, "assets", "adt"),
    studioAssetsDir: join(root, "apps", "studio", "dist"),
  };
}
