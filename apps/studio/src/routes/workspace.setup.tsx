import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { connectWorkspace } from "@/features/workspace/config"

export const Route = createFileRoute("/workspace/setup")({ validateSearch: (search: Record<string, unknown>) => ({ teacherId: typeof search.teacherId === "string" ? search.teacherId : "" }), component: WorkspaceSetup })
function WorkspaceSetup() { const { teacherId } = Route.useSearch(); const navigate = useNavigate(); const { t } = useLingui(); const [accountId, setAccountId] = useState("023f5496258aaffe23087c2e04a31037"); const [d1DatabaseId, setD1DatabaseId] = useState("2c6a5bc9-c1d9-4375-8af9-904b4ecc6a3d"); const [r2BucketName, setR2BucketName] = useState("adt-classroom-materials"); return <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 p-6"><div><h1 className="text-2xl font-semibold"><Trans>Finish workspace setup</Trans></h1><p className="text-sm text-muted-foreground"><Trans>Your Cloudflare account is connected. Add the resources that ADT Studio will use.</Trans></p></div><div className="space-y-4"><Field id="account" label={t`Cloudflare account ID`} value={accountId} onChange={setAccountId} /><Field id="d1" label={t`D1 database ID`} value={d1DatabaseId} onChange={setD1DatabaseId} /><Field id="r2" label={t`R2 bucket name`} value={r2BucketName} onChange={setR2BucketName} /></div><Button disabled={!teacherId || !accountId || !d1DatabaseId || !r2BucketName} onClick={() => { connectWorkspace({ accountId, d1DatabaseId, r2BucketName, teacherId, connectedAt: new Date().toISOString() }); navigate({ to: "/students" }) }}><Trans>Connect workspace</Trans></Button></main> }
function Field({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} required value={value} onChange={(event) => onChange(event.target.value)} /></div> }
