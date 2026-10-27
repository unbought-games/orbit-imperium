import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { browserTimeout } from './scripts/fixtures/browser-budget.mjs'
const budgets: Record<string, number> = JSON.parse(readFileSync(new URL('./scripts/test-budgets.json', import.meta.url), 'utf8'))
const suite = process.env.ORBIT_TEST_SUITE ?? 'core'
const uiFiles = ['harvest-reports.spec.ts', 'social.spec.ts', 'action-sheet.spec.ts', 'home.spec.ts', 'alliance-identity.spec.ts', 'alliances.spec.ts', 'report-sharing.spec.ts', 'combat-simulation.spec.ts', 'fleet-inventory.spec.ts', 'number-input.spec.ts', 'high-scores.spec.ts', 'report-glance.spec.ts', 'report-deletion.spec.ts', 'coordinate-links.spec.ts', 'detail-playground.spec.ts', 'planet-names.spec.ts', 'player-profiles.spec.ts', 'content-updates.spec.ts', 'heavy-fighter.spec.ts', 'solar-satellite.spec.ts', 'fusion-reactor.spec.ts', 'cruiser.spec.ts', 'bomber.spec.ts', 'large-cargo.spec.ts', 'density.spec.ts', 'colonization.spec.ts', 'dispatch-validation.spec.ts', 'combat-reports.spec.ts', 'espionage-reports.spec.ts', 'empire.spec.ts', 'locked-buildings.spec.ts', 'shell.spec.ts', 'resources.spec.ts', 'catalog-pages.spec.ts', 'galaxy-cards.spec.ts', 'bootstrap-ui.spec.ts', 'progression-cancellation.spec.ts', 'building-quotes.spec.ts', 'web-app.spec.ts']
const coreFiles = ['bootstrap.spec.ts', 'construction.spec.ts', 'login.spec.ts', 'reconnect.spec.ts', 'transport.spec.ts', 'zfoundation.spec.ts']
export default defineConfig({
  // Routine fixture tests have no execution deadline. Explicit suites retain
  // their generous enclosing budget and a ten-minute per-test ceiling.
  globalTimeout: process.env.ORBIT_UI_E2E ? 0 : browserTimeout(budgets[suite], process.env.ORBIT_TEST_DEADLINE_MS),
  timeout: process.env.ORBIT_UI_E2E ? 0 : 600_000,
  outputDir: process.env.ORBIT_TEST_OUTPUT_DIR ?? 'test-results/browser',
  testDir: 'apps/web/tests',
  testMatch: process.env.ORBIT_UI_E2E
    ? uiFiles
    : process.env.ORBIT_CORE_E2E
      ? coreFiles
      : process.env.ORBIT_SIGNUP_E2E
    ? 'signup.spec.ts'
    : process.env.ORBIT_RAIDING_E2E
      ? 'raiding.spec.ts'
      : process.env.ORBIT_MISSIONS_E2E
        ? 'missions.spec.ts'
        : process.env.ORBIT_PROGRESSION_E2E
          ? ['progression.spec.ts', 'responsive.spec.ts', 'routing.spec.ts']
          : process.env.ORBIT_MVP_E2E
            ? 'mvp.spec.ts'
            : '**/*.spec.ts',
  testIgnore: process.env.ORBIT_SIGNUP_E2E
    ? []
    : process.env.ORBIT_RAIDING_E2E
      ? []
      : process.env.ORBIT_MISSIONS_E2E
        ? []
        : process.env.ORBIT_PROGRESSION_E2E
          ? []
          : process.env.ORBIT_MVP_E2E
            ? []
            : [
                ...(process.env.ORBIT_UI_E2E
                  ? []
                  : ['**/bootstrap-ui.spec.ts']),
                '**/signup.spec.ts',
                '**/raiding.spec.ts',
                '**/missions.spec.ts',
                '**/mvp.spec.ts',
                '**/progression.spec.ts',
                '**/responsive.spec.ts',
                '**/routing.spec.ts',
              ],
  fullyParallel: !!process.env.ORBIT_UI_E2E,
  workers: process.env.ORBIT_UI_E2E ? Math.min(3, availableParallelism()) : 1,
  use: {
    baseURL: process.env.ORBIT_TEST_BASE_URL ?? 'http://localhost:18080',
    headless: true,
    // The shared test fixture captures actual failures. Playwright 1.56's
    // only-on-failure mode also captures successful contexts before discarding.
    screenshot: 'off',
  },
  reporter: [['list'], ['json', { outputFile: `${process.env.ORBIT_TEST_OUTPUT_DIR ?? 'test-results/browser'}/results.json` }]],
})
