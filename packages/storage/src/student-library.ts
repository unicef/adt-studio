import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import sqlite from "node-sqlite3-wasm"
import type {
  AccessibilityProfileInput,
  AccessibilityTemplate,
  AssignmentStatus,
  Material,
  MaterialAssignment,
  MaterialDelivery,
  Student,
  StudentInput,
} from "@adt/types"

const { Database } = sqlite
const STUDENT_LIBRARY_VERSION = 1

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, grade TEXT NOT NULL,
  age INTEGER, notes TEXT NOT NULL, parent_name TEXT NOT NULL, parent_email TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
CREATE TABLE IF NOT EXISTS accessibility_templates (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, criteria TEXT NOT NULL, support_level TEXT NOT NULL,
  recommendations TEXT NOT NULL, adaptation_rules TEXT NOT NULL, examples TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
CREATE TABLE IF NOT EXISTS student_accessibility_profiles (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), template_id TEXT REFERENCES accessibility_templates(id),
  name TEXT NOT NULL, description TEXT NOT NULL, support_level TEXT NOT NULL, adaptations TEXT NOT NULL,
  recommendations TEXT NOT NULL, comments TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), source_book_label TEXT NOT NULL,
  derived_book_label TEXT NOT NULL UNIQUE, adaptation_plan TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS material_assignments (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), material_id TEXT NOT NULL REFERENCES materials(id),
  status TEXT NOT NULL, assigned_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS assignment_events (
  id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES material_assignments(id), old_status TEXT,
  new_status TEXT NOT NULL, note TEXT NOT NULL, occurred_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS material_deliveries (
  id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES material_assignments(id), method TEXT NOT NULL,
  recipient TEXT NOT NULL, status TEXT NOT NULL, sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(last_name, first_name) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_student ON student_accessibility_profiles(student_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_materials_student ON materials(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_student_status ON material_assignments(student_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_assignment ON material_deliveries(assignment_id, sent_at DESC);
`

type StudentRow = { id: string; first_name: string; last_name: string; grade: string; age: number | null; notes: string; parent_name: string; parent_email: string; created_at: string; updated_at: string }
type ProfileRow = { id: string; student_id: string; template_id: string | null; name: string; description: string; support_level: "low" | "moderate" | "high"; adaptations: string; recommendations: string; comments: string; created_at: string; updated_at: string }

function parseJson<T>(value: string): T { return JSON.parse(value) as T }
function toProfile(row: ProfileRow) {
  return { id: row.id, studentId: row.student_id, templateId: row.template_id, name: row.name, description: row.description, supportLevel: row.support_level, adaptations: parseJson<Record<string, boolean>>(row.adaptations), recommendations: parseJson<string[]>(row.recommendations), comments: row.comments, createdAt: row.created_at, updatedAt: row.updated_at }
}

export function studentLibraryPath(booksDir: string): string {
  return path.join(path.resolve(booksDir), ".adt-studio", "student-library.db")
}

export function createStudentLibrary(booksDir: string) {
  const dbPath = studentLibraryPath(booksDir)
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.exec("PRAGMA foreign_keys = ON")
  db.exec(SCHEMA_SQL)
  db.run("INSERT INTO schema_version (id, version) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version", [STUDENT_LIBRARY_VERSION])

  const profilesFor = (studentId: string) => (db.all("SELECT * FROM student_accessibility_profiles WHERE student_id = ? AND archived_at IS NULL ORDER BY created_at", [studentId]) as ProfileRow[]).map(toProfile)
  const toStudent = (row: StudentRow): Student => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, grade: row.grade, age: row.age, notes: row.notes, parentName: row.parent_name, parentEmail: row.parent_email, accessibilityProfiles: profilesFor(row.id), createdAt: row.created_at, updatedAt: row.updated_at })

  return {
    listStudents(search = ""): Student[] {
      const pattern = `%${search.trim()}%`
      const rows = db.all(`SELECT * FROM students WHERE archived_at IS NULL AND (first_name LIKE ? OR last_name LIKE ? OR grade LIKE ?) ORDER BY last_name, first_name`, [pattern, pattern, pattern]) as StudentRow[]
      return rows.map(toStudent)
    },
    getStudent(id: string): Student | null {
      const row = db.all("SELECT * FROM students WHERE id = ? AND archived_at IS NULL", [id])[0] as StudentRow | undefined
      return row ? toStudent(row) : null
    },
    createStudent(input: StudentInput): Student {
      const now = new Date().toISOString(); const id = randomUUID()
      db.run("INSERT INTO students VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)", [id, input.firstName, input.lastName, input.grade, input.age, input.notes, input.parentName, input.parentEmail, now, now])
      return this.getStudent(id)!
    },
    updateStudent(id: string, input: StudentInput): Student | null {
      const now = new Date().toISOString()
      const result = db.run("UPDATE students SET first_name=?, last_name=?, grade=?, age=?, notes=?, parent_name=?, parent_email=?, updated_at=? WHERE id=? AND archived_at IS NULL", [input.firstName, input.lastName, input.grade, input.age, input.notes, input.parentName, input.parentEmail, now, id])
      return result.changes ? this.getStudent(id) : null
    },
    archiveStudent(id: string): boolean { return db.run("UPDATE students SET archived_at=?, updated_at=? WHERE id=? AND archived_at IS NULL", [new Date().toISOString(), new Date().toISOString(), id]).changes > 0 },
    addProfile(studentId: string, input: AccessibilityProfileInput) {
      const now = new Date().toISOString(); const id = randomUUID()
      db.run("INSERT INTO student_accessibility_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)", [id, studentId, input.templateId, input.name, input.description, input.supportLevel, JSON.stringify(input.adaptations), JSON.stringify(input.recommendations), input.comments, now, now])
      return profilesFor(studentId).find((profile) => profile.id === id)!
    },
    deleteProfile(studentId: string, id: string): boolean { return db.run("UPDATE student_accessibility_profiles SET archived_at=?, updated_at=? WHERE id=? AND student_id=? AND archived_at IS NULL", [new Date().toISOString(), new Date().toISOString(), id, studentId]).changes > 0 },
    listTemplates(): AccessibilityTemplate[] {
      const rows = db.all("SELECT * FROM accessibility_templates WHERE archived_at IS NULL ORDER BY category") as Array<Record<string, string>>
      return rows.map((r) => ({ id: r.id, category: r.category, criteria: r.criteria, supportLevel: r.support_level as "low" | "moderate" | "high", recommendations: parseJson<string[]>(r.recommendations), adaptationRules: parseJson<Record<string, boolean>>(r.adaptation_rules), examples: parseJson<string[]>(r.examples), createdAt: r.created_at, updatedAt: r.updated_at }))
    },
    createTemplate(input: Omit<AccessibilityTemplate, "id" | "createdAt" | "updatedAt">): AccessibilityTemplate {
      const id = randomUUID(), now = new Date().toISOString()
      db.run("INSERT INTO accessibility_templates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)", [id, input.category, input.criteria, input.supportLevel, JSON.stringify(input.recommendations), JSON.stringify(input.adaptationRules), JSON.stringify(input.examples), now, now])
      return { id, ...input, createdAt: now, updatedAt: now }
    },
    createMaterial(studentId: string, sourceBookLabel: string, derivedBookLabel: string, adaptationPlan: Record<string, boolean>): Material {
      const id = randomUUID(), now = new Date().toISOString()
      db.run("INSERT INTO materials VALUES (?, ?, ?, ?, ?, 'ready', ?)", [id, studentId, sourceBookLabel, derivedBookLabel, JSON.stringify(adaptationPlan), now])
      return { id, studentId, sourceBookLabel, derivedBookLabel, adaptationPlan, status: "ready", createdAt: now }
    },
    createAssignment(studentId: string, materialId: string): MaterialAssignment {
      const id = randomUUID(), now = new Date().toISOString()
      db.run("INSERT INTO material_assignments VALUES (?, ?, ?, 'PENDING', ?, NULL)", [id, studentId, materialId, now])
      db.run("INSERT INTO assignment_events VALUES (?, ?, NULL, 'PENDING', '', ?)", [randomUUID(), id, now])
      return { id, studentId, materialId, status: "PENDING", assignedAt: now, completedAt: null }
    },
    updateAssignmentStatus(id: string, status: AssignmentStatus): MaterialAssignment | null {
      const previous = db.all("SELECT * FROM material_assignments WHERE id=?", [id])[0] as { student_id: string; material_id: string; status: AssignmentStatus; assigned_at: string; completed_at: string | null } | undefined
      if (!previous) return null
      const completedAt = status === "COMPLETED" ? new Date().toISOString() : null
      db.run("UPDATE material_assignments SET status=?, completed_at=? WHERE id=?", [status, completedAt, id])
      db.run("INSERT INTO assignment_events VALUES (?, ?, ?, ?, '', ?)", [randomUUID(), id, previous.status, status, new Date().toISOString()])
      return { id, studentId: previous.student_id, materialId: previous.material_id, status, assignedAt: previous.assigned_at, completedAt }
    },
    listAssignments(studentId: string): MaterialAssignment[] {
      return (db.all("SELECT * FROM material_assignments WHERE student_id=? ORDER BY assigned_at DESC", [studentId]) as Array<{ id: string; student_id: string; material_id: string; status: AssignmentStatus; assigned_at: string; completed_at: string | null }>).map((r) => ({ id: r.id, studentId: r.student_id, materialId: r.material_id, status: r.status, assignedAt: r.assigned_at, completedAt: r.completed_at }))
    },
    recordDelivery(assignmentId: string, method: "manual" | "email" | "share-link", recipient: string): MaterialDelivery {
      const id = randomUUID(), sentAt = new Date().toISOString()
      db.run("INSERT INTO material_deliveries VALUES (?, ?, ?, ?, 'recorded', ?)", [id, assignmentId, method, recipient, sentAt])
      return { id, assignmentId, method, recipient, status: "recorded", sentAt }
    },
    dashboard() {
      const count = (sql: string) => Number((db.all(sql)[0] as { count: number }).count)
      return { totalStudents: count("SELECT COUNT(*) AS count FROM students WHERE archived_at IS NULL"), studentsRequiringSupport: count("SELECT COUNT(DISTINCT student_id) AS count FROM student_accessibility_profiles WHERE archived_at IS NULL"), assignedMaterials: count("SELECT COUNT(*) AS count FROM material_assignments"), completedMaterials: count("SELECT COUNT(*) AS count FROM material_assignments WHERE status='COMPLETED'"), pendingMaterials: count("SELECT COUNT(*) AS count FROM material_assignments WHERE status='PENDING'"), materialsSent: count("SELECT COUNT(*) AS count FROM material_deliveries") }
    },
    close(): void { db.close() },
  }
}
