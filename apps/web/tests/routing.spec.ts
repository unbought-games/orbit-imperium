import {navigate,menuDestination,signOut} from './fixtures/navigation'
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

test('browser-history deep links survive login, refresh, history and native new-tab navigation', async ({ page, context }) => {

  const accounts = JSON.parse(readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!, 'utf8'))
  await page.setViewportSize({ width: 1440, height: 900 })
  const signIn = async () => {
    await page.getByLabel('Account', { exact: true }).fill(accounts[1].name)
    await page.getByLabel('Password').fill(accounts[1].password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }
  await page.goto('/login')
  await signIn()
  await expect(page.getByRole('heading', { name: /^Empire —/, exact: true })).toBeVisible()
  const initial = new URL(page.url())
  const segments = initial.pathname.split('/')
  const universe = segments[2], body = segments[4]
  expect(body).toBeTruthy()
  const resources = `/u/${universe}/b/${body}/resources`
  await signOut(page)
  await expect(page).toHaveURL(/\/login$/)
  const direct = await page.goto(resources)
  expect(direct?.status()).toBe(200)
  await expect(page.getByLabel('Account', { exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/login')
  expect(new URL(page.url()).searchParams.get('redirect')).toBe(resources)
  await signIn()
  await expect(page.getByRole('heading', { name: 'Resources', exact: true })).toBeVisible()
  expect(new URL(page.url()).hash).toBe('')

  let documents = 0, discoveries = 0, writes = 0
  page.on('request', request => {
    if (request.isNavigationRequest() && request.resourceType() === 'document') documents++
    if (request.url().includes('/binding?')) discoveries++
    if (request.method() === 'POST' && request.url().endsWith('/commands')) writes++
  })
  await page.evaluate(() => Reflect.set(window, 'routeNavigationSentinel', 'alive'))
  await navigate(page, 'Research')
  await expect(page.getByRole('heading', { name: 'Research', exact: true, level: 1 })).toBeFocused()
  expect(new URL(page.url()).pathname).toBe(`/u/${universe}/b/${body}/research`)
  await navigate(page, 'Settings')
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeFocused()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Research', exact: true, level: 1 })).toBeFocused()
  expect(new URL(page.url()).pathname).toBe(`/u/${universe}/b/${body}/research`)
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  expect(await page.evaluate(() => Reflect.get(window, 'routeNavigationSentinel'))).toBe('alive')
  expect({ documents, discoveries, writes }).toEqual({ documents: 0, discoveries: 0, writes: 0 })

  const opened = context.waitForEvent('page')
  await (await menuDestination(page, 'Resources')).click({ button: 'middle' })
  const tab = await opened
  await expect(tab.getByRole('heading', { name: 'Resources', exact: true })).toBeVisible()
  expect(new URL(tab.url()).pathname).toBe(resources)
  await tab.close()
  await navigate(page, 'Research')
  const startupReads: string[]=[]
  page.on('request',r=>{const p=new URL(r.url()).pathname;if(p==='/api/v1/bootstrap'||p==='/api/v1/session'||p==='/api/v1/registration'||p.endsWith('/binding')||p.endsWith('/settings'))startupReads.push(p)})
  const refreshed = await page.reload()
  expect(refreshed?.status()).toBe(200)
  expect(refreshed?.headers()['cache-control']).toBe('private, no-store')
  await expect(page.getByRole('heading', { name: 'Research', exact: true, level: 1 })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(`/u/${universe}/b/${body}/research`)
  expect(writes).toBe(0)
  expect(startupReads).toEqual([])
})

test('unavailable paths and invalid URL context cannot select or purchase on another planet', async ({ page, request }) => {

  const accounts = JSON.parse(readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!, 'utf8'))
  await page.goto('/login')
  await page.getByLabel('Account', { exact: true }).fill(accounts[1].name)
  await page.getByLabel('Password').fill(accounts[1].password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Empire —/, exact: true })).toBeVisible()
  const universe = new URL(page.url()).pathname.split('/')[2]
  for (const path of [
    '/unknown-screen',
    `/u/${universe}/unknown-screen`,
    `/u/${randomUUID()}/overview`,
    `/u/${universe}/b/${randomUUID()}/resources`,
    `/u/${universe}/research?body=${randomUUID()}`,
    `/u/${universe}/research?body=123`,
    `/u/${universe}/research?body=%5B%22a%22%5D`,
    `/u/${universe}/research?body=`,
    `/u/${universe}/b/%ZZ/resources`,
  ]) {
    expect((await page.goto(path))?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Destination unavailable', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Confirm research', exact: true })).toHaveCount(0)
    await page.getByRole('link', { name: 'Open your universe overview' }).click()
    await expect(page.getByRole('heading', { name: /^Empire —/, exact: true })).toBeVisible()
  }
  for (const path of ['/api/missing', '/health/missing', '/assets/missing.js']) {
    const response = await request.get(path)
    expect(response.status()).toBe(404)
    expect(response.headers()['content-type'] ?? '').not.toContain('text/html')
  }
})
