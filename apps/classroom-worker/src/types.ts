export interface AccessibilityProfile { readingLevel: string; preferredLanguage: string; simplifiedLanguage: boolean; symbolSupport: boolean; audioSupport: boolean; attentionSupport: boolean; notes: string }
export interface Student { id: string; teacherId: string; firstName: string; lastName: string; profile: AccessibilityProfile; createdAt: string; updatedAt: string }
export interface Material { id: string; teacherId: string; studentId: string | null; title: string; body: string; r2Key: string | null; createdAt: string; updatedAt: string }
export interface ClassroomSession { id: string; materialId: string; joinCode: string; shareUrl: string; expiresAt: string; createdAt: string }
