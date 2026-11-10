import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Test-only entrypoint. The production build never imports this gallery.
export default defineConfig({
  root: fileURLToPath(new URL('./tests/components', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [react()],
  server: {
    fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] },
  },
})
