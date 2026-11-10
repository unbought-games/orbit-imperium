import { test, expect } from './fixture'
import { focusPlayerDetails } from '../fixtures/profile-navigation'
import type { ProfileDisplayControl } from './profile-display.scenarios'

test('prepared supporter tiers expose their accessible badges and computed colors while ordinary players have no badge', async ({
  page,
  mount,
}) => {
  await mount('profile-display')
  for (const [name, label, color] of [
    ['AzureCommander', 'Supporter · $10 / month USD', 'rgb(133, 214, 239)'],
    ['RoseCommander', 'Supporter · $25 / month USD', 'rgb(240, 172, 212)'],
    ['ApricotCommander', 'Supporter · $100 / month USD', 'rgb(242, 187, 131)'],
  ]) {
    const identity = page.getByRole('link', {
      name: `${name} profile details`,
      exact: true,
    })
    const badge = identity.getByRole('img', { name: label, exact: true })
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute('title', label)
    await expect(badge).toHaveCSS('color', color)
  }
  const ordinary = page.getByRole('link', {
    name: 'RegularCommander profile details',
    exact: true,
  })
  await expect(ordinary).toBeVisible()
  await expect(ordinary).toHaveText('RegularCommander')
  await expect(ordinary.getByRole('img', { name: /Supporter/ })).toHaveCount(0)
  await expect(page.getByRole('img', { name: /Supporter/ })).toHaveCount(3)
})

test('a mounted player identity and open dossier react to bot-to-human publication in the same controller store', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('profile-display')
  const identity = page.getByRole('link', {
    name: 'RoseCommander profile details',
    exact: true,
  })
  await expect(identity.getByLabel('Bot', { exact: true })).toBeVisible()
  await focusPlayerDetails(page, identity)
  const dossier = page.getByRole('tooltip', {
    name: 'RoseCommander profile',
    exact: true,
  })
  await expect(dossier).toBeVisible()
  await expect(
    dossier.getByText('Automated player', { exact: true }),
  ).toBeVisible()
  await expect(dossier).toContainText('An automated empire in this universe.')
  const mountedIdentity = await identity.elementHandle()
  const mountedDossier = await dossier.elementHandle()
  expect(mountedIdentity).not.toBeNull()
  expect(mountedDossier).not.toBeNull()

  // No click, navigation or refocus: keep the existing dossier open while its
  // real Zustand subscription receives the prepared authoritative record.
  await page.evaluate(() => {
    const control: ProfileDisplayControl | undefined =
      window.profileDisplayScene
    if (!control)
      throw new Error('Profile display scene control is unavailable')
    control.publishHuman()
  })
  await expect(identity.getByLabel('Bot', { exact: true })).toHaveCount(0)
  await expect(identity).toContainText('RoseCommander')
  await expect(
    identity.getByRole('img', {
      name: 'Supporter · $25 / month USD',
      exact: true,
    }),
  ).toBeVisible()
  await expect(dossier).toBeVisible()
  await expect(dossier.getByText('Commander', { exact: true })).toBeVisible()
  await expect(dossier).toContainText('An empire among the stars.')
  await expect(dossier).not.toContainText(/automated|\bBot\b/i)
  expect(await mountedIdentity!.evaluate((node) => node.isConnected)).toBe(true)
  expect(await mountedDossier!.evaluate((node) => node.isConnected)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dossier).toHaveCount(0)
  await expect(identity).toBeFocused()
})
