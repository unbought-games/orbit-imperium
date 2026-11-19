import { test, expect } from './fixture'
import { body, resources, id } from '../../src/test-support/empire'
import type { EmpireSceneInput } from './empire-runtime'
import type {} from './empire.scenarios'

for (const [kind, elapsed] of [
  ['construction', 60_000],
  ['research', 0],
] as const) {
  test(`${kind} summary retains confirmed work while its one cancellation is pending`, async ({
    page,
    mount,
  }) => {
    const serverNow = 1800000000000
    const options: EmpireSceneInput = {
      screen: kind === 'construction' ? 'overview' : 'research',
      bodies: [structuredClone(body)],
      sampledAt: serverNow,
      constructions:
        kind === 'construction'
          ? [
              {
                id: id(10),
                body: body.id,
                building: 'ResearchLab',
                target_level: 1,
                started_at: serverNow - elapsed,
                due_at: serverNow + 76000,
                paid: resources,
              },
            ]
          : [],
      researchOperation:
        kind === 'research'
          ? {
              id: id(10),
              host: body.id,
              research: 'EnergyTechnology',
              source_level: 0,
              target_level: 1,
              paid: resources,
              started_at: serverNow - elapsed,
              due_at: serverNow + 76000,
              labs: [],
              effective_lab: '1',
              can_cancel: true,
            }
          : null,
    }
    await page.addInitScript((input) => {
      window.empireInput = input
    }, options)
    await mount('empire')
    await page.evaluate(() => window.empireScene.hold())
    try {
      const scope =
        kind === 'construction'
          ? page.getByRole('article', {
              name: 'Planet [1:371:12] dossier',
              exact: true,
            })
          : page
      const summary = scope.getByRole('region', {
        name: kind === 'construction' ? 'Buildings' : 'Research',
        exact: true,
      })
      const cancel = summary.getByRole('button', {
        name: `Cancel ${kind}`,
        exact: true,
      })
      await expect(cancel).toBeVisible()
      await cancel.click()
      if (elapsed >= 30_000) {
        await expect(page.getByRole('dialog')).toContainText(
          '1 minute of work will be lost.',
        )
        await page
          .getByRole('button', { name: 'Yes, cancel', exact: true })
          .click()
      } else await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(cancel).toBeDisabled()
      if (kind === 'construction')
        await expect(cancel).toHaveText('Cancelling…')
      else
        await expect(
          summary.getByText('Cancelling', { exact: true }),
        ).toBeVisible()
      if (kind === 'construction') {
        await expect(summary).toContainText('Research Lab · Level 1')
      } else {
        await expect(
          summary.getByRole('link', {
            name: 'Energy Technology · Level 1',
            exact: true,
          }),
        ).toBeVisible()
        await expect(
          summary.getByText('Level 1', { exact: true }),
        ).toBeVisible()
      }
      await expect(summary).toContainText(/1m \d+s/)
      await expect(summary).not.toContainText(`No ${kind} in progress.`)
      if (kind === 'construction')
        await expect(
          summary.getByRole('link', { name: 'Resources' }),
        ).toHaveAttribute('href', /\/resources$/)
      expect(
        await page.evaluate(() =>
          window.empireScene.sent.map((envelope) => envelope.command),
        ),
      ).toEqual([
        {
          type:
            kind === 'construction' ? 'CancelConstruction' : 'CancelResearch',
          operation: id(10),
        },
      ])
    } finally {
      await page.evaluate(() => window.empireScene.release())
    }
    const summary = page.getByRole('region', {
      name: kind === 'construction' ? 'Buildings' : 'Research',
      exact: true,
    })
    await expect(
      summary.getByRole('button', { name: `Cancel ${kind}`, exact: true }),
    ).toHaveCount(0)
    await expect(
      summary.getByText(`No ${kind} in progress.`, { exact: true }),
    ).toBeVisible()
  })
}
