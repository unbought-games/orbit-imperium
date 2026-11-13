import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { expect, test } from './fixtures/test'
import { binding, body, shellFixture } from './fixtures/game'
import type { components } from '../src/contracts'
import { withBootstrapResponse } from './fixtures/responses'

for (const width of [390]) {
  test(`request and cancel empire deletion ${width}px`, { tag: '@journey' }, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let deletion: components['schemas']['EmpireDeletionStatus4'] | undefined
    let revision = 1
    const submitted: string[] = []
    const admission = Promise.withResolvers<void>()
    await shellFixture(page, {
      protocol: 4,
      empireDeletion: () => deletion,
      viewerRevision: () => String(revision),
      missions: {
        fleets: [],
        incoming: [],
        score_value_micro: '0',
        fleet_slots: '1',
      },
    })
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      expect(pair.presence.command.action.body).toBeNull()
      const type = pair.gameplay.command.action.type
      submitted.push(type)
      if (type === 'RequestEmpireDeletion') await admission.promise
      deletion =
        type === 'RequestEmpireDeletion'
          ? { reason: 'Requested', due_at: Date.now() + 7 * 86400000 }
          : undefined
      revision++
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: pair.gameplay.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          status: 'Committed',
          result_ids: [],
          minimum_viewer_revision: String(revision),
        },
      })
    })
    await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/settings/deletion`))
    const section = page.getByRole('region', {
      name: 'Delete empire',
      exact: true,
    })
    await expect(section).toContainText('Your Unbought Games account')
    await section.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: `test-results/empire-deletion-settings-${width}x900.png`,
    })
    await section
      .getByRole('button', { name: 'Request empire deletion', exact: true })
      .click()
    const dialog = page.getByRole('dialog', {
      name: 'Delete your empire in Andromeda?',
    })
    await expect(
      dialog.getByRole('button', { name: 'Keep my empire' }),
    ).toBeFocused()
    await diagnosticScreenshot(page, {
      path: `test-results/empire-deletion-review-${width}x900.png`,
    })
    await dialog.getByRole('button', { name: 'Keep my empire' }).click()
    expect(submitted).toEqual([])
    await section
      .getByRole('button', { name: 'Request empire deletion', exact: true })
      .click()
    await dialog
      .getByRole('button', { name: 'Schedule empire deletion' })
      .click()
    try {
      await expect(
        section.getByRole('button', {
          name: 'Request empire deletion',
          exact: true,
        }),
      ).toBeDisabled()
      await expect.poll(() => submitted.length).toBe(1)
      await diagnosticScreenshot(page, {
        path: `test-results/empire-deletion-submitting-${width}x900.png`,
      })
    } finally {
      admission.resolve()
    }
    await expect(
      section.getByRole('button', { name: 'Cancel empire deletion' }),
    ).toBeVisible()
    await expect(section).toContainText('You requested deletion.')
    await section.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: `test-results/empire-deletion-pending-${width}x900.png`,
    })
    await withBootstrapResponse(page, () => page.goto('/u/andromeda/overview'))
    await expect(
      page.getByRole('region', { name: 'Empire deletion scheduled' }),
    ).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `test-results/empire-deletion-notice-${width}x900.png`,
    })
    await page
      .getByRole('link', { name: 'Review deletion in Settings' })
      .click()
    await section
      .getByRole('button', { name: 'Cancel empire deletion' })
      .click()
    await expect(
      section.getByRole('button', {
        name: 'Request empire deletion',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Empire deletion scheduled' }),
    ).toHaveCount(0)
    expect(submitted).toEqual(['RequestEmpireDeletion', 'CancelEmpireDeletion'])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
  test(`recent sign-in rejection ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await shellFixture(page, {
      protocol: 4,
      missions: {
        fleets: [],
        incoming: [],
        score_value_micro: '0',
        fleet_slots: '1',
      },
    })
    await page.route('**/commands', (route) =>
      route.fulfill({
        status: 422,
        json: {
          type: 'about:blank',
          status: 422,
          code: 'GameRejected',
          game_code: 'ReauthenticationRequired',
        },
      }),
    )
    await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/settings/deletion`))
    const section = page.getByRole('region', {
      name: 'Delete empire',
      exact: true,
    })
    await section
      .getByRole('button', { name: 'Request empire deletion', exact: true })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Schedule empire deletion' })
      .click()
    await expect(section.getByRole('alert')).toContainText(
      'Sign out and sign in again',
    )
    await expect(
      section.getByRole('button', {
        name: 'Request empire deletion',
        exact: true,
      }),
    ).toBeEnabled()
    await section.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: `test-results/empire-deletion-error-${width}x900.png`,
    })
  })
}
