import { cpSync, existsSync, mkdirSync } from "fs";
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
  configFolderPath: string;
  adtResourcesZip: string;
  webAssetsDir: string;
  localTtsModelsDir: string;
  localLlmModelsDir: string;
  localLlmRuntimeDir: string;
}

export function resolvePaths(): ApiServerPaths {
  const appDataDir = app.getPath("userData");
  const booksDir = join(appDataDir, "books");
  const localTtsModelsDir = join(appDataDir, "models", "tts");
  const localLlmModelsDir = join(appDataDir, "models", "llm");

  if (!existsSync(booksDir)) {
    mkdirSync(booksDir, { recursive: true });
  }
  if (!existsSync(localTtsModelsDir)) mkdirSync(localTtsModelsDir, { recursive: true });
  if (!existsSync(localLlmModelsDir)) mkdirSync(localLlmModelsDir, { recursive: true });

  const root = resolveAppResourcesRoot();

  console.table({
    "App data dir": appDataDir,
    "Books dir": booksDir,
    Root: root,
  });

  if (app.isPackaged) {
    const promptsDir = join(appDataDir, "prompts");
    const templatesDir = join(appDataDir, "templates");
    const configPath = join(appDataDir, "config.yaml");
    const configFolderPath = join(appDataDir, "config");

    // Packaged resources are signed/read-only. Merge newly shipped defaults
    // into userData on every upgrade without overwriting user-edited files.
    cpSync(join(root, "prompts"), promptsDir, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
    cpSync(join(root, "templates"), templatesDir, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
    if (!existsSync(configPath)) cpSync(join(root, "config.yaml"), configPath);
    cpSync(join(root, "config"), configFolderPath, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });

    return {
      serverPath: join(root, "api/api-server.mjs"),
      root,
      booksDir,
      promptsDir,
      configPath,
      configFolderPath,
      adtResourcesZip: join(root, "assets", "adt-resources.zip"),
      webAssetsDir: join(root, "assets", "adt"),
      localTtsModelsDir,
      localLlmModelsDir,
      localLlmRuntimeDir: join(root, "llama"),
    };
  }

  return {
    serverPath: join(root, "apps", "api", "dist-electron", "api-server.mjs"),
    root,
    booksDir,
    promptsDir: join(root, "prompts"),
    configPath: join(root, "config.yaml"),
    configFolderPath: join(root, "config"),
    adtResourcesZip: join(root, "assets", "adt-resources.zip"),
    webAssetsDir: join(root, "assets", "adt"),
    localTtsModelsDir,
    localLlmModelsDir,
    localLlmRuntimeDir: join(root, "apps", "desktop", ".runtime", "llama"),
  };
}
