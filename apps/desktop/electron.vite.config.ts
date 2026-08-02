import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { lingui } from '@lingui/vite-plugin'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@root': resolve(__dirname, '../..')
      }
    },
    build: {
      externalizeDeps: true
    }
  },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          "preload-splash": resolve(__dirname, 'src/preload/preload-splash.ts'),
        },
      }
    }
  },
  renderer: {
    plugins: [
      lingui(),
      react({
        babel: {
          plugins: ['@lingui/babel-plugin-lingui-macro']
        }
      }),
      tailwindcss()
    ],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/splashscreen.html')
      },
    },
    server: {
      port: 5174,
    }
  }
})
