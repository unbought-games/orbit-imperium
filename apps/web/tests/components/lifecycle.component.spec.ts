import { test, expect } from './fixture'
import { body, id } from '../../src/test-support/empire'
import type {} from './empire.scenarios'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

test('Empire saves a moon name without changing its parent at the same coordinates', async ({
  page,
  mount,
}) => {
  const mobile = { width: 390, height: 900 }
  await page.setViewportSize(mobile)
  const moon = {
    ...body,
    id: id(80),
    kind: 'Moon' as const,
    name: undefined,
    amounts: { metal: '0', crystal: '0', deuterium: '0' },
    levels: Object.fromEntries(Object.keys(body.levels).map((key) => [key, 0])),
    fields: 1,
    fields_used: 0,
    fields_reserved: 0,
    energy: { supply: '0', demand: '0', utilization: '1000000' },
    inventories: [],
    diameter_km: 8366,
    moon: { parent: body.id, created_at: 1793667600000 },
  }
  await page.addInitScript(
    (bodies) => {
      window.empireInput = { bodies, showActionStatus: true }
    },
    [{ ...body, name: 'Terra' }, moon],
  )
  await mount('empire')
  const open = page.getByRole('button', { name: 'Rename moon [1:371:12]' })
  const renamePlanet = page.getByRole('button', {
    name: 'Rename planet [1:371:12]',
  })
  await open.click()
  const draft = page.getByRole('textbox', { name: 'Moon name' })
  await expect(draft).toBeFocused()
  await draft.fill('  Selene  ')

  async function capture(state: string) {
    if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
    const dossier = page.getByRole('article', {
      name: `${state === 'editing' ? 'Moon' : 'Selene'} [1:371:12] dossier`,
    })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await dossier.getByText('8,366 km diameter').scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, {
        path: `test-results/moon-rename-${state}-${width}x900.png`,
      })
    }
  }

  await capture('editing')
  await draft.press('Enter')
  await expect(open).toBeFocused()
  const lunarDossier = page.getByRole('article').filter({ has: open })
  const planetDossier = page.getByRole('article').filter({ has: renamePlanet })
  await expect(
    lunarDossier.getByRole('heading', { name: 'Selene', exact: true }),
  ).toBeVisible()
  await expect(
    planetDossier.getByRole('heading', { name: 'Terra', exact: true }),
  ).toBeVisible()
  await expect(page.getByTestId('order-announcement')).toHaveText(
    'Rename moon: Action confirmed.',
  )
  expect(
    await page.evaluate(() =>
      window.empireScene.sent.map((envelope) => envelope.command),
    ),
  ).toContainEqual({
    type: 'World',
    action: { type: 'RenamePlanet', body: moon.id, name: 'Selene' },
  })
  await capture('saved')
})

