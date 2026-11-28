import { id } from '../../src/test-support/bootstrap'
import { test, expect } from './fixture'
import { mountHud } from './mount-hud'

test('the open HUD waits for a pending archive and then displays the remaining unread report', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const remaining = id(71)
  await mountHud(page, mount, {
    pageSize: 1,
    headers: [
      {
        id: id(70),
        kind: 'Returned',
        observed_at: 3000,
        hidden: false,
        read: true,
      },
      {
        id: remaining,
        kind: 'Espionage',
        observed_at: 2000,
        hidden: false,
        read: false,
      },
      {
        id: id(72),
        kind: 'SpyContact',
        observed_at: 1000,
        hidden: false,
        read: false,
      },
    ],
  })
  try {
    await page.evaluate(async () => {
      const scene = window.hudScene
      await scene.model.reports
        .forQuery({
          kind: null,
          filter: {
            hidden: false,
            unread_only: false,
            starred_only: false,
            sort: 'newest',
          },
        })
        .ensureInbox()
      await scene.model.reports.ensureInbox()
      const send = scene.port.submit
      scene.port.submit = async (envelope) => {
        await new Promise<void>((resolve) => {
          window.releaseReportPort = resolve
        })
        return send(envelope)
      }
      void scene.model.send({
        type: 'World',
        action: {
          type: 'SetReportHidden',
          report: scene.headers[0].id,
          hidden: true,
        },
      })
    })
    await expect
      .poll(() => page.evaluate(() => typeof window.releaseReportPort))
      .toBe('function')
    expect(
      await page.evaluate(
        () => window.hudScene.model.store.getState().reportInbox,
      ),
    ).toMatchObject({ has_more: true, next_cursor: remaining })
    const before = await page.evaluate(
      () => window.hudScene.calls.filter(Boolean).length,
    )
    await page.getByTestId('command-orb').click()
    const dialog = page.getByRole('dialog', { name: 'Command uplink' })
    await expect(
      dialog.getByRole('status').filter({ hasText: 'Loading intelligence…' }),
    ).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Load more intelligence' }),
    ).toHaveCount(0)
    expect(
      await page.evaluate(() => window.hudScene.calls.filter(Boolean).length),
    ).toBe(before)
    await page.evaluate(() => window.releaseReportPort?.())
    const intelligence=dialog.getByLabel('Intelligence list')
    const remainingReport=intelligence.getByRole('button',{name:/Espionage report/}).and(intelligence.locator('button[data-kind="Espionage"]'))
    await expect(remainingReport).toBeVisible()
    await expect(
      dialog.getByRole('status').filter({ hasText: 'Loading intelligence…' }),
    ).toHaveCount(0)
  } finally {
    await page.evaluate(() => window.releaseReportPort?.())
  }
})
