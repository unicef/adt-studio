import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { StudioTopBar } from "@/components/StudioTopBar"
import { useAddStudentProfile, useGeneratePersonalizedMaterial, useStudent } from "@/hooks/use-students"
import { useBooks } from "@/hooks/use-books"

export const Route = createFileRoute("/students/$studentId")({ component: StudentPage })
function StudentPage() {
  const { studentId } = Route.useParams(); const { t } = useLingui(); const { data: student } = useStudent(studentId); const { data: books } = useBooks(); const addProfile = useAddStudentProfile(studentId); const generate = useGeneratePersonalizedMaterial()
  const [name, setName] = useState(""); const [comments, setComments] = useState(""); const [rules, setRules] = useState({ simplifyLanguage: true, addImages: false, generateAudio: false, shortenActivities: false, chunkContent: true }); const [bookLabel, setBookLabel] = useState("")
  const ruleLabels: Record<string, string> = { simplifyLanguage: t`Simplify language`, addImages: t`Add images`, generateAudio: t`Generate audio`, shortenActivities: t`Shorten activities`, chunkContent: t`Chunk content` }
  if (!student) return <div className="flex min-h-0 flex-1 flex-col"><StudioTopBar brandLinksHome /><main className="p-6"><Trans>Loading student…</Trans></main></div>
  return <div className="flex min-h-0 flex-1 flex-col"><StudioTopBar brandLinksHome trailingTitle={<Trans>Student profile</Trans>} /><main className="mx-auto w-full max-w-5xl space-y-8 overflow-auto p-6">
    <Link to="/students" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" /><Trans>Back to students</Trans></Link>
    <section><h1 className="text-2xl font-semibold">{student.firstName} {student.lastName}</h1><p className="text-muted-foreground">{student.grade || t`No grade set`}</p>{student.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{student.notes}</p>}</section>
    <section className="rounded-lg border p-5"><h2 className="text-lg font-semibold"><Trans>Personalized material</Trans></h2><p className="mb-4 text-sm text-muted-foreground"><Trans>Create an independent, versioned copy of a book using this student’s active adaptations.</Trans></p><div className="flex flex-wrap gap-3"><select value={bookLabel} onChange={(event) => setBookLabel(event.target.value)} className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm" aria-label={t`Choose a book`}><option value=""><Trans>Choose a book</Trans></option>{books?.map((book) => <option key={book.label} value={book.label}>{book.title ?? book.label}</option>)}</select><Button disabled={!bookLabel || generate.isPending} onClick={() => generate.mutate({ studentId, sourceBookLabel: bookLabel })}><Sparkles className="mr-2 h-4 w-4" /><Trans>Generate personalized copy</Trans></Button></div>{generate.isSuccess && <p className="mt-3 text-sm text-green-700"><Trans>Personalized material created. It is available in your book library.</Trans></p>}</section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-lg border p-5"><h2 className="mb-3 text-lg font-semibold"><Trans>Accessibility profiles</Trans></h2><div className="space-y-2">{student.accessibilityProfiles.map((profile) => <div key={profile.id} className="rounded border p-3"><p className="font-medium">{profile.name}</p>{profile.description && <p className="text-sm text-muted-foreground">{profile.description}</p>}</div>)}{student.accessibilityProfiles.length === 0 && <p className="text-sm text-muted-foreground"><Trans>No profiles added yet.</Trans></p>}</div></div>
      <form className="rounded-lg border p-5" onSubmit={(event) => { event.preventDefault(); addProfile.mutate({ name, description: "", templateId: null, supportLevel: "moderate", adaptations: rules, recommendations: [], comments }, { onSuccess: () => { setName(""); setComments("") } }) }}><h2 className="mb-3 text-lg font-semibold"><Trans>Add accessibility profile</Trans></h2><div className="space-y-3"><div><Label htmlFor="profile-name"><Trans>Profile name</Trans></Label><Input id="profile-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder={t`For example, reading support`} /></div><div className="grid grid-cols-2 gap-2 text-sm">{Object.entries(rules).map(([key, checked]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(event) => setRules((current) => ({ ...current, [key]: event.target.checked }))} /><span>{ruleLabels[key]}</span></label>)}</div><div><Label htmlFor="profile-comments"><Trans>Comments</Trans></Label><Textarea id="profile-comments" value={comments} onChange={(event) => setComments(event.target.value)} /></div><Button type="submit" disabled={addProfile.isPending}><Trans>Add profile</Trans></Button></div></form>
    </section>
  </main></div>
}
