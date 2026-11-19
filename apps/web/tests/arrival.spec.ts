import type { Response } from '@playwright/test'
import type { components } from '../src/contracts'
import { recruitmentFixture, alliance } from './fixtures/recruitment'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { withFixtureResponse } from './fixtures/responses'
import { expect, test } from './fixtures/test'
import {
  binding,
  body,
  installGameFixture,
  matchesFixtureContext,
  matchesFixtureGameplay,
  refreshGame,
  refuseFixtureReads,
} from './fixtures/game'

test('declining recruitment can finish arrival despite intent failure and retry a failed landing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let pending = true,
    completions = 0
  refuseFixtureReads(page, { empireProfile: binding.player })
  const fixture = await recruitmentFixture(page, {
    arrivalPending: () => pending,
  })
  await page.route('**/arrival', (route) => {
    const { action } = route.request().postDataJSON()
    if (['Load', 'SetRecruitment'].includes(action.type))
      return route.fulfill({ status: 503, json: { error: 'unavailable' } })
    if (action.type === 'Complete') {
      completions++
      if (completions === 1)
        return route.fulfill({ status: 503, json: { error: 'unavailable' } })
      pending = false
    }
    return route.fulfill({ json: { pending } })
  })
  await withFixtureResponse(
    page,
    (r) => r.url().endsWith('/bootstrap'),
    () => page.goto(`/u/andromeda/b/${body.id}/overview?alliance=${alliance}`),
  )
  const scene = page.getByRole('main', { name: 'Arrival' })
  await scene.getByRole('button', { name: 'That’s me', exact: true }).click()
  await scene.getByRole('button', { name: 'That’s it', exact: true }).click()
  await scene
    .getByRole('textbox', {
      name: 'Every world deserves a name. What should we call it?',
      exact: true,
    })
    .fill('Terra')
  await expect(scene.getByRole('alert')).toContainText(
    'invitation could not be loaded',
  )
  await withFixtureResponse(
    page,
    (r) => r.url().endsWith(`/alliances/${alliance}`),
    () =>
      scene.getByRole('button', { name: 'Skip intro', exact: true }).click(),
  )
  await scene
    .getByRole('button', { name: 'Not now · continue my arrival', exact: true })
    .click()
  await expect(scene.getByRole('alert')).toContainText(
    'choices could not be saved',
  )
  await expect(
    scene.getByRole('button', { name: 'Try again', exact: true }),
  ).toBeEnabled()
  expect(new URL(page.url()).searchParams.has('alliance')).toBe(false)
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await diagnosticScreenshot(page, {
      path: 'test-results/alliance-decline-retry-390x844.png',
    })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await diagnosticScreenshot(page, {
      path: 'test-results/alliance-decline-retry-1440x1000.png',
    })
  }
  await scene.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/briefing$`))
  expect(completions).toBe(2)
  expect(fixture.commands).toEqual([])
})

// Catches: the scene must save title and look, complete arrival, and hand off
// to Briefing through real routing, focus and responsive carousel controls.
test('a new empire chooses its title, look and name, then lands in Briefing at 1280px', async ({
  page,
}) => {
  const width = 1280
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width, height: 900 })
  let pending = true
  const arrival: unknown[] = []
  const profileWrites: Array<{ action: { identity: { title_id: string } } }> =
    []
  const title = (id: string, label: string) => ({
    id,
    label,
    address: label,
    access: 'free' as const,
  })
  const home = { ...body, name: 'Terra' }
  const chosenName = 'Vesper Reach'
  let revision = 1
  const renamed: string[] = []
  let renameReceipt: components['schemas']['BoundReceipt4'] | undefined
  let confirmedRead = false
  const overviewNames = new Map<string, string>()
  await installGameFixture(page, {
    protocol: 4,
    bodies: [home],
    viewerRevision: () => String(revision),
    homeworldId: body.id,
    arrivalPending: () => pending,
  })
  const api = `/api/v4/universes/${binding.universe}`
  await page.route(`**${api}/commands`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const pair = route.request().postDataJSON()
    if (
      !matchesFixtureGameplay(pair) ||
      pair.gameplay.command.type !== 'World' ||
      pair.gameplay.command.action.type !== 'RenamePlanet'
    )
      return route.fallback()
    const action = pair.gameplay.command.action
    expect(action).toEqual({
      type: 'RenamePlanet',
      body: home.id,
      name: chosenName,
    })
    renamed.push(pair.gameplay.command_id)
    renameReceipt = {
      protocol: 4,
      binding,
      command_id: pair.gameplay.command_id,
      admitted_at: Date.now(),
      executed_at: null,
      status: 'Pending',
    }
    await route.fulfill({ json: renameReceipt })
  })
  const receiptPath = () => api + '/commands/' + renameReceipt?.command_id
  await page.route(
    (url) => url.pathname === receiptPath(),
    async (route) => {
      if (
        !renameReceipt ||
        route.request().method() !== 'GET' ||
        new URL(route.request().url()).searchParams.get('epoch') !==
          binding.epoch
      )
        return route.fallback()
      if (renameReceipt.status === 'Committed') {
        home.name = chosenName
        revision = 2
      }
      confirmedRead = true
      await route.fulfill({ json: renameReceipt })
    },
  )
  await page.route(
    (url) => url.pathname === api + '/overview',
    async (route) => {
      const request = route.request()
      if (confirmedRead && request.method() === 'POST') {
        const context = request.postDataJSON()
        if (matchesFixtureContext(context))
          overviewNames.set(context.request_id, home.name)
      }
      return route.fallback()
    },
  )
  async function refreshRename(expectedName: string) {
    let delivered!: Response
    await withFixtureResponse(
      page,
      (response) => {
        if (
          new URL(response.url()).pathname !== api + '/overview' ||
          response.request().method() !== 'POST' ||
          overviewNames.get(response.request().postDataJSON().request_id) !==
            expectedName
        )
          return false
        delivered = response
        return true
      },
      () =>
        withFixtureResponse(
          page,
          (response) => {
            const url = new URL(response.url())
            return (
              url.pathname === receiptPath() &&
              url.searchParams.get('epoch') === binding.epoch &&
              response.request().method() === 'GET'
            )
          },
          () => refreshGame(page),
        ),
    )
    const snapshot = await delivered.json()
    expect(snapshot.bodies).toContainEqual(
      expect.objectContaining({ id: home.id, name: expectedName }),
    )
  }
  await page.route(
    (url) => url.pathname === `/api/v4/empire-profiles/${binding.player}`,
    (route) => {
      if (route.request().method() === 'POST') {
        const edit = route.request().postDataJSON()
        if (edit.action?.type !== 'Identity') return route.fallback()
        profileWrites.push(edit)
        return route.fulfill({ json: { ok: true } })
      }
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({
        json: {
          player: binding.player,
          profile: binding.account,
          universe: binding.universe,
          epoch: binding.epoch,
          universe_name: 'Andromeda',
          username: 'fixture',
          display: null,
          revision: 1,
          owner: true,
          removed: false,
          closed: false,
          public: false,
          entries: [],
          next: null,
          identity: { name: '', tagline: '', title_id: 'commander' },
          title: {
            id: 'commander',
            label: 'Commander',
            address: 'Commander',
            expires_at: null,
          },
          title_choices: [
            {
              title: title('commander', 'Commander'),
              availability: 'available',
            },
            { title: title('captain', 'Captain'), availability: 'available' },
            {
              title: { ...title('regent', 'Regent'), access: 'supporter' },
              availability: 'supporter_required',
            },
          ],
        },
      })
    },
  )
  await page.route(
    (url) => url.pathname === `/api/v1/universes/${binding.universe}/arrival`,
    (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const { action, context } = route.request().postDataJSON()
      if (
        !matchesFixtureContext(context) ||
        !['Load', 'SetAppearance', 'Complete'].includes(action?.type)
      )
        return route.fallback()
      if (action.type !== 'Load') arrival.push(action)
      if (action.type === 'Complete') {
        expect(renameReceipt?.status).toBe('Committed')
        expect([...overviewNames.values()]).toContain(chosenName)
        expect(renamed).toHaveLength(1)
        pending = false
      }
      return route.fulfill({ json: { pending } })
    },
  )
  await withFixtureResponse(
    page,
    (response) => response.url().includes('/empire-profiles/'),
    () => page.goto(`/u/andromeda/b/${body.id}/overview`),
  )
  const scene = page.getByRole('main', { name: 'Arrival' })
  await expect(scene).toBeVisible()

  const titles = scene.getByRole('combobox', {
    name: 'Before we make planetfall: how should I address you?',
  })
  await expect(titles.locator('option')).toHaveText(['Commander', 'Captain'])
  await titles.selectOption('captain')
  await expect(scene).toContainText('“Welcome aboard, Captain.”')
  await diagnosticScreenshot(page, {
    path: `test-results/arrival-title-${width}x900.png`,
  })
  await scene.getByRole('button', { name: 'That’s me' }).click()

  await expect(scene).toContainText('Very good, Captain.')
  const looks = scene.getByRole('list', { name: /Planet look \d of 7/ })
  await expect(looks).toHaveAccessibleName('Planet look 1 of 7')
  await scene.getByRole('button', { name: 'Next planet look' }).click()
  await expect(looks).toHaveAccessibleName('Planet look 2 of 7')
  await looks.press('ArrowRight')
  await expect(looks).toHaveAccessibleName('Planet look 3 of 7')
  await looks.evaluate((list) => {
    // React delegates pointer handlers to the root. A non-bubbling event
    // never clears the carousel's outstanding keyboard-scroll target.
    list.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    list.scrollBy({ left: list.children[0].clientWidth })
  })
  await expect(looks).toHaveAccessibleName('Planet look 4 of 7')
  const offCenter = await looks.evaluate((list) => {
    const r = list.querySelector('[data-selected]')!.getBoundingClientRect()
    return Math.abs(r.left + r.width / 2 - innerWidth / 2)
  })
  expect(offCenter).toBeLessThanOrEqual(1)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await diagnosticScreenshot(page, {
    path: `test-results/arrival-planet-${width}x900.png`,
  })
  await scene.getByRole('button', { name: 'That’s it' }).click()

  const name = scene.getByRole('textbox', {
    name: 'Every world deserves a name. What should we call it?',
  })
  await scene.getByRole('button', { name: 'Name it' }).click()
  await expect(scene.getByRole('alert')).toContainText('1–40 characters')
  await scene.getByRole('button', { name: 'Suggest a random name' }).click()
  await expect(name).toHaveValue(/^\S+ \S+$/)
  await name.fill(chosenName)
  await scene.getByRole('button', { name: 'Name it' }).click()

  await expect(scene).toContainText(`${chosenName}. It suits it.`)
  await withFixtureResponse(
    page,
    (response) =>
      new URL(response.url()).pathname === api + '/commands' &&
      response.request().method() === 'POST' &&
      response.request().postDataJSON()?.gameplay?.command?.action?.type ===
        'RenamePlanet',
    () => scene.getByRole('button', { name: 'Begin' }).click(),
  )
  expect(renamed).toHaveLength(1)
  await refreshRename('Terra')
  expect(arrival).toEqual([{ type: 'SetAppearance', body: home.id, slot: 11 }])
  await expect(scene).toBeVisible()
  expect(renameReceipt?.status).toBe('Pending')
  renameReceipt = {
    ...renameReceipt!,
    status: 'Committed',
    executed_at: Date.now(),
    result_ids: [],
    minimum_viewer_revision: '2',
  }
  confirmedRead = false
  await refreshRename(chosenName)
  await expect(scene).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/briefing$`))
  await expect(
    page.getByRole('region', { name: 'Briefing', exact: true }),
  ).toBeVisible()
  expect(renamed).toHaveLength(1)
  expect(profileWrites.map((w) => w.action.identity.title_id)).toEqual([
    'captain',
  ])
  expect(arrival).toEqual([
    { type: 'SetAppearance', body: body.id, slot: 11 },
    { type: 'Complete' },
  ])
})
