export interface FolderState {
  draft: string
  onDraft: (value: string) => void
  onSubmit: () => void
  busy: boolean
  canRescan: boolean
  error: string | null
  emptyFolder: string | null
}

export function FolderForm({ folder, stacked = false }: { folder: FolderState; stacked?: boolean }) {
  const { draft, onDraft, onSubmit, busy, canRescan, error, emptyFolder } = folder
  return (
    <div className="flex flex-col gap-2">
      <form
        className={`flex gap-2 ${stacked ? "flex-col" : "flex-wrap items-center"}`}
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <label htmlFor="folder" className={stacked ? "text-xs font-medium text-ink-2" : "sr-only"}>Project folder</label>
        <input
          id="folder"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          placeholder="C:\\path\\to\\adt-studio"
          spellCheck={false}
          className={`min-w-0 ${stacked ? "w-full" : "flex-1 basis-80"} rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent`}
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          className="press rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          {busy ? "Scanning…" : canRescan ? "Rescan" : "Open folder"}
        </button>
      </form>
      <p className="max-w-[72ch] text-xs leading-relaxed text-muted">
        The ADT Studio project folder, its books folder, or a single book. The local server reads each conversion&apos;s database (llm_log and step_runs) and builds the comparison.
      </p>
      {error && <p className="text-sm text-bad">{error}</p>}
      {emptyFolder && <p className="text-sm text-bad">No conversions found in {emptyFolder}. Use the ADT Studio project folder, its books folder, or a single book folder.</p>}
    </div>
  )
}
