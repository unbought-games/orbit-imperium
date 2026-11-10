import { test, expect } from './fixture'

for (const mode of ['rejected', 'uncertain'] as const) {
  test(`bulk ${mode} result restores every report and preserves the selection for review`, async ({
    page,
  }) => {
    await page.goto('/report-observation.html?scenario=cleanup')
    await expect(page.locator('html')).toHaveAttribute(
      'data-component-ready',
      'cleanup',
    )
    const rows = page
      .getByRole('list', { name: 'Visible reports' })
      .getByRole('listitem')
    await expect(rows).toHaveText(['one', 'two', 'protected'])
    await page
      .getByRole('button', { name: 'Select loaded reports (2)' })
      .click()
    await expect(
      page.getByRole('group', { name: 'Report selection' }),
    ).toContainText('2 selected')
    await page.getByRole('button', { name: 'Archive selected (2)' }).click()
    await expect(page.getByLabel('Submitted commands')).toHaveText('1')
    await expect(rows).toHaveText(['protected'])
    await expect(page.getByLabel('Stored archive flags')).toHaveText(
      'false,false,false',
    )
    await expect(
      page.getByRole('button', { name: 'Cancel selection' }),
    ).toBeDisabled()
    await page
      .getByRole('button', {
        name: mode === 'rejected' ? 'Deliver rejection' : 'Deliver uncertainty',
      })
      .click()
    await expect(rows).toHaveText(['one', 'two', 'protected'])
    await expect(page.getByRole('alert')).toHaveText(
      'Cleanup stopped. Check the remaining reports before trying again.',
    )
    await expect(
      page.getByRole('group', { name: 'Report selection' }),
    ).toContainText('2 selected')
    await expect(
      page.getByRole('button', { name: 'Cancel selection' }),
    ).toBeEnabled()
    await expect(page.getByLabel('Submitted commands')).toHaveText('1')
    await expect(page.getByLabel('Stored archive flags')).toHaveText(
      'false,false,false',
    )
  })
}
