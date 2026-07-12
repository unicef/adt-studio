import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, CheckCircle2, Send, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StudioTopBar } from "@/components/StudioTopBar"
import { useAddStudentProfile, useDeleteStudentProfile, useGeneratePersonalizedMaterial, useStudent } from "@/hooks/use-students"
import { useBooks } from "@/hooks/use-books"
import { classroomApi, getPublicMaterialUrl, type ClassroomMaterial } from "@/api/classroom-client"
import { api, type StageRunProviderCredentials } from "@/api/client"
import { getWorkspace } from "@/features/workspace/config"
import { publishInteractiveMaterial, syncGeneratedMaterial } from "@/features/workspace/material-sync"
import { useApiKey } from "@/hooks/use-api-key"
import { STAGE_ORDER } from "@adt/types"

export const Route = createFileRoute("/students/$studentId")({ component: StudentPage })

async function waitForStage(bookLabel: string, stage: string): Promise<void> {
  for (let attempt = 0; attempt < 1_800; attempt++) {
    const status = await api.getStepStatus(bookLabel)
    if (status.stages[stage] === "done") return
    if (status.stages[stage] === "error") throw new Error(status.error ?? `${stage} failed`)
    await new Promise((resolve) => window.setTimeout(resolve, 1_000))
  }
  throw new Error(`${stage} did not finish in time`)
}

async function completePersonalizedPipeline(
  bookLabel: string,
  apiKey: string,
  credentials: StageRunProviderCredentials,
): Promise<void> {
  const firstStage = STAGE_ORDER[0]
  // The Package stage is performed by syncGeneratedMaterial via the dedicated
  // package-adt endpoint immediately after this run. Complete every content
  // generation stage here, including Speech, before that final packaging step.
  const finalStage = STAGE_ORDER[STAGE_ORDER.length - 2]
  await api.runStages(bookLabel, apiKey, { fromStage: firstStage, toStage: finalStage }, credentials)
  await waitForStage(bookLabel, finalStage)
}

function CompletedMaterialActions({
  bookLabel,
  material,
  parentEmail,
  onPublished,
}: {
  bookLabel: string
  material: ClassroomMaterial
  parentEmail: string
  onPublished: (material: ClassroomMaterial) => void
}) {
  const { t } = useLingui()
  const workspace = getWorkspace()
  const [email, setEmail] = useState(parentEmail)
  const [publishing, setPublishing] = useState(false)
  const [status, setStatus] = useState("")
  const publicUrl = workspace ? getPublicMaterialUrl(material.id, workspace.teacherId) : null

  return <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-4"><p className={material.syncStatus === "synced" ? "text-sm text-green-700" : "text-sm text-destructive"}>{material.syncStatus === "synced" ? <Trans>Synced to Cloudflare</Trans> : <Trans>Cloud sync failed</Trans>}</p><div className="mt-2 flex flex-wrap gap-2"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t`Parent email`} className="max-w-xs" /><Button disabled={!workspace || !email} onClick={async () => { if (!workspace) return; try { await classroomApi.sendToParent(workspace.teacherId, material.id, email); setStatus(t`Material successfully sent to parent.`) } catch { setStatus(t`Cloud synchronization failed. You can retry from the workspace.`) } }}><Send className="mr-2 h-4 w-4" /><Trans>Send to Parent</Trans></Button><Button variant="outline" disabled={!workspace || publishing} onClick={async () => { setPublishing(true); try { onPublished(await publishInteractiveMaterial(bookLabel, material)); setStatus(t`Interactive material published. Open it in a new tab.`) } catch { setStatus(t`Cloud synchronization failed. You can retry from the workspace.`) } finally { setPublishing(false) } }}>{publishing ? <Trans>Publishing...</Trans> : <Trans>Publish interactive version</Trans>}</Button>{publicUrl && <Button variant="outline" asChild><a href={publicUrl} target="_blank" rel="noreferrer"><Trans>Open material</Trans></a></Button>}</div>{publicUrl && <a href={publicUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-primary underline underline-offset-2"><Trans>Cloudflare-hosted export link</Trans></a>}{status && <p className="mt-2 text-sm text-green-700">{status}</p>}</div>
}

