import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { getWorkspace } from "@/features/workspace/config"

export const Route = createFileRoute("/students")({ component: StudentsGate })
function StudentsGate() {
  const navigate = useNavigate()
  if (getWorkspace()) return <Outlet />
  return <main className="grid min-h-screen place-items-center p-6"><section className="w-full max-w-lg rounded-xl border bg-card p-8 shadow-sm"><h1 className="text-2xl font-semibold"><Trans>Connect to your Workspace</Trans></h1><p className="mt-3 text-sm text-muted-foreground"><Trans>Connect your Cloudflare workspace to save students and materials.</Trans></p><Button className="mt-6" onClick={() => navigate({ to: "/workspace/setup", search: { teacherId: crypto.randomUUID() } })}><Trans>Connect Workspace</Trans></Button></section></main>
}
