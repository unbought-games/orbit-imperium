import { test, expect } from './fixture'
import { installObservedEmpire, loaded } from '../fixtures/observed-empire'
import { withFixtureResponseStatus } from '../fixtures/responses'
import { binding } from '../../src/test-support/empire'

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
