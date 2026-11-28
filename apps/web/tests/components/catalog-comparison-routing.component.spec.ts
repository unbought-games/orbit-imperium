import { test, expect, type Page } from './fixture'
import type { components } from '../../src/contracts'
import type {} from './progression.scenarios'
type S = components['schemas']

async function prepare(
  page: Page,
  item: string,
  data: {
    catalog: S['CatalogEntry3'][]
    research: S['BoundView4']['research']
  },
) {
  await page.goto(
    '/?' +
      new URLSearchParams({
        scenario: 'progression-detail',
        item,
        list: 'yes',
      }),
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'progression-detail',
  )
  await page.evaluate(async (data) => {
    const { view, refresh } = window.progressionScene
    Object.assign(view, data)
    await refresh()
  }, data)
}

test('ship comparison follows the shipyard tiles and Enter opens the mounted comparison', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 950 })
  const ship = (
    id: 'LightFighter' | 'HeavyFighter',
    speed: string,
    drive: 'CombustionDrive' | 'ImpulseDrive',
  ): S['CatalogEntry3'] => ({
    key: { kind: 'Ship', id },
    enabled: true,
    mobile: true,
    requirements: [],
    body_kinds: ['Planet'],
    ship_statistics: {
      cost: ['3000', '1000', '0'],
      propulsion: {
        cargo_capacity: '50',
        base_speed: speed,
        fuel_consumption: '20',
        drive,
        drive_coefficient:
          drive === 'CombustionDrive' ? ['1', '10'] : ['1', '5'],
        impulse_upgrade: null,
      },
      combat: {
        attack_ticks: '5000000',
        shield_ticks: '1000000',
        hull_ticks: '40000000',
        technology_bonus: ['1', '10'],
        rapid_fire_against: [],
        rapid_fire_from: [],
      },
    },
  })
  const options = {
    catalog: [
      ship('LightFighter', '12500', 'CombustionDrive'),
      ship('HeavyFighter', '10000', 'ImpulseDrive'),
    ],
    research: [
      { research: 'CombustionDrive' as const, level: 2 },
      { research: 'ImpulseDrive' as const, level: 4 },
    ],
  }
  await prepare(page, 'SmallCargo', options)
  const summary = page.locator('summary').filter({ hasText: 'Compare ships' })
  const comparisonBox = (await summary.boundingBox())!
  for (const name of ['Build Light Fighter', 'Build Heavy Fighter']) {
    const ship = page.getByRole('link', { name, exact: true })
    const shipBox = (await ship.boundingBox())!
    expect(comparisonBox.y).toBeGreaterThan(shipBox.y + shipBox.height)
  }
  await summary.focus()
  await page.keyboard.press('Enter')
  const table = page.getByRole('table', {
    name: 'Current player ship statistics · per ship',
  })
  await expect(
    table.getByRole('row', { name: 'Effective speed 15,000 18,000' }),
  ).toBeVisible()
  await expect(
    table.getByRole('img', { name: 'Metal', exact: true }),
  ).toHaveCount(2)
  await expect(
    table.getByRole('row', {
      name: 'Attack strength Unavailable Unavailable',
    }),
  ).toBeVisible()
})
test('opening a defense detail resets the list comparison mode and selected defenses', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 950 })
  const defense = (
    id: 'RocketLauncher' | 'LightLaser' | 'SmallShieldDome',
    cost: string[],
    attack: string,
  ): S['CatalogEntry3'] => ({
    key: { kind: 'Defense', id },
    enabled: true,
    mobile: false,
    requirements: [],
    body_kinds: ['Planet', 'Moon'],
    technical_data: {
      cost,
      bonuses: [],
      storage_capacities: null,
      combat: {
        attack_ticks: attack,
        shield_ticks: '2000000',
        hull_ticks: '20000000',
        technology_bonus: ['1', '10'],
        rapid_fire_against: [],
        rapid_fire_from: [
          { unit: { kind: 'Ship', id: 'Bomber' }, factor: '20' },
        ],
      },
      facts: [
        {
          label: 'Recovery after combat',
          value:
            '7 / 10 chance for each destroyed defense to recover independently; not a guaranteed fraction of losses.',
          subject: null,
        },
        ...(id === 'SmallShieldDome'
          ? [
              {
                label: 'Body limit',
                value:
                  'One completed or queued dome of this type per planet or moon. Its shield protects itself, not other units.',
                subject: null,
              },
            ]
          : []),
      ],
    },
  })
  const options = {
    catalog: [
      defense('RocketLauncher', ['2000', '0', '0'], '8000000'),
      defense('LightLaser', ['1500', '500', '0'], '10000000'),
      defense('SmallShieldDome', ['10000', '10000', '0'], '100000'),
    ],
    research: [
      { research: 'WeaponsTechnology' as const, level: 3 },
      { research: 'ShieldingTechnology' as const, level: 2 },
      { research: 'ArmourTechnology' as const, level: 1 },
    ],
  }
  await prepare(page, 'RocketLauncher', options)
  const summary = page
    .locator('summary')
    .filter({ hasText: 'Compare defenses' })
  await summary.focus()
  await page.keyboard.press('Enter')
  const region = page.getByRole('region', { name: 'Defense comparison table' })
  await expect(
    region.getByRole('row', { name: 'Attack strength 104 130', exact: true }),
  ).toBeVisible()
  await expect(
    region.getByRole('img', { name: 'Metal', exact: true }),
  ).toHaveCount(2)
  await expect(
    page.getByRole('rowheader', { name: 'Cargo capacity' }),
  ).toHaveCount(0)
  await page.getByRole('radio', { name: 'Base stats', exact: true }).check()
  await page
    .getByRole('checkbox', { name: 'Rocket Launcher', exact: true })
    .uncheck()
  // The route transition must create the detail's default selection and mode.
  await page
    .getByRole('link', { name: 'Build Small Shield Dome', exact: true })
    .click()
  await expect(
    page
      .getByRole('region', { name: 'Progression quote' })
      .getByRole('heading', { name: 'Small Shield Dome', exact: true }),
  ).toBeVisible()
  await summary.click()
  await expect(
    region.getByRole('columnheader', {
      name: 'Small Shield Dome',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    region.getByRole('columnheader', { name: 'Light Laser', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('radio', { name: 'My current stats', exact: true }),
  ).toBeChecked()
})
