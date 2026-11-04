import { defineConfig, type ProxyOptions } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { clientBuildPlugin } from '../../scripts/client-build.mjs'
const apiProxy: ProxyOptions = {
  target: process.env.ORBIT_DEV_API_URL || 'http://127.0.0.1:8080',
  configure(proxy) {
    // HMR owns the development client, not any previously built server assets.
    proxy.on('proxyRes', response => { delete response.headers['x-orbit-client-build'] })
  },
}
export default defineConfig({
  root: 'apps/web',
  plugins: [
    clientBuildPlugin(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
  ],
  // Browser fixtures run before a production build creates homepage.html.
  // Scan the actual source entries so a clean checkout can pre-bundle normally.
  optimizeDeps: { entries: ['index.html', 'src/landing-main.tsx'] },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.ORBIT_DEV_PORT || 5173),
    proxy: {
      '/api': apiProxy,
      '/health': process.env.ORBIT_DEV_API_URL || 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: 'dist',
    license: { fileName: 'third-party.txt' },
    rollupOptions: { input: { app: resolve('apps/web/index.html'), homepage: resolve('apps/web/homepage.html') } },
  },
  test: { testTimeout: 0, hookTimeout: 0, include: ['src/**/*.test.ts'] },
})
