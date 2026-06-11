import tseslint from "typescript-eslint"
import linguiPlugin from "eslint-plugin-lingui"

export default [
  { ignores: ["src/locales/**/*", "src/i18n/locales.ts", "dist/**", "src/**/*.test.*", "src/**/*.d.ts"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { lingui: linguiPlugin },
    rules: {
      "lingui/no-unlocalized-strings": [
        "error",
        {
          ignoreNames: [
            // --- HTML / JSX structural attributes ---
            { regex: { pattern: "className", flags: "i" } },
            "style",
            "id",
            "type",
            "href",
            "src",
            "key",
            "name",
            "target",
            "rel",
            "role",
            "loading",
            "htmlFor",
            { regex: { pattern: "^data-" } },
            // Identifier-like prop/variable ending with "id" or "Id"
            { regex: { pattern: "^[A-Za-z0-9_]*(id|Id)$" } },

            // --- SVG attributes ---
            "fill",
            "d",
            "viewBox",
            "strokeLinecap",
            "strokeLinejoin",
            "strokeDasharray",
            "stroke",
            "points",
            "transform",
            "gradientUnits",
            "offset",
            "stopColor",

            // --- Layout / variant props ---
            "variant",
            "size",
            "align",
            "side",
            "top",
            "bottom",
            "left",
            "right",

            // --- CSS class & color props (never user-visible) ---
            "color",
            "hex",
            "tint",
            "fg",
            "bg",
            "textColor",
            "borderColor",
            "iconColor",
            "colorClass",
            "bgColor",
            "accentBg",
            "imageSrc",
            { regex: { pattern: "Class$" } },
            { regex: { pattern: "Color$" } },
            { regex: { pattern: "Bg$" } },

            // --- Data / config identifiers ---
            "slug",
            "num",
            "category",
            "mode",

            // --- i18n locale metadata ---
            "LOCALE_LABEL_MESSAGES",
            "LOCALE_FLAGS",
          ],
          ignoreFunctions: [
            // --- Console / logging ---
            "console.*",
            "*.log",
            "*.warn",
            "*.error",
            "*.info",
            "*.debug",

            // --- Error constructors ---
            "Error",
            "TypeError",
            "RangeError",

            // --- API / fetch calls ---
            "request",
            "fetch",

            // --- DOM manipulation / events ---
            "document.createElement",
            "*.setAttribute",
            "*.getAttribute",
            "*.querySelector",
            "*.querySelectorAll",
            "*.closest",
            "*.setProperty",
            "*.getContext",
            "*.addEventListener",
            "*.removeEventListener",
            "*.scrollIntoView",
            "*.scrollTo",

            // --- String / array operations ---
            "*.replace",
            "*.startsWith",
            "*.endsWith",
            "*.includes",

            // --- URL / search params ---
            "*.set",
            "*.get",
            "*.delete",
            "new URL",
            "new URLSearchParams",

            // --- Analytics (event/category identifiers + Matomo command strings, not UI copy) ---
            "trackEvent",
            "trackDownload",
            "trackPageView",
            "push",

            // --- CSS class composition utilities ---
            "cn",
            "clsx",

            // --- Math / formatting ---
            "*.toFixed",
          ],
          ignore: [
            // project brand name (intentional non-translatable literal)
            "^ADT Studio$",
            // npm package names and module paths
            "^@?[a-zA-Z0-9_-]+(/[a-zA-Z0-9_.-]+)+",
            // TypeScript path aliases (e.g. "@/lib/cn")
            "^@/[a-zA-Z0-9_.-]+(/[a-zA-Z0-9_.-]+)*$",
            // locale codes (e.g. "en", "pt-BR", "es")
            "^[a-z]{2}(-[A-Z]{2})?$",
            // absolute URLs
            "^https?://",
            // relative URL paths and hash routes (e.g. "/api", "#/download", "#/releases/")
            "^#?/[a-zA-Z0-9_-]?",
            // Tailwind CSS classes, internal identifiers, status values
            "^[a-z][a-z0-9._:-]*$",
            // Multi-class Tailwind strings
            "^[a-z][a-z0-9._:/-]*( [a-z!][a-z0-9._:/-]*)+$",
            // Tailwind classes with arbitrary-value syntax (e.g. "bg-[color:var(--x)] text-[7px] hover:brightness-110").
            // Tokens are all-lowercase utilities so this never matches English prose (which has capitals/punctuation).
            "^!?[a-z0-9][a-z0-9:/._\\[\\]()#%,-]*( !?[a-z0-9\\[][a-z0-9:/._\\[\\]()#%,-]*)*$",
            // Hex color values
            "^#[0-9a-fA-F]+$",
            // CSS dimension / numeric-leading values
            "^[0-9]",
            // CSS transform function template literals
            "^(translate[XYZ3d]*|rotate[XYZ3d]*|scale[XYZ]?|skew[XY]?|matrix3?d?|perspective)\\(",
            // CSS transform function values
            "^(translate|translate3d|rotate|rotate3d|scale|scale3d|skew|matrix)\\(",
            // Byte-size literals
            "^[0-9]+(?:\\.[0-9]+)?\\s?(?:B|KB|MB|GB|TB|b|kb|mb|gb|tb)$",
            // Unit-suffix remnants from formatting template literals (lingui joins quasis
            // around the numeric expression, e.g. `${mb} MB` → " MB", `${v}M` → "M")
            "^\\s?(?:B|KB|MB|GB|TB|K|M|G)$",
            // Data URIs
            "^data:",
          ],
        },
      ],
      "lingui/t-call-in-function": "error",
    },
  },
]
