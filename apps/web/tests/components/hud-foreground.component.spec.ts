import { test, expect } from './fixture'
import { mountHud } from './mount-hud'
import { id } from '../../src/test-support/bootstrap'

test('native foreground delivery updates the mounted orb after an accepted overview', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    Math.random = () => 0.45
  })
  await page.clock.install()
  await mountHud(page, mount, { nativeDelivery: true })
  const orb = page.getByTestId('command-orb')
  await expect(orb).toBeVisible()
  await orb.evaluate(async (el) => {
    await Promise.all(
      el
        .getAnimations()
        .filter(
          (a) => a instanceof CSSAnimation && a.animationName.includes('orbIn'),
        )
        .map((a) => a.finished),
    )
  })
  await page.clock.fastForward(6000)
  await expect(page.getByTestId('orb-caption')).toHaveCount(0)
  const visibility = async (hidden: boolean) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: hidden,
      })
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: hidden ? 'hidden' : 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  await visibility(true)
  await page.clock.setSystemTime(
    (await page.evaluate(() => Date.now())) + 25 * 60000,
  )
  await page.evaluate(() => {
    window.hudScene.view.viewer_revision = '2'
  })
  await visibility(false)
  await expect
    .poll(() =>
      page.evaluate(() => window.hudScene.model.view?.viewer_revision),
    )
    .toBe('2')
  const caption = page.getByTestId('orb-caption')
  await expect(caption).toHaveText('Welcome back, Commander.')
  expect(
    await page
      .getByTestId('orb-refresh-pulse')
      .locator('span')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toContain('refreshWave')
  await page.setViewportSize({ width: 320, height: 740 })
  expect((await caption.boundingBox())!.x).toBeGreaterThanOrEqual(0)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(orb).toBeVisible()
})

test('new conversation and alliance entries each open, acknowledge and return to the live inbox', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mountHud(page, mount, { conversations: [], circulars: [] })
  const orb = page.getByTestId('command-orb')
  await orb.click()
  await expect(
    page.getByText('No new intelligence. All channels clear.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close command HUD' }).click()
  const peer = id(99),
    baseTime = 1793120000000
  await page.evaluate(
    ({ peer, baseTime, message }) => {
      window.hudInput!.conversations!.push({
        contact: {
          player: peer,
          username: 'Nova',
          blocked: false,
          request: null,
          requested_by: null,
          accepted: false,
        },
        latest: {
          id: message,
          sequence: '1',
          sender: peer,
          body: '**Scouts are ready.**',
          sent_at: baseTime,
        },
        unread: true,
      })
      window.dispatchEvent(new Event('focus'))
    },
    { peer, baseTime, message: id(851) },
  )
  const toast = page.getByLabel('Recent game events')
  await toast.getByRole('button', { name: /Message received/ }).click()
  const panel = page.getByRole('dialog')
  await expect(
    panel.locator('strong', { hasText: 'Scouts are ready.' }),
  ).toBeVisible()
  await expect(
    panel.getByRole('link', { name: 'Open conversation', exact: true }),
  ).toHaveAttribute('href', `/u/andromeda/b/${id(5)}/messages?player=${peer}`)
  await expect
    .poll(() => page.evaluate(() => window.hudInput!.conversations![0].unread))
    .toBe(false)
  await page.getByRole('button', { name: 'Close command HUD' }).click()
  await expect(orb).toHaveAttribute('data-tone', 'ice')
  await page.evaluate(
    ({ peer, baseTime, circular, alliance }) => {
      window.hudInput!.circulars!.push({
        id: circular,
        alliance,
        alliance_name: 'Starlight',
        alliance_tag: 'STAR',
        sender: peer,
        sender_name: 'Nova',
        body: 'Defend the outpost.',
        sent_at: baseTime,
        read: false,
      })
      window.dispatchEvent(new Event('focus'))
    },
    { peer, baseTime, circular: id(852), alliance: id(90) },
  )
  await toast.getByRole('button', { name: /Alliance transmission/ }).click()
  await expect(panel).toContainText('Defend the outpost.')
  await expect
    .poll(() => page.evaluate(() => window.hudInput!.circulars![0].read))
    .toBe(true)
})
