import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { completeCloudflareLogin } from "@/features/workspace/config"

export const Route = createFileRoute("/workspace/callback")({ component: WorkspaceCallback })
function WorkspaceCallback() { const navigate = useNavigate(); const [error, setError] = useState(""); useEffect(() => { completeCloudflareLogin(window.location.search).then(({ teacherId }) => navigate({ to: "/workspace/setup", search: { teacherId } })).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to connect your Cloudflare account.")) }, [navigate]); return <main className="grid min-h-screen place-items-center p-6"><p className="max-w-md text-center">{error || <Trans>Connecting your Cloudflare workspace…</Trans>}</p></main> }
