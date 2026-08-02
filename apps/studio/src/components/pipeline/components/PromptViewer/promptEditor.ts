import type { BeforeMount } from "@monaco-editor/react"

export const PROMPT_EDITOR_LANGUAGE = "adt-liquid"
export const PROMPT_EDITOR_THEME = "adt-studio-light"
export const PROMPT_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  wordWrap: "on",
  wrappingIndent: "same",
  fontSize: 12,
  lineHeight: 20,
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Monaco font stack, not UI copy.
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  detectIndentation: false,
  renderLineHighlight: "line",
  renderWhitespace: "selection",
  stickyScroll: { enabled: false },
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  padding: { top: 12, bottom: 12 },
  scrollbar: {
    alwaysConsumeMouseWheel: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
} as const

export const configurePromptEditor: BeforeMount = (monaco) => {
  const hasLanguage = monaco.languages
    .getLanguages()
    .some((language: { id: string }) => language.id === PROMPT_EDITOR_LANGUAGE)

  if (!hasLanguage) {
    monaco.languages.register({ id: PROMPT_EDITOR_LANGUAGE })
  }

  monaco.languages.setMonarchTokensProvider(PROMPT_EDITOR_LANGUAGE, {
    tokenizer: {
      root: [
        [/\{#[\s\S]*?#\}/, "comment"],
        [/\{%[\s\S]*?%\}/, "keyword"],
        [/\{\{[\s\S]*?\}\}/, "variable"],
        [/"[^"]*"/, "string"],
        [/'[^']*'/, "string"],
        [/\b(true|false|null|nil|and|or|not|in|contains)\b/, "operator"],
        [/\b(if|else|elsif|endif|case|when|for|endfor|assign|capture|endcapture|include|render)\b/, "keyword"],
      ],
    },
  })

  monaco.languages.setLanguageConfiguration(PROMPT_EDITOR_LANGUAGE, {
    brackets: [
      ["{{", "}}"],
      ["{%", "%}"],
      ["{#", "#}"],
      ["(", ")"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "{{", close: "}}" },
      { open: "{%", close: "%}" },
      { open: "{#", close: "#}" },
      { open: "\"", close: "\"" },
      { open: "'", close: "'" },
      { open: "(", close: ")" },
      { open: "[", close: "]" },
    ],
    surroundingPairs: [
      { open: "\"", close: "\"" },
      { open: "'", close: "'" },
      { open: "(", close: ")" },
      { open: "[", close: "]" },
    ],
  })

  monaco.editor.defineTheme(PROMPT_EDITOR_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "64748b", fontStyle: "italic" },
      { token: "keyword", foreground: "7c3aed" },
      { token: "operator", foreground: "0f766e" },
      { token: "string", foreground: "b45309" },
      { token: "variable", foreground: "2563eb" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#111827",
      "editor.lineHighlightBackground": "#f8fafc",
      "editor.selectionBackground": "#ccfbf1",
      "editor.inactiveSelectionBackground": "#e2e8f0",
      "editorCursor.foreground": "#0f766e",
      "editorLineNumber.foreground": "#94a3b8",
      "editorLineNumber.activeForeground": "#0f766e",
      "editorGutter.background": "#ffffff",
      "editorIndentGuide.background1": "#e5e7eb",
      "editorIndentGuide.activeBackground1": "#cbd5e1",
      "scrollbarSlider.background": "#cbd5e166",
      "scrollbarSlider.hoverBackground": "#94a3b880",
      "scrollbarSlider.activeBackground": "#64748b99",
    },
  })
}
