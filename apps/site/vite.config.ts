import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import { nitro } from 'nitro/vite';
import { lingui } from '@lingui/vite-plugin';
import * as babel from '@babel/core';

/**
 * @vitejs/plugin-react v6 transforms with oxc and no longer accepts a `babel`
 * option, so the Lingui macro imports have nowhere to be expanded. This
 * pre-transform runs a focused babel pass — only on app source files that
 * actually import a Lingui macro — to expand them before oxc/TanStack run.
 */
function linguiMacro(): Plugin {
  return {
    name: 'adt-lingui-macro',
    enforce: 'pre',
    async transform(code, id) {
      const [file] = id.split('?');
      if (!/\.[jt]sx?$/.test(file) || file.includes('/node_modules/')) return;
      if (!code.includes('@lingui/core/macro') && !code.includes('@lingui/react/macro')) {
        return;
      }
      const result = await babel.transformAsync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        presets: [
          ['@babel/preset-typescript', { isTSX: file.endsWith('x'), allExtensions: true }],
        ],
        plugins: ['@lingui/babel-plugin-lingui-macro'],
      });
      if (!result?.code) return;
      return { code: result.code, map: result.map };
    },
  };
}

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/. Set BASE_PATH at build
  // time (e.g. "/adt-studio/"); defaults to "/" for local dev and previews.
  base: process.env.BASE_PATH || '/',
  server: {
    port: 3000,
  },
  plugins: [
    mdx(),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        // Render the SPA fallback shell from a dedicated empty route instead of
        // "/", so the landing routes prerender their full body into static HTML.
        maskPath: '/shell',
        prerender: {
          enabled: true,
          crawlLinks: true,
        },
      },

      pages: [
        { path: '/' },
        { path: '/download' },
        { path: '/releases' },
        { path: '/docs' },
        { path: '/api/search' },
      ],
    }),
    linguiMacro(),
    react(),
    lingui(),
    // please see https://tanstack.com/start/latest/docs/framework/react/guide/hosting#nitro for guides on hosting
    nitro(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
});
