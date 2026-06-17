import { defineConfig } from "@lingui/conf"

export default defineConfig({
  locales: ["en", "pt-BR", "es", "fr", "sq"],
  sourceLocale: "en",
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}",
      include: ["src"],
      exclude: ["src/locales/**", "**/*.d.ts"],
    },
  ],
  format: "po",
  formatOptions: {
    origins: false,
  },
})
