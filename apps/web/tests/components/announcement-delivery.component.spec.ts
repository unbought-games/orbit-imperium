import { expect, test } from './fixture'
import { title } from '../fixtures/editorial'
import type {} from './orb-editorial.scenarios'
test('a mounted orb receives published and withdrawn announcements on native foreground refresh', async ({
  page,
  mount,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-07T15:00:00Z'))
  await mount('announcement-delivery')
  const bubble = page.getByRole('dialog', { name: title })
  await expect(bubble).toHaveCount(0)
  await page.evaluate(() => {
    window.setPublishedAnnouncement!(true)
    window.dispatchEvent(new Event('focus'))
  })
  await expect(bubble).toBeVisible()
  await page.evaluate(() => {
    window.setPublishedAnnouncement!(false)
    window.dispatchEvent(new Event('focus'))
  })
  await expect(bubble).toHaveCount(0)
  await expect(page.getByTestId('command-orb')).toBeVisible()
})
