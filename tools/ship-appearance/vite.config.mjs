import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  root: new URL('./', import.meta.url).pathname,
  plugins: [react()],
  build: {
    outDir: new URL('./dist/', import.meta.url).pathname,
    emptyOutDir: true,
    rollupOptions: {
      input: new URL('./worker.html', import.meta.url).pathname,
    },
  },
})
