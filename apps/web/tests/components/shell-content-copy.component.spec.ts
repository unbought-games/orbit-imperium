import { test, expect, type Locator } from './fixture'
import { id } from '../../src/test-support/bootstrap'
import type {} from './rankings.scenario'
import { mountHud } from './mount-hud'

async function selection(target: Locator, suppress: boolean) {
  await expect(target).toBeVisible()
  if (suppress) await expect(target).toHaveCSS('-webkit-user-select', 'none')
  else await expect(target).not.toHaveCSS('-webkit-user-select', 'none')
}

for (const touch of [true, false]) {
  test.describe(touch ? 'coarse pointer' : 'fine pointer', () => {
    test.use({
      hasTouch: touch,
      isMobile: touch,
      viewport: { width: touch ? 390 : 1440, height: 900 },
    })

    test('catalog actions use control selection while descriptions remain copyable', async ({
      page,
      mount,
    }) => {
      await mount('resources')
      const tile = page.getByRole('link', {
        name: 'Upgrade Metal Mine',
        exact: true,
      })
      await selection(tile, touch)
      if (touch) {
        const callout = await tile.evaluate((element) =>
          CSS.supports('-webkit-touch-callout', 'none')
            ? getComputedStyle(element).getPropertyValue(
                '-webkit-touch-callout',
              )
            : null,
        )
        if (callout !== null) expect(callout).toBe('none')
      }
      await tile.click()
      await selection(page.locator('figcaption p'), false)
      await selection(page.getByRole('link', { name: /^Back to/ }), touch)
    })

    test('Galaxy coordinates and slot help remain copyable beside touch controls', async ({
      page,
      mount,
    }) => {
      await mount('galaxy-screen')
      await selection(
        page.getByRole('link', { name: /View .* in galaxy/ }).first(),
        false,
      )
      const slots = page.getByRole('button', { name: /^Fleet slots:/ })
      if (touch) await selection(slots, true)
      await slots.click()
      await selection(
        page.getByRole('tooltip').getByText(/Used slots out of/),
        false,
      )
    })

    test('orb controls and their open panel retain distinct selection behavior', async ({
      page,
      mount,
    }) => {
      await mountHud(page, mount)
      const orb = page.getByRole('button', { name: /Open command HUD/ })
      if (touch) await selection(orb, true)
      await selection(page.getByLabel(/^Fleet slots: \d+ used of \d+$/), touch)
      await orb.click()
      await selection(
        page
          .getByRole('dialog', { name: 'Command uplink' })
          .getByRole('heading', { name: 'Command uplink', exact: true }),
        false,
      )
    })

    test('rankings range remains selectable beside its page controls', async ({
      page,
      mount,
    }) => {
      await page.addInitScript((player) => {
        window.rankingInput = {
          data: {
            players: [
              {
                player,
                username: 'Copyable Commander',
                points: '1000',
                rank: 1,
              },
            ],
            sampled_at: 1792843200000,
            processing_pending: false,
          },
        }
      }, id(2))
      await mount('rankings')
      const nav = page.getByRole('navigation', {
        name: 'Ranking pages',
        exact: true,
      })
      const range = nav.getByRole('status')
      await expect(range).toHaveText('1–1 of 1')
      await selection(range, false)
      if (touch)
        await selection(
          nav.getByRole('button', { name: 'Next', exact: true }),
          true,
        )
    })
    test('empty directory content remains selectable beside the submitted search control', async ({
      page,
      mount,
    }) => {
      await mount('alliance-directory')
      await page
        .getByRole('searchbox', { name: 'Search alliances' })
        .fill('No such alliance')
      const search = page.getByRole('button', {
        name: 'Search alliances',
        exact: true,
      })
      await search.click()
      await selection(
        page.getByRole('heading', { name: 'No alliances match your search.' }),
        false,
      )
      await expect(
        page.getByRole('navigation', { name: 'Alliance directory pages' }),
      ).toHaveCount(0)
      if (touch) await selection(search, true)
    })
    test('public support links allow native text selection and system callouts', async ({
      page,
      mount,
    }) => {
      await mount('public-entry')
      const support = page
        .getByRole('navigation', { name: 'Policies and support' })
        .getByRole('link', { name: 'Support', exact: true })
      await selection(support, false)
      await expect(support).not.toHaveCSS('-webkit-touch-callout', 'none')
    })
  })
}
