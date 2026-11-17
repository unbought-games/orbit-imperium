import {navigate} from './fixtures/navigation'
import { test, expect } from './fixtures/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

test('paginated inbox remains usable after leaving a pending report detail', async ({
  page,
}) => {
  const accounts = JSON.parse(
    readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!, 'utf8'),
  ) as { name: string; password: string }[]
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  await page.getByLabel('Account', { exact: true }).fill(accounts[0].name)
  await page.getByLabel('Password').fill(accounts[0].password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText(/^Empire —/)
  const cursor = randomUUID()
  let pageLoads = 0
  await page.route(/\/api\/v4\/universes\/[^/]+\/reports$/, async (route) => {
    const body = route.request().postDataJSON()
    const response = await route.fetch({ postData: { ...body, cursor: null } })
    if (response.status() !== 200) {
      await route.fulfill({ response })
      return
    }
    const data = await response.json()
    pageLoads++
    data.data.has_more = true
    data.data.next_cursor = cursor
    data.data.items = body.cursor ? [] : data.data.items.slice(0, 1)
    await route.fulfill({ response, json: data })
  })
  await navigate(page, 'Reports')
  await page.getByRole('button', { name: 'Load more reports' }).click()
  await expect.poll(() => pageLoads).toBeGreaterThan(1)
  await expect(
    page.getByRole('button', { name: 'Load more reports' }),
  ).toBeEnabled()
  let pending = false
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v4/universes/*/reports/*', async (route) => {
    pending = true
    await held
    await route.continue()
  })
  await page.locator('main article a').first().click()
  await expect.poll(() => pending).toBe(true)
  await page.goBack()
  await expect(
    page.getByRole('button', { name: 'Load more reports' }),
  ).toBeEnabled()
  release()
  await page.unrouteAll({ behavior: 'wait' })
})
