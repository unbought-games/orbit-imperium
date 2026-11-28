import { test, expect } from './fixture'
import { installObservedEmpire, loaded } from '../fixtures/observed-empire'
import { withFixtureResponseStatus } from '../fixtures/responses'
import { binding } from '../../src/test-support/empire'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

test('an unsent profile edit stays editable when browser retry storage is unavailable', async ({
  page,
  mount,
}) => {
  const owner = await installObservedEmpire(page)
  await loaded(page, () => mount('profile-editor'))
  await page.getByRole('button', { name: 'Edit identity', exact: true }).click()
  const tagline = page.getByRole('textbox', { name: /^Tagline\b/ })
  await tagline.fill('Keep this local draft.')
  const restoreStorage = await page.evaluateHandle(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('orbit:command-window:1:ProfileCommand:'))
        throw new DOMException(
          'Private browser diagnostic',
          'QuotaExceededError',
        )
      original.call(this, key, value)
    }
    return () => {
      Storage.prototype.setItem = original
    }
  })
  await page.getByRole('button', { name: 'Save identity', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await diagnosticScreenshot(page, {
        path: `test-results/profile-storage-${width}.png`,
        fullPage: true,
      })
    }
  }
  await expect(page.getByRole('alert')).toContainText(
    'Your change was not sent',
  )
  await expect(tagline).toHaveValue('Keep this local draft.')
  expect(owner.writes).toHaveLength(0)
  await page.getByText('Details', { exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Error report' })).toHaveValue(
    /PROFILE_RETRY_STORAGE_UNAVAILABLE/,
  )
  await expect(
    page.getByRole('textbox', { name: 'Error report' }),
  ).not.toHaveValue(/Private browser diagnostic|Keep this local draft/)
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await diagnosticScreenshot(page, {
        path: `test-results/profile-storage-details-${width}.png`,
        fullPage: true,
      })
    }
  }
  await restoreStorage.evaluate((restore) => restore())
  await loaded(page, () =>
    page.getByRole('button', { name: 'Save identity', exact: true }).click(),
  )
  await expect(
    page.getByRole('region', { name: 'Edit empire identity' }),
  ).toHaveCount(0)
  expect(owner.writes).toHaveLength(1)
  expect(owner.data.identity?.tagline).toBe('Keep this local draft.')
})

test('a missing saved title stays selected and a conflicting edit stays local until its refreshed revision is applied', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  const owner = await installObservedEmpire(page)
  owner.data.identity!.title_id = 'missing-title'
  await loaded(page, () => mount('profile-editor'))
  const edit = page.getByRole('button', { name: 'Edit identity', exact: true })
  await edit.click()
  await expect(page.getByRole('status')).toContainText('not installed')
  const tagline = page.getByRole('textbox', { name: /^Tagline\b/ })
  await expect(tagline).toBeVisible()
  await tagline.fill('A draft worth keeping.')
  owner.data.revision++
  const submit = page.getByRole('button', {
    name: 'Save identity',
    exact: true,
  })
  await withFixtureResponseStatus(
    page,
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `/api/v4/empire-profiles/${binding.player}`,
    () => submit.click(),
    409,
  )
  await expect(page.getByRole('alert')).toContainText('another window')
  await expect(tagline).toHaveValue('A draft worth keeping.')
  await loaded(page, () =>
    page.getByRole('button', { name: 'Refresh', exact: true }).click(),
  )
  await expect(tagline).toHaveValue('A draft worth keeping.')
  await page.getByRole('button', { name: 'Use refreshed version' }).click()
  await loaded(page, () => submit.click())
  await expect(
    page.getByRole('region', { name: 'Edit empire identity' }),
  ).toHaveCount(0)
  expect(owner.data.identity).toEqual({
    name: 'Roman Empire',
    tagline: 'A draft worth keeping.',
    title_id: 'missing-title',
  })
  expect(owner.writes).toHaveLength(1)
})
