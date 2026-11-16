import { test, expect } from './fixture'
import { body, id } from '../../src/test-support/empire'
import type {} from './empire.scenarios'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

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
