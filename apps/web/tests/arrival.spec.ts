import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { withFixtureResponse } from './fixtures/responses'
import { expect, test } from './fixtures/test'
import { binding, body, installGameFixture } from './fixtures/game'

// Catches: the scene must save title and look, complete arrival, and hand off
// to Briefing through real routing, focus and responsive carousel controls.
for (const width of [1280, 390]) {
  test(`a new empire chooses its title, look and name, then lands in Briefing at ${width}px`, async ({
    page,
  }) => {
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
    await installGameFixture(page, {
      protocol: 4,
      bodies: [{ ...body, name: 'Terra' }],
      homeworldId: body.id,
      arrivalPending: () => pending,
    })
    await page.route('**/api/v4/empire-profiles/**', (route) => {
      if (route.request().method() === 'POST') {
        profileWrites.push(route.request().postDataJSON())
        return route.fulfill({ json: { ok: true } })
      }
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
    })
    await page.route('**/arrival', (route) => {
      const { action } = route.request().postDataJSON()
      arrival.push(action)
      if (action.type === 'Complete') pending = false
      return route.fulfill({ json: { pending } })
    })
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
      list.dispatchEvent(new PointerEvent('pointerdown'))
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
    await name.fill('Terra')
    await scene.getByRole('button', { name: 'Name it' }).click()

    await expect(scene).toContainText('Terra. It suits it.')
    await scene.getByRole('button', { name: 'Begin' }).click()
    await expect(scene).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`/b/${body.id}/briefing$`))
    expect(profileWrites.map((w) => w.action.identity.title_id)).toEqual([
      'captain',
    ])
    expect(arrival).toEqual([
      { type: 'SetAppearance', body: body.id, slot: 11 },
      { type: 'Complete' },
    ])
  })
}
