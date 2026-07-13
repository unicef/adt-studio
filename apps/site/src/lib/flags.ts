/**
 * Build/runtime feature flags for the site.
 *
 * `DOCS_ENABLED` gates the entire `/docs` section (routes, nav/footer links,
 * home Docs scene, search) while the documentation is still being written and
 * translated. Flip this to `true` — no other changes required — to publish the
 * docs once the content is ready.
 */
export const DOCS_ENABLED = false;
