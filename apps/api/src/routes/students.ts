import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { createBookStorage, createStudentLibrary } from "@adt/storage"
import {
  AccessibilityProfileInput,
  AccessibilityTemplate,
  AssignmentStatus,
  StudentInput,
  parseBookLabel,
} from "@adt/types"
import { buildAccessibilityPlan, personalizationPromptContext } from "@adt/pipeline"

const TemplateInput = AccessibilityTemplate.omit({ id: true, createdAt: true, updatedAt: true })
const GenerateInput = z.object({ studentId: z.string().uuid(), sourceBookLabel: z.string() })
const DeliveryInput = z.object({ method: z.enum(["manual", "email", "share-link"]).default("manual"), recipient: z.string().max(320).default("") })

function parseOr400<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) throw new HTTPException(400, { message: result.error.message })
  return result.data
}
function normalizeStudent(input: z.infer<typeof StudentInput>): { firstName: string; lastName: string; grade: string; age: number | null; notes: string; parentName: string; parentEmail: string } {
  return { ...input, grade: input.grade ?? "", notes: input.notes ?? "", parentName: input.parentName ?? "", parentEmail: input.parentEmail ?? "" }
}
function normalizeProfile(input: z.infer<typeof AccessibilityProfileInput>): { templateId: string | null; name: string; description: string; supportLevel: "low" | "moderate" | "high"; adaptations: Record<string, boolean>; recommendations: string[]; comments: string } {
  return { ...input, description: input.description ?? "", adaptations: input.adaptations ?? {}, recommendations: input.recommendations ?? [], comments: input.comments ?? "" }
}
function normalizeTemplate(input: z.infer<typeof TemplateInput>): { category: string; criteria: string; supportLevel: "low" | "moderate" | "high"; recommendations: string[]; adaptationRules: Record<string, boolean>; examples: string[] } {
  return { ...input, criteria: input.criteria ?? "", recommendations: input.recommendations ?? [], adaptationRules: input.adaptationRules ?? {}, examples: input.examples ?? [] }
}

export function createStudentRoutes(booksDir: string): Hono {
  const app = new Hono()

  app.get("/students", (c) => {
    const library = createStudentLibrary(booksDir)
    try { return c.json(library.listStudents(c.req.query("search") ?? "")) } finally { library.close() }
  })
  app.get("/students/:id", (c) => {
    const library = createStudentLibrary(booksDir)
    try {
      const student = library.getStudent(c.req.param("id"))
      if (!student) throw new HTTPException(404, { message: "Student not found" })
      return c.json(student)
    } finally { library.close() }
  })
  app.post("/students", async (c) => {
    const library = createStudentLibrary(booksDir)
    try { return c.json(library.createStudent(normalizeStudent(parseOr400(StudentInput, await c.req.json()) as any) as never), 201) } finally { library.close() }
  })
  app.put("/students/:id", async (c) => {
    const library = createStudentLibrary(booksDir)
    try {
      const student = library.updateStudent(c.req.param("id"), normalizeStudent(parseOr400(StudentInput, await c.req.json()) as any) as never)
      if (!student) throw new HTTPException(404, { message: "Student not found" })
      return c.json(student)
    } finally { library.close() }
  })
  app.delete("/students/:id", (c) => {
    const library = createStudentLibrary(booksDir)
    try {
      if (!library.archiveStudent(c.req.param("id"))) throw new HTTPException(404, { message: "Student not found" })
      return c.json({ ok: true })
    } finally { library.close() }
  })
  app.post("/students/:id/profiles", async (c) => {
    const library = createStudentLibrary(booksDir)
    try {
      if (!library.getStudent(c.req.param("id"))) throw new HTTPException(404, { message: "Student not found" })
      return c.json(library.addProfile(c.req.param("id"), normalizeProfile(parseOr400(AccessibilityProfileInput, await c.req.json()) as any) as never), 201)
    } finally { library.close() }
  })
  app.delete("/students/:studentId/profiles/:profileId", (c) => {
    const library = createStudentLibrary(booksDir)
    try {
      if (!library.deleteProfile(c.req.param("studentId"), c.req.param("profileId"))) throw new HTTPException(404, { message: "Profile not found" })
      return c.json({ ok: true })
    } finally { library.close() }
  })
  app.get("/accessibility-templates", (c) => {
    const library = createStudentLibrary(booksDir)
    try { return c.json(library.listTemplates()) } finally { library.close() }
  })
  app.post("/accessibility-templates", async (c) => {
    const library = createStudentLibrary(booksDir)
    try { return c.json(library.createTemplate(normalizeTemplate(parseOr400(TemplateInput, await c.req.json()) as any) as never), 201) } finally { library.close() }
  })
  app.get("/dashboard", (c) => {
    const library = createStudentLibrary(booksDir)
    try { return c.json(library.dashboard()) } finally { library.close() }
  })

  app.post("/materials/personalized", async (c) => {
    const input = parseOr400(GenerateInput, await c.req.json())
    const sourceBookLabel = parseBookLabel(input.sourceBookLabel)
    const sourceDir = path.join(path.resolve(booksDir), sourceBookLabel)
    if (!fs.existsSync(path.join(sourceDir, `${sourceBookLabel}.db`))) throw new HTTPException(404, { message: "Source book not found" })
    const library = createStudentLibrary(booksDir)
    try {
      const student = library.getStudent(input.studentId)
      if (!student) throw new HTTPException(404, { message: "Student not found" })
      const derivedBookLabel = `${sourceBookLabel}-student-${student.id.slice(0, 8)}-${Date.now()}`
      const derivedDir = path.join(path.resolve(booksDir), derivedBookLabel)
      fs.cpSync(sourceDir, derivedDir, { recursive: true, errorOnExist: true })
      const oldDbPath = path.join(derivedDir, `${sourceBookLabel}.db`)
      const newDbPath = path.join(derivedDir, `${derivedBookLabel}.db`)
      fs.renameSync(oldDbPath, newDbPath)
      const plan = buildAccessibilityPlan(student)
      const storage = createBookStorage(derivedBookLabel, booksDir)
      try {
        storage.putNodeData("personalization", "material", { studentId: student.id, sourceBookLabel, plan, promptContext: personalizationPromptContext(plan), generatedAt: new Date().toISOString() })
      } finally { storage.close() }
      const material = library.createMaterial(student.id, sourceBookLabel, derivedBookLabel, plan.rules)
      const assignment = library.createAssignment(student.id, material.id)
      return c.json({ material, assignment, plan }, 201)
    } finally { library.close() }
  })
  app.get("/students/:id/assignments", (c) => {
    const library = createStudentLibrary(booksDir)
    try { return c.json(library.listAssignments(c.req.param("id"))) } finally { library.close() }
  })
  app.post("/assignments/:id/status", async (c) => {
    const status = parseOr400(z.object({ status: AssignmentStatus }), await c.req.json()).status
    const library = createStudentLibrary(booksDir)
    try {
      const assignment = library.updateAssignmentStatus(c.req.param("id"), status)
      if (!assignment) throw new HTTPException(404, { message: "Assignment not found" })
      return c.json(assignment)
    } finally { library.close() }
  })
  app.post("/assignments/:id/deliveries", async (c) => {
    const input = parseOr400(DeliveryInput, await c.req.json())
    const library = createStudentLibrary(booksDir)
    try { return c.json(library.recordDelivery(c.req.param("id"), input.method ?? "manual", input.recipient ?? ""), 201) } finally { library.close() }
  })
  return app
}
