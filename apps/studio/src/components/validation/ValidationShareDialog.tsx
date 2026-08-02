import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Copy, ExternalLink, Link2, Loader2, RefreshCw, ShieldX } from "lucide-react"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function ValidationShareDialog({ label }: { label: string }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const [days, setDays] = useState("14")
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(true)
  const [copied, setCopied] = useState(false)
  const shares = useQuery({
    queryKey: ["validation-shares", label],
    queryFn: () => api.getValidationShares(label),
  })
  const createShare = useMutation({
    mutationFn: () => api.createValidationShare(label, Number(days)),
    onSuccess: (result) => {
      setCreatedUrl(result.url)
      setIsPublic(result.publicly_reachable)
      void queryClient.invalidateQueries({ queryKey: ["validation-shares", label] })
    },
  })
  const revokeShare = useMutation({
    mutationFn: (shareId: string) => api.revokeValidationShare(label, shareId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["validation-shares", label] }),
  })
  const publishShare = useMutation({
    mutationFn: (shareId: string) => api.publishValidationShare(label, shareId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["validation-shares", label] }),
  })
  const activeShares = (shares.data?.shares ?? []).filter(({ share }) =>
    !share.revoked_at && Date.parse(share.expires_at) > Date.now(),
  )

  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm"><Link2 className="h-4 w-4" /><Trans>Share for validation</Trans></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle><Trans>Share book for validation</Trans></DialogTitle>
          <DialogDescription><Trans>Create an expiring link where validators can test content, narration, sign language, and accessibility without exporting the book.</Trans></DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="share-expiry"><Trans>Link expiry</Trans></Label>
            <Select value={days} onValueChange={setDays}><SelectTrigger id="share-expiry"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="7"><Trans>7 days</Trans></SelectItem><SelectItem value="14"><Trans>14 days</Trans></SelectItem><SelectItem value="30"><Trans>30 days</Trans></SelectItem>
            </SelectContent></Select>
          </div>
          <Button className="w-full" disabled={createShare.isPending} onClick={() => createShare.mutate()}>
            {createShare.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}<Trans>Publish validation link</Trans>
          </Button>
          {createShare.error ? <p className="text-sm text-destructive">{createShare.error.message}</p> : null}
          {createdUrl ? <div className="rounded-lg border p-3"><p className="break-all text-sm">{createdUrl}</p>
            {!isPublic ? <p className="mt-2 text-sm text-amber-700"><Trans>This is a local link. Configure VALIDATION_PUBLIC_BASE_URL to a deployed ADT address before sending it to another device.</Trans></p> : null}
            <div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(createdUrl); setCopied(true) }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? t`Copied` : t`Copy link`}</Button>
              <Button variant="outline" size="sm" asChild><a href={createdUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /><Trans>Open</Trans></a></Button></div>
          </div> : null}
          {activeShares.length > 0 ? <div className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold"><Trans>Active links</Trans></h3>
            {activeShares.map(({ share }) => <div key={share.share_id} className="rounded-md border px-3 py-2 text-sm"><div className="flex items-center justify-between gap-3"><span><Trans>Expires</Trans> {new Date(share.expires_at).toLocaleDateString()}</span><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={publishShare.isPending} onClick={() => publishShare.mutate(share.share_id)}><RefreshCw className="h-4 w-4" /><Trans>Publish latest fixes</Trans></Button><Button variant="ghost" size="sm" disabled={revokeShare.isPending} onClick={() => revokeShare.mutate(share.share_id)}><ShieldX className="h-4 w-4" /><Trans>Revoke</Trans></Button></div></div><p className="mt-1 text-xs text-muted-foreground"><Trans>Published revision:</Trans> {share.package_version}</p></div>)}
          </div> : null}
          {(shares.data?.feedback.length ?? 0) > 0 ? <p className="text-sm text-muted-foreground"><Trans>{shares.data?.feedback.length ?? 0} validator feedback items are saved in this book.</Trans></p> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
