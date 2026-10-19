export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/85 backdrop-blur-md">
      <div className="flex min-h-14 items-center gap-2.5 px-4 py-2 lg:px-6">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-accent text-white">
          <svg viewBox="0 0 16 16" className="size-4">
            <path d="M3 12.5V8m3.3 4.5V4m3.4 8.5V6.5m3.3 6V3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <h1 className="text-sm font-medium text-ink">ADT Conversion Compare</h1>
      </div>
    </header>
  )
}
