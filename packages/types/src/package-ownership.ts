import { z } from "zod"

/** Local artifact receipt. Book-local page IDs alone do not establish origin.
 * `bookId` is null only for a book whose identity record is unavailable; such a
 * receipt matches only a book that still has no identity. */
export const PackageOwnershipReceipt = z.object({
  format: z.literal("adt-package-owners-v2"),
  bookId: z.string().uuid().nullable(),
  entries: z.array(z.tuple([z.string().min(1), z.string().nullable(), z.string().regex(/^[a-f0-9]{64}$/)])),
  preloader: z.string().regex(/^[a-f0-9]{64}$/),
})
export type PackageOwnershipReceipt = z.infer<typeof PackageOwnershipReceipt>

/** Local files declared by the generated Webpub reader. */
export const DerivedWebpubFiles = z.object({
  readingOrder: z.array(z.object({ href: z.string().min(1) })).nonempty(),
  resources: z.array(z.object({ href: z.string().min(1) })),
})