for (const width of [1280, 390]) {
  test(`rename keeps a local draft across authoritative updates and uncertain delivery at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript((body) => {
      window.empireInput = {
        surface: 'rename',
        bodies: [{ ...body, name: 'Terra' }],
      }
    }, body)
    await mount('empire')
    const open = page.getByRole('button', { name: 'Rename planet [1:371:12]' })
    await open.click()
    const input = page.getByRole('textbox', { name: 'Planet name' })
    await expect(input).toBeFocused()
    await input.fill('Local draft')
    await page.evaluate(async () => {
      window.empireScene.view.bodies[0].name = 'Server name'
      await window.empireScene.refresh()
    })
    await expect(input).toHaveValue('Local draft')
    await page.evaluate(() => {
      window.empireScene.hold()
      window.empireScene.setOutcome('uncertain')
    })
    const save = page.getByRole('button', { name: 'Save name' })
    await save.click()
    await expect(save).toBeDisabled()
    await expect(input).toHaveValue('Local draft')
    await page.evaluate(() => window.empireScene.release())
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            [...window.empireScene.model.store.getState().attempts.values()].at(
              -1,
            )?.status,
        ),
      )
      .toBe('uncertain')
    await expect(save).toBeDisabled()
    await expect(input).toHaveValue('Local draft')
    expect(await page.evaluate(() => window.empireScene.sent.length)).toBe(1)
    await diagnosticScreenshot(page, {
      path: `test-results/stream04/rename-uncertain-${width}x900.png`,
    })
    await input.press('Escape')
    await expect(open).toBeFocused()
    await expect(
      page.getByRole('heading', { name: 'Server name' }),
    ).toBeVisible()
  })
}
for (const action of ['vacation', 'deletion'] as const) {
  test(`${action} keeps uncertain commands pending in the actual settings hook`, async ({
    page,
    mount,
  }) => {
    await page.addInitScript(() => {
      window.empireInput = { surface: 'settings' }
    })
    await mount('empire')
    await page.evaluate(() => {
      window.empireScene.hold()
      window.empireScene.setOutcome('uncertain')
    })
    const open = page.getByRole('button', {
      name:
        action === 'vacation'
          ? 'Enter vacation mode'
          : 'Request empire deletion',
      exact: true,
    })
    await open.click()
    await page
      .getByRole('button', {
        name:
          action === 'vacation'
            ? 'Confirm vacation mode'
            : 'Schedule empire deletion',
        exact: true,
      })
      .click()
    await page.evaluate(() => window.empireScene.release())
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            [...window.empireScene.model.store.getState().attempts.values()].at(
              -1,
            )?.status,
        ),
      )
      .toBe('uncertain')
    await expect(
      page.getByRole('button', {
        name:
          action === 'vacation'
            ? 'Entering vacation…'
            : 'Request empire deletion',
        exact: true,
      }),
    ).toBeDisabled()
    expect(
      await page.evaluate(() => window.empireScene.sent.map((e) => e.command)),
    ).toEqual([
      {
        type: 'World',
        action: {
          type:
            action === 'vacation' ? 'EnterVacation' : 'RequestEmpireDeletion',
        },
      },
    ])
  })
}
test('desktop abandonment reviews losses, restores focus and rechecks changed blockers', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.addInitScript(
    ({ body, colony }) => {
      window.empireInput = { surface: 'abandonment', bodies: [body, colony] }
    },
    {
      body,
      colony: {
        ...body,
        id: id(90),
        name: 'Hesperia',
        coordinates: { galaxy: 1, system: 371, position: 8 },
      },
    },
  )
  await mount('empire')
  const trigger = page.getByRole('button', { name: 'Planet actions [1:371:8]' })
  await trigger.click()
  const menu = page.getByRole('menuitem', { name: 'Abandon planet' })
  await expect(menu).toHaveCSS('color', 'rgb(255, 123, 123)')
  await menu.click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Abandon Hesperia?')
  await expect(dialog).toContainText('2026-11-01 00:00:00 UTC')
  await expect(
    dialog.getByRole('button', { name: 'Yes, abandon planet' }),
  ).toBeEnabled()
  await dialog
    .getByText('Buildings and stationed units', { exact: true })
    .click()
  await expect(dialog).toContainText('Small Cargo')
  await diagnosticScreenshot(page, {
    path: 'test-results/stream04/abandonment-review-1280x900.png',
  })
  await dialog.getByRole('button', { name: 'No, keep planet' }).click()
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => window.empireScene.sent.length)).toBe(0)
  await page.evaluate(() => {
    window.empireScene.abandonment.blockers = [
      'This planet hosts active research.',
    ]
  })
  await trigger.click()
  await menu.click()
  await expect(
    dialog.getByRole('button', { name: 'Yes, abandon planet' }),
  ).toBeDisabled()
  await expect(dialog).toContainText('active research')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('a rejected rename leaves its editable draft and confirmed name intact', async ({
  page,
  mount,
}) => {
  await page.addInitScript((body) => {
    window.empireInput = {
      surface: 'rename',
      bodies: [{ ...body, name: 'Terra' }],
    }
  }, body)
  await mount('empire')
  await page.evaluate(() => window.empireScene.setOutcome('Rejected'))
  await page.getByRole('button', { name: 'Rename planet [1:371:12]' }).click()
  const draft = page.getByRole('textbox', { name: 'Planet name' })
  await draft.fill('New Terra')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(
    page
      .getByTestId('game-error-banner')
      .getByRole('alert')
      .filter({ hasText: 'Action rejected:' }),
  ).toContainText('Not Owned')
  await expect(draft).toHaveValue('New Terra')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(
    page.getByRole('heading', { name: 'Terra', exact: true }),
  ).toBeVisible()
})

test('an unnamed planet may explicitly save its fallback label exactly once', async ({
  page,
  mount,
}) => {
  await page.addInitScript((body) => {
    window.empireInput = {
      surface: 'rename',
      bodies: [{ ...body, name: undefined }],
    }
  }, body)
  await mount('empire')
  const open = page.getByRole('button', { name: 'Rename planet [1:371:12]' })
  const draft = page.getByRole('textbox', { name: 'Planet name' })
  await open.click()
  await draft.fill('Planet')
  const save = page.getByRole('button', { name: 'Save name' })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Planet renamed.' }),
  ).toBeVisible()
  expect(
    await page.evaluate(() =>
      window.empireScene.sent.map((envelope) => envelope.command),
    ),
  ).toEqual([
    {
      type: 'World',
      action: { type: 'RenamePlanet', body: body.id, name: 'Planet' },
    },
  ])
  await open.click()
  await expect(draft).toHaveValue('Planet')
  await expect(save).toBeDisabled()
})

test('the deletion control explains an authoritative reauthentication refusal and reopens review', async ({
  page,
  mount,
}) => {
  await page.addInitScript(() => {
    window.empireInput = { surface: 'settings' }
  })
  await mount('empire')
  await page.evaluate(() => window.empireScene.setOutcome('reauth'))
  const section = page.getByRole('region', {
    name: 'Delete empire',
    exact: true,
  })
  const request = section.getByRole('button', {
    name: 'Request empire deletion',
    exact: true,
  })
  await request.click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Schedule empire deletion' })
    .click()
  await expect(section.getByRole('alert')).toContainText(
    'Sign out and sign in again',
  )
  await expect(request).toBeEnabled()
})

test('the overview alliance destination waits for authoritative membership on its mounted profile subscription', async ({
  page,
  mount,
}) => {
  await mount('empire')
  const panel = page.getByRole('region', { name: 'Empire alliance' })
  const universe = 'andromeda'
  const selected = await page.evaluate(
    () => window.empireScene.view.bodies[0].id,
  )
  const href = `/u/${universe}/b/${selected}/alliance`
  await expect(
    panel.getByRole('link', { name: 'Open alliance', exact: true }),
  ).toHaveAttribute('href', href)
  for (const member of [true, false]) {
    await page.evaluate((member) => {
      const binding = window.empireScene.view.binding
      const time = Math.floor(Date.now() / 1000)
      window.empireProfileFeed.store.setState({
        players: {
          [binding.player]: {
            player: binding.player,
            username: 'Commander',
            observed_at: time,
            expires_at: time + 300,
            ...(member
              ? {
                  alliance: {
                    id: '00000000-0000-4000-8000-000000000800',
                    universe: binding.universe,
                    name: 'Starlight Assembly',
                    tag: 'STAR',
                  },
                }
              : {}),
          },
        },
      })
    }, member)
    await expect(
      panel.getByRole('link', {
        name: member ? 'Your alliance' : 'Find your alliance',
        exact: true,
      }),
    ).toHaveAttribute('href', member ? href : href + '/discover')
  }
})

test('the same vacation control clears confirmation after an authoritative enter and exit', async ({
  page,
  mount,
}) => {
  await page.addInitScript(() => {
    window.empireInput = { surface: 'settings' }
  })
  await mount('empire')
  const section = page.getByRole('region', {
    name: 'Vacation mode',
    exact: true,
  })
  const enter = section.getByRole('button', {
    name: 'Enter vacation mode',
    exact: true,
  })
  await enter.click()
  await section
    .getByRole('button', { name: 'Confirm vacation mode', exact: true })
    .click()
  const leave = section.getByRole('button', {
    name: 'Leave vacation mode',
    exact: true,
  })
  await expect(leave).toBeDisabled()
  await page.evaluate(async () => {
    const scene = window.empireScene
    const eligible = scene.view.vacation!.earliest_exit_at!
    scene.view.as_of_ms = eligible
    scene.view.sampled_at = eligible
    await scene.refresh()
  })
  await expect(leave).toBeEnabled()
  await leave.click()
  await expect(
    section.getByText(
      'Vacation mode ended. Your production settings have resumed.',
    ),
  ).toBeVisible()
  await expect(
    section.getByRole('button', { name: 'Confirm vacation mode', exact: true }),
  ).toHaveCount(0)
  await enter.click()
  await expect(
    section.getByRole('button', { name: 'Keep playing' }),
  ).toBeFocused()
  await expect(
    section.getByRole('button', { name: 'Confirm vacation mode', exact: true }),
  ).toBeEnabled()
  expect(
    await page.evaluate(() =>
      window.empireScene.sent.map(({ command }) =>
        command.type === 'World' ? command.action.type : command.type,
      ),
    ),
  ).toEqual(['EnterVacation', 'ExitVacation'])
})
