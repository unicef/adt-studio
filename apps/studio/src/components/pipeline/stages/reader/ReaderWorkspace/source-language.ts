import type { BeforeMount } from "@monaco-editor/react"

const LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  css: "css",
  json: "json",
}

export function sourceLanguage(path: string): string {
  return LANGUAGES[path.split(".").pop() ?? ""] ?? "plaintext"
}

export const configureSourceEditor: BeforeMount = (monaco) => {
  const compilerOptions = { jsx: monaco.languages.typescript.JsxEmit.ReactJSX, allowNonTsExtensions: true }
  for (const defaults of [monaco.languages.typescript.typescriptDefaults, monaco.languages.typescript.javascriptDefaults]) {
    defaults.setCompilerOptions(compilerOptions)
    defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
  }
}

export const SOURCE_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
} as const
