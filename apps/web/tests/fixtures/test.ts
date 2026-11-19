import { test as base, expect, type BrowserContext } from '@playwright/test'
import { fixtureOperation } from './api-diagnostics'
import { captureFailureScreenshots } from './diagnostic-screenshot'

export * from '@playwright/test'

export const test = base.extend<{
  announcements: 'empty' | 'custom'
  boundary: 'application' | 'component' | 'server'
  fixtureNetwork: void
}>({
  announcements: ['empty', { option: true }],
  boundary: process.env.ORBIT_UI_E2E ? 'application' : 'server',
  fixtureNetwork: [
    async ({ browser, context, boundary, announcements }, use, testInfo) => {
      const diagnostics = new Set<string>()
      const extra = new Set<BrowserContext>()
      const install = async (target: BrowserContext) => {
        if (boundary === 'server') return
        await target.route('**/api/**', async (route) => {
          diagnostics.add(
            'Unexpected API operation: ' + fixtureOperation(route.request()),
          )
          if (boundary === 'component') await route.abort('blockedbyclient')
          else await route.fulfill({ status: 404, json: { code: 'NotFound' } })
        })
        if (boundary === 'component') {
          target.on('weberror', (error) =>
            diagnostics.add('Component error: ' + error.error().message),
          )
          return
        }
        await target.route('**/api/analytics', (route) =>
          route.request().method() === 'GET'
            ? route.fulfill({ json: { enabled: false } })
            : route.fallback(),
        )
        if (announcements === 'empty')
          await target.route('**/api/announcements', (route) =>
            route.request().method() === 'GET'
              ? route.fulfill({ json: { schema: 1, announcements: [] } })
              : route.fallback(),
          )
      }
      await install(context)
      const newContext = browser.newContext
      browser.newContext = async (...args) => {
        const created = await newContext.apply(browser, args)
        extra.add(created)
        created.once('close', () => extra.delete(created))
        await install(created)
        return created
      }
      try {
        await use()
      } finally {
        browser.newContext = newContext
        try {
          expect.soft([...diagnostics], 'Fixture diagnostics').toEqual([])
          await captureFailureScreenshots(
            [context, ...extra].flatMap((item) => item.pages()),
            testInfo,
          )
        } finally {
          await Promise.all([...extra].map((item) => item.close()))
        }
      }
    },
    { auto: true },
  ],
})
