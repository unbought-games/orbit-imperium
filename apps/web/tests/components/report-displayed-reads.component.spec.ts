import { test, expect } from './fixture'
import { mountHud } from './mount-hud'

test('the open HUD waits for a pending archive and then displays the remaining unread report', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await mountHud(page, mount, { reports: 2 })
  try {
    await page.evaluate(async () => {
      const scene = window.hudScene
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
    const before = await page.evaluate(
      () => window.hudScene.calls.filter(Boolean).length,
    )
    await page.getByTestId('command-orb').click()
    const dialog = page.getByRole('dialog', { name: 'Command uplink' })
    await expect(
      dialog.getByRole('status').filter({ hasText: 'Loading intelligence…' }),
    ).toBeVisible()
    expect(
      await page.evaluate(() => window.hudScene.calls.filter(Boolean).length),
    ).toBe(before)
    await page.evaluate(() => window.releaseReportPort?.())
    await expect(
      dialog
        .getByLabel('Intelligence list')
        .getByRole('button', { name: /Espionage report/ }),
    ).toHaveCount(1)
    await expect(
      dialog.getByRole('status').filter({ hasText: 'Loading intelligence…' }),
    ).toHaveCount(0)
  } finally {
    await page.evaluate(() => window.releaseReportPort?.())
  }
})
