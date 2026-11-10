import { defineConfig } from '@playwright/test'
import { availableParallelism } from 'node:os'

const outputDir = process.env.ORBIT_TEST_OUTPUT_DIR ?? 'test-results/components'

export default defineConfig({
  testDir: 'apps/web/tests/components',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: Math.min(3, availableParallelism()),
  timeout: 0,
  globalTimeout: 0,
  outputDir,
  use: {
    baseURL: process.env.ORBIT_TEST_BASE_URL,
    headless: true,
    screenshot: 'off',
    trace: {
      mode: 'retain-on-failure',
      screenshots: false,
      snapshots: true,
      sources: true,
    },
  },
  reporter: [['list'], ['json', { outputFile: `${outputDir}/results.json` }]],
})
