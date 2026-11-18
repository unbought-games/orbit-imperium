import type { Page } from './fixture'
import type { HudInput } from './command-hud.scenario'
export async function mountHud(
  page: Page,
  mount: (name: string) => Promise<void>,
  input: HudInput = {},
) {
  await page.addInitScript((input) => {
    window.hudInput = input
  }, input)
  await mount('command-hud')
}
