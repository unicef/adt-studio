# Sample package excerpts

Curated excerpts from verified ADT exports, rendered by `<PackageExplorer />`
on /docs/reader-support/packages. The collection is a reference set, not a
required file naming convention, and may contain more than one source export.

These are **excerpts**, not whole files — long resource lists and boilerplate
are elided so each file shows the part that teaches something.

Regenerate from a fresh set of exports:

```bash
node apps/site/scripts/build-package-samples.mjs --extract <dir-with-webpub-epub>
```

Re-highlight without re-extracting (e.g. after a theme change):

```bash
node apps/site/scripts/build-package-samples.mjs
```

Not scanned by fumadocs — only `content/docs/` is.
