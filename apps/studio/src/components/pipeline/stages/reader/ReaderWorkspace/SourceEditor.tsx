import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import Editor, { DiffEditor, type OnMount } from "@monaco-editor/react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api/client"
import { configureSourceEditor, SOURCE_EDITOR_OPTIONS, sourceLanguage } from "./source-language"
import { EditorToolbar } from "./EditorToolbar"
import type { ReaderWorkspaceState } from "./use-reader-workspace"

type MonacoEditor = Parameters<OnMount>[0]
type Monaco = Parameters<OnMount>[1]

export function SourceEditor({ workspace }: { workspace: ReaderWorkspaceState }) {
  const { t } = useLingui()
  const [comparing, setComparing] = useState(false)
  const editorRef = useRef<MonacoEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const { selected, file, reveal, compileErrors } = workspace

  const base = useQuery({
    queryKey: [...workspace.key, "base", selected],
    queryFn: () => api.readerSourceBase(workspace.prefix, selected ?? ""),
    enabled: comparing && selected !== null,
  })

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !reveal || reveal.path !== selected) return
    editor.revealLineInCenter(reveal.line)
    editor.setPosition({ lineNumber: reveal.line, column: 1 })
    editor.focus()
  }, [reveal, selected, file.data])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    const monaco = monacoRef.current
    if (!model || !monaco) return
    monaco.editor.setModelMarkers(
      model,
      "reader-compile",
      compileErrors
        .filter((error) => error.path === selected && error.line > 0 && error.line <= model.getLineCount())
        .map((error) => ({
          severity: monaco.MarkerSeverity.Error,
          message: error.message,
          startLineNumber: error.line,
          endLineNumber: error.line,
          startColumn: error.column + 1,
          endColumn: model.getLineMaxColumn(error.line),
        })),
    )
  }, [compileErrors, selected, workspace.content])

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {workspace.label ? (
          <Trans>Choose a file on the left, click an element in the preview, or ask the assistant for a change.</Trans>
        ) : (
          <Trans>Choose a file on the left to edit the global reader.</Trans>
        )}
      </div>
    )
  }

  const language = sourceLanguage(selected)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorToolbar workspace={workspace} comparing={comparing} onCompareChange={setComparing} />
      {workspace.error && (
        <p role="alert" className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
          {workspace.error}
        </p>
      )}
      <div className="min-h-0 flex-1">
        {file.isPending ? (
          <div className="p-4 text-sm text-muted-foreground">
            <Trans>Loading file...</Trans>
          </div>
        ) : comparing ? (
          <DiffEditor
            original={base.data?.base ?? ""}
            modified={workspace.content}
            language={language}
            beforeMount={configureSourceEditor}
            options={{ ...SOURCE_EDITOR_OPTIONS, readOnly: true, renderSideBySide: true }}
            height="100%"
          />
        ) : (
          <Editor
            path={selected}
            value={workspace.content}
            language={language}
            beforeMount={configureSourceEditor}
            onMount={(editor, monaco) => {
              editorRef.current = editor
              monacoRef.current = monaco
            }}
            onChange={(value) => workspace.setContent(value ?? "")}
            options={{ ...SOURCE_EDITOR_OPTIONS, ariaLabel: t`Source of ${selected}` }}
            height="100%"
          />
        )}
      </div>
    </div>
  )
}