function StudentPage() {
  const { studentId } = Route.useParams()
  const { t } = useLingui()
  const { data: student } = useStudent(studentId)
  const { data: books } = useBooks()
  const addProfile = useAddStudentProfile(studentId)
  const deleteProfile = useDeleteStudentProfile(studentId)
  const generate = useGeneratePersonalizedMaterial()
  const keys = useApiKey()

  const [name, setName] = useState("")
  const [comments, setComments] = useState("")
  const [rules, setRules] = useState({ simplifyLanguage: true, addImages: false, generateAudio: false, shortenActivities: false, chunkContent: true })
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [bookLabel, setBookLabel] = useState("")
  const [generatedBookLabel, setGeneratedBookLabel] = useState("")
  const [cloudMaterial, setCloudMaterial] = useState<ClassroomMaterial | null>(null)
  const [sendStatus, setSendStatus] = useState("")

  const ruleLabels: Record<string, string> = {
    simplifyLanguage: t`Simplify language`,
    addImages: t`Add images`,
    generateAudio: t`Generate audio`,
    shortenActivities: t`Shorten activities`,
    chunkContent: t`Chunk content`,
  }

  if (!student) return <div className="flex min-h-0 flex-1 flex-col"><StudioTopBar brandLinksHome /><main className="p-6"><Trans>Loading student…</Trans></main></div>

  const selectedProfile = student.accessibilityProfiles.find((profile) => profile.id === selectedProfileId) ?? student.accessibilityProfiles[0] ?? null

  const handleGenerate = () => generate.mutate(
    { studentId, sourceBookLabel: bookLabel, profileId: selectedProfile?.id },
    {
      onSuccess: async (result) => {
        try {
          if (!keys.hasApiKey) throw new Error("API key required")
          const credentials: StageRunProviderCredentials = {
            anthropicApiKey: keys.anthropicKey || undefined,
            googleApiKey: keys.googleKey || undefined,
            customBaseUrl: keys.customBaseUrl || undefined,
            customApiKey: keys.customApiKey || undefined,
            azure: { key: keys.azureKey, region: keys.azureRegion },
            geminiApiKey: keys.geminiKey || undefined,
          }
          await completePersonalizedPipeline(result.material.derivedBookLabel, keys.apiKey, credentials)
          const materialTitle = `${selectedProfile?.name ?? student.firstName} material`
          setGeneratedBookLabel(result.material.derivedBookLabel)
          setCloudMaterial(await syncGeneratedMaterial(result.material.derivedBookLabel, student.parentEmail, materialTitle))
        } catch {
          setSendStatus(t`Cloud synchronization failed. You can retry from the workspace.`)
        }
      },
    },
  )

  return <div className="flex min-h-0 flex-1 flex-col"><StudioTopBar brandLinksHome trailingTitle={<Trans>Student profile</Trans>} /><main className="mx-auto w-full max-w-5xl space-y-8 overflow-auto p-6">
    <Link to="/students" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" /><Trans>Back to students</Trans></Link>
    <section><h1 className="text-2xl font-semibold">{student.firstName} {student.lastName}</h1><p className="text-muted-foreground">{student.grade || t`No grade set`}</p>{student.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{student.notes}</p>}</section>
    <section className="rounded-lg border p-5"><h2 className="text-lg font-semibold"><Trans>Personalized material</Trans></h2><p className="mb-4 text-sm text-muted-foreground"><Trans>Create an independent, versioned copy of a book using this student’s active adaptations.</Trans></p><div className="flex flex-wrap gap-3"><select value={bookLabel} onChange={(event) => setBookLabel(event.target.value)} className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm" aria-label={t`Choose a book`}><option value=""><Trans>Choose a book</Trans></option>{books?.map((book) => <option key={book.label} value={book.label}>{book.title ?? book.label}</option>)}</select><Button disabled={!bookLabel || generate.isPending} onClick={handleGenerate}><Sparkles className="mr-2 h-4 w-4" /><Trans>Generate personalized copy</Trans></Button></div>{generate.isSuccess && <div className="mt-3 text-sm"><p className="text-green-700"><Trans>Personalized material created. It is available in your book library.</Trans></p></div>}{cloudMaterial && generatedBookLabel && <CompletedMaterialActions bookLabel={generatedBookLabel} material={cloudMaterial} parentEmail={student.parentEmail} onPublished={setCloudMaterial} />}{sendStatus && <p className="mt-2 text-sm text-destructive">{sendStatus}</p>}</section>
    <section className="grid gap-6 lg:grid-cols-5"><div className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-3"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold"><Trans>Accessibility profiles</Trans></h2></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">{student.accessibilityProfiles.length}</span></div><div role="radiogroup" className="space-y-3">{student.accessibilityProfiles.map((profile) => { const isSelected = selectedProfile?.id === profile.id; const enabledRules = Object.entries(profile.adaptations).filter(([, enabled]) => enabled); return <div key={profile.id} className={`group flex gap-3 rounded-xl border p-1 transition-colors ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"}`}><button type="button" role="radio" aria-checked={isSelected} onClick={() => setSelectedProfileId(profile.id)} className="min-w-0 flex-1 rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{profile.name}</p>{profile.description && <p className="mt-1 text-sm text-muted-foreground">{profile.description}</p>}</div>{isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}</div><div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-3">{enabledRules.map(([key]) => <span key={key} className="rounded-md border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-xs">{ruleLabels[key] ?? key}</span>)}</div>{profile.comments && <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{profile.comments}</p>}</button><Button variant="ghost" size="icon" aria-label={t`Delete profile`} title={t`Delete profile`} disabled={deleteProfile.isPending} onClick={() => deleteProfile.mutate(profile.id)} className="mt-1 shrink-0"><Trash2 className="h-4 w-4 text-destructive" /></Button></div> })}{student.accessibilityProfiles.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Trans>No profiles added yet.</Trans></p>}</div></div>
      <form className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2" onSubmit={(event) => { event.preventDefault(); addProfile.mutate({ name, description: "", templateId: null, supportLevel: "moderate", adaptations: rules, recommendations: [], comments }, { onSuccess: () => { setName(""); setComments("") } }) }}><h2 className="mb-3 text-lg font-semibold"><Trans>Add accessibility profile</Trans></h2><div className="space-y-4"><div><Label htmlFor="profile-name"><Trans>Profile name</Trans></Label><Input id="profile-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder={t`For example, reading support`} /></div><div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/30 p-3 text-sm">{Object.entries(rules).map(([key, checked]) => <label key={key} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-background"><input type="checkbox" checked={checked} onChange={(event) => setRules((current) => ({ ...current, [key]: event.target.checked }))} /><span>{ruleLabels[key]}</span></label>)}</div><div><Label htmlFor="profile-comments"><Trans>Comments</Trans></Label><Textarea id="profile-comments" value={comments} onChange={(event) => setComments(event.target.value)} /></div><Button type="submit" disabled={addProfile.isPending} className="w-full"><Trans>Add profile</Trans></Button></div></form>
    </section>
  </main></div>
}
