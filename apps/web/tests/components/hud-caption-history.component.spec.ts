import { expect, test } from './fixture'
import { id } from '../../src/test-support/bootstrap'
import type {} from './command-hud.scenario'
test('a remounted HUD retains the bound commander’s caption education and one-time humor', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.addInitScript(() => {
    Math.random = () => 0
    window.hudInput = { headers: [], conversations: [] }
  })
  await mount('hud-remount')
  const caption = page.getByTestId('orb-caption')
  await expect(caption).toHaveText('Welcome, Commander.')
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  const peer = id(99)
  await page.evaluate(
    ({ peer, message }) => {
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
          body: 'Scouts are ready.',
          sent_at: 1793120000000,
        },
        unread: true,
      })
      window.dispatchEvent(new Event('focus'))
    },
    { peer, message: id(851) },
  )
  await expect(caption).toHaveText('Champagne means unread.')
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  const publish = async (n: number) =>
    page.evaluate(async (id) => {
      const s = window.hudScene
      s.headers.unshift({
        id,
        kind: 'Combat',
        observed_at: 1793120000000 + s.headers.length,
        read: false,
        hidden: false,
        preview: {
          kind: 'Combat',
          mission: 'Espionage',
          outcome: 'DefenderVictory',
          participants: [{ owner: s.view.binding.player, side: 'Attacker' }],
        },
      })
      s.view.has_unread_reports = true
      await s.refresh()
    }, id(n))
  await publish(861)
  await expect(
    page
      .getByLabel('Recent game events')
      .getByRole('button', { name: /Combat report/ }),
  ).toBeVisible()
  await page.clock.fastForward(8000)
  await expect(caption).toHaveText('Whoops.')
  await page.clock.fastForward(6000)
  await expect(caption).toHaveCount(0)
  await page.getByRole('button', { name: 'Remount command HUD' }).click()
  await expect(page.getByTestId('command-orb')).toHaveAttribute(
    'data-tone',
    'champagne',
  )
  await publish(862)
  await expect(page.getByTestId('unread-count')).toHaveText('3')
  await page.clock.fastForward(8000)
  await expect(caption).toHaveCount(0)
})
