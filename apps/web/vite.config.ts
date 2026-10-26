import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
export default defineConfig({
  root: 'apps/web',
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/health': 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: 'dist',
    license: { fileName: 'third-party.txt' },
    rollupOptions: { input: { app: resolve('apps/web/index.html'), homepage: resolve('apps/web/homepage.html') } },
  },
  test: { testTimeout: 0, hookTimeout: 0, include: ['src/**/*.test.ts'] },
})
