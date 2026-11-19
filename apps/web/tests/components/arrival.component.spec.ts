import { expect, test, type Page } from './fixture'
import { binding, body } from '../../src/test-support/empire'
import { readyFixture } from '../../src/test-support/bootstrap'
import { matchesFixtureContext } from '../fixtures/game'
import { alliance, publicData } from '../fixtures/recruitment'
import type {} from './arrival.scenario'
async function ports(page: Page, recruited: boolean) {
  const { session } = readyFixture(4)
  const actions: string[] = []
  const define = (
    path: string,
    method: string,
    reply: (payload: unknown) => unknown,
  ) =>
    page.route(
      (url) => url.pathname === path,
      (route) => {
        const req = route.request()
        if (req.method() !== method) return route.fallback()
        return route.fulfill({
          json: reply(method === 'POST' ? req.postDataJSON() : undefined),
        })
      },
    )
  await define('/api/v1/session', 'GET', () => session)
  await define(`/api/v4/empire-profiles/${binding.player}`, 'GET', () => ({
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
  }))
  await define(
    `/api/v4/universes/${binding.universe}/alliances/${alliance}`,
    'GET',
    () => publicData,
  )
  await page.route(
    (url) => url.pathname === `/api/v1/universes/${binding.universe}/arrival`,
    async (route) => {
      const req = route.request(),
        data = req.postDataJSON()
      if (
        req.method() !== 'POST' ||
        req.headers()['x-csrf-token'] !== session.csrf ||
        req.headers()['x-orbit-arrival'] !== '1' ||
        !matchesFixtureContext(data.context) ||
        !['Load', 'Complete'].includes(data.action?.type)
      )
        return route.fallback()
      actions.push(data.action.type)
      await route.fulfill({
        json: {
          pending: data.action.type === 'Load',
          recruitment: recruited ? { alliance, invitation: null } : null,
        },
      })
    },
  )
  return actions
}

test('the phone carousel keeps the selected world centered after button, keyboard and pointer input', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ports(page, false)
  await mount('arrival-feature')
  const scene = page.getByRole('main', { name: 'Arrival' })
  await expect(scene).toBeVisible()
  await scene.getByRole('button', { name: 'That’s me', exact: true }).click()
  const looks = scene.getByRole('list', { name: /Planet look/ })
  await expect(looks).toHaveAccessibleName('Planet look 1 of 7')
  await scene.getByRole('button', { name: 'Next planet look' }).click()
  await expect(looks).toHaveAccessibleName('Planet look 2 of 7')
  await looks.press('ArrowRight')
  await expect(looks).toHaveAccessibleName('Planet look 3 of 7')
  await looks.evaluate((list) => {
    list.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    list.scrollBy({ left: list.children[0].clientWidth })
  })
  await expect(looks).toHaveAccessibleName('Planet look 4 of 7')
  const offset = await looks.evaluate((list) => {
    const r = list.querySelector('[data-selected]')!.getBoundingClientRect()
    return Math.abs(r.left + r.width / 2 - innerWidth / 2)
  })
  expect(offset).toBeLessThanOrEqual(1)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
test('an arrival-bound application remains pending while the native Continue and Begin controls complete first landing', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const actions = await ports(page, true)
  await mount('arrival-feature')
  const scene = page.getByRole('main', { name: 'Arrival' })
  await expect(scene).toBeVisible()
  await scene.getByRole('button', { name: 'That’s me' }).click()
  await scene.getByRole('button', { name: 'That’s it' }).click()
  await scene
    .getByRole('textbox', {
      name: 'Every world deserves a name. What should we call it?',
    })
    .fill('Terra')
  await scene.getByRole('button', { name: 'Name it' }).click()
  await expect(
    scene.getByRole('heading', { name: 'Starlight Assembly', exact: true }),
  ).toBeVisible()
  await scene
    .getByRole('textbox', { name: 'Introduce yourself' })
    .fill('Ready to explore together.')
  await scene.getByRole('button', { name: 'Send application' }).click()
  await expect(
    scene.getByText(
      'Your application is with Starlight Assembly. You can start building while they review it.',
    ),
  ).toBeVisible()
  await scene.getByRole('button', { name: 'Continue', exact: true }).click()
  await scene.getByRole('button', { name: 'Begin', exact: true }).click()
  await expect(page.getByLabel('Mounted arrival route')).toHaveText(
    `/u/andromeda/b/${body.id}/briefing`,
  )
  expect(actions).toEqual(['Load', 'Complete'])
  expect(await page.evaluate(() => window.arrivalFeature.commands)).toEqual([
    { type: 'Apply', alliance, text: 'Ready to explore together.' },
  ])
})
