import { createRootRoute, Link, Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="flex h-14 items-center px-6">
          <Link to="/" className="text-lg font-semibold">
            ADT Studio
          </Link>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
