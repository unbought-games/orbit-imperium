import { test, expect } from './fixture'
import type {} from './empire.scenarios'
import type { EmpireSceneInput } from './empire-runtime'
import { body, id } from '../../src/test-support/empire'
import { catalog } from '../fixtures/simulation-observation-catalog'
import observation from '../../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import type { components } from '../../src/contracts'
for (const hidden of [false, true])
  test(`the reader simulator preserves ${hidden ? 'unknown' : 'observed'} intelligence through edits, retry and detachment`, async ({
    page,
    mount,
  }) => {
    const observedResources = {
      metal: '29800000000',
      crystal: '110000000',
      deuterium: '90000000',
    }
    const header = { id: id(63) }
    const payload = {
      ...observation,
      observed_at: Date.now() - 7200000,
      resources: hidden
        ? { visibility: 'Unknown' }
        : { visibility: 'Known', value: observedResources },
      defenses: hidden
        ? { visibility: 'Unknown' }
        : {
            visibility: 'Known',
            value: [
              { item: { kind: 'Defense', id: 'HeavyLaser' }, count: '7' },
              { item: { kind: 'Defense', id: 'LargeShieldDome' }, count: '1' },
              { item: { kind: 'Defense', id: 'PlasmaTurret' }, count: '3' },
            ],
          },
      fleet: hidden
        ? { visibility: 'Unknown' }
        : {
            visibility: 'Known',
            value: [
              { item: { kind: 'Ship', id: 'LightFighter' }, count: '12' },
            ],
          },
      research: hidden ? { visibility: 'Unknown' } : observation.research,
    } as components['schemas']['EspionagePayload4']
    const input: EmpireSceneInput = {
      catalog,
      simulationReport: payload,
      refuseFirstSimulation: hidden,
      research: [],
      bodies: [
        {
          ...body,
          inventories: [
            { item: { kind: 'Ship', id: 'LightFighter' }, count: '3' },
          ],
        },
        {
          ...body,
          id: id(6),
          inventories: [
            { item: { kind: 'Ship', id: 'LightFighter' }, count: '99' },
          ],
        },
        { ...body, id: id(7), kind: 'Moon' },
      ],
      simulationAvailable: {
        metal: '14900000000',
        crystal: '55000000',
        deuterium: '45000000',
      },
      simulationLoot: {
        metal: '216000000',
        crystal: '55000000',
        deuterium: '45000000',
      },
      simulationSamples: Array.from({ length: 10 }, () => ({
        outcome: 'AttackerVictory',
        rounds: 1,
        moon_chance_percent: hidden ? 20 : 0,
        debris: { metal: '18000000', crystal: '6000000', deuterium: '0' },
        surviving_cargo_capacity: '400000000',
        estimated_loot: null,
        attacker: [
          { item: { kind: 'Ship', id: 'LightFighter' }, count: 8 },
          { item: { kind: 'Ship', id: 'Bomber' }, count: 0 },
        ],
        defender: [],
      })),
    }
    await page.addInitScript((input) => {
      window.empireInput = input
    }, input)
    await mount('empire')
    const trigger = page.getByRole('button', {
      name: 'Simulate combat',
      exact: true,
    })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Combat simulation' })
    await expect(
      dialog.getByRole('link', { name: /Espionage report/ }),
    ).toHaveAttribute('href', `/u/andromeda/b/${body.id}/reports/${header.id}`)
    const fill = dialog.getByRole('button', {
      name: 'Use all 3 available Light Fighter',
    })
    const start = dialog.getByRole('textbox', {
      name: 'Attacker Light Fighter',
      exact: true,
    })
    const arrow = dialog.getByRole('button', {
      name: 'Add all Light Fighter',
      exact: true,
    })
    await expect(fill).toHaveText('3 available')
    if (hidden) {
      await fill.focus()
      await page.keyboard.press('Enter')
      await expect(start).toHaveValue('3')
      await start.fill('1')
      await page.keyboard.press('Tab')
      await expect(arrow).toBeFocused()
      await page.keyboard.press('Enter')
    } else {
      // Match Dispatch: the entire arrow target belongs inside this ship's input.
      expect(
        await arrow.evaluate(
          (button, input) => {
            const target = button.getBoundingClientRect()
            const field = input!.getBoundingClientRect()
            return (
              target.left >= field.left &&
              target.right <= field.right &&
              target.top >= field.top &&
              target.bottom <= field.bottom
            )
          },
          await start.elementHandle(),
        ),
      ).toBe(true)
      await fill.click()
      await expect(start).toHaveValue('3')
      await start.fill('1')
      await arrow.click()
    }
    await expect(start).toHaveValue('3')
    await expect(
      dialog.getByRole('region', {
        name: 'Attacker technologies',
        exact: true,
      }),
    ).toBeVisible()
    const defenderDefenses = dialog.getByRole('region', {
      name: 'Defender defenses',
      exact: true,
    })
    await expect(defenderDefenses.locator('details')).toHaveJSProperty(
      'open',
      true,
    )
    const defenderShips = dialog.getByRole('region', {
      name: 'Defender ships',
      exact: true,
    })
    await expect(defenderShips.locator('details')).toHaveJSProperty(
      'open',
      true,
    )
    if (!hidden) {
      await expect(defenderShips.locator('summary')).toHaveText(
        'Ships 12 units',
      )
      const launcher = defenderDefenses.getByLabel('Defender Rocket Launcher', {
        exact: true,
      })
      await expect(defenderDefenses.locator('summary')).toHaveText(
        'Defenses 11 units',
      )
      await launcher.fill('2')
      await expect(defenderDefenses.locator('summary')).toHaveText(
        'Defenses 13 units',
      )
      await launcher.fill('0')
      await defenderShips.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(
        dialog.getByLabel('Defender Light Fighter', { exact: true }),
      ).not.toBeVisible()
      await page.keyboard.press('Enter')
      await expect(
        dialog.getByLabel('Defender Light Fighter', { exact: true }),
      ).toBeVisible()
      await dialog
        .getByLabel('Defender Light Fighter', { exact: true })
        .fill('20001')
      await defenderShips.locator('summary').click()
      await expect(defenderShips.locator('summary')).toContainText(
        '1 invalid values',
      )
      await expect(
        dialog.getByRole('button', { name: 'Simulate' }),
      ).toBeDisabled()
      await defenderShips.locator('summary').click()
      await dialog
        .getByLabel('Defender Light Fighter', { exact: true })
        .fill('13')
      await expect(defenderShips).toContainText('Differs from report · was 12')
      await expect(defenderShips.locator('summary')).toContainText('13 units')
      await dialog
        .getByLabel('Defender Light Fighter', { exact: true })
        .fill('12')
      await defenderShips.locator('summary').click()
    }

    await expect(
      dialog.getByText('Simulation assumptions', { exact: true }),
    ).toHaveCount(0)
    await expect(
      dialog.getByLabel('Defender Light Fighter', { exact: true }),
    ).toHaveValue(hidden ? '0' : '12')
    await expect(
      dialog.getByLabel('Defender Rocket Launcher', { exact: true }),
    ).toHaveValue('0')
    await expect(
      dialog.getByLabel('Defender Heavy Laser', { exact: true }),
    ).toHaveValue(hidden ? '0' : '7')
    await expect(
      dialog.getByLabel('Defender Large Shield Dome', { exact: true }),
    ).toHaveValue(hidden ? '0' : '1')
    await expect(
      dialog.getByLabel('Defender Plasma Turret', { exact: true }),
    ).toHaveValue(hidden ? '0' : '3')
    await expect(
      dialog.getByLabel('Attacker Plasma Turret', { exact: true }),
    ).toHaveCount(0)
    await expect(
      dialog.getByLabel('Attacker Large Shield Dome', { exact: true }),
    ).toHaveCount(0)
    await expect(
      dialog.getByLabel('Attacker Heavy Laser', { exact: true }),
    ).toHaveCount(0)
    await dialog
      .getByLabel('Attacker Light Fighter', { exact: true })
      .fill('10')
    await dialog.getByLabel('Attacker Bomber', { exact: true }).fill('2')
    await expect(
      dialog
        .getByRole('region', { name: 'Attacker ships', exact: true })
        .getByRole('heading', { name: 'Ships 12 units', exact: true }),
    ).toBeVisible()
    await expect(
      dialog.getByLabel('Defender Bomber', { exact: true }),
    ).toHaveValue('0')
    if (hidden) {
      await expect(
        dialog.getByRole('button', { name: 'Simulate' }),
      ).toBeEnabled()
      await expect(
        dialog.getByRole('button', {
          name: 'Assume all unknown values are zero',
        }),
      ).toHaveCount(0)
      await expect(dialog).toContainText('Not observed')
    }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
      expect(
        await dialog.locator('input[id^="simulation-"]').evaluateAll((inputs) =>
          inputs.every((input) => {
            const label = (
              input as HTMLInputElement
            ).labels![0].getBoundingClientRect()
            const box = input.getBoundingClientRect()
            return label.right <= box.left + 1 || label.bottom <= box.top + 1
          }),
        ),
      ).toBe(true)
    }
    await expect(
      dialog
        .getByRole('region', { name: 'Attack planning', exact: true })
        .locator('details'),
    ).toHaveJSProperty('open', true)
    if (!hidden)
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await dialog
          .getByRole('region', { name: 'Attack planning', exact: true })
          .scrollIntoViewIfNeeded()
        await expect(
          dialog.getByRole('button', { name: 'Review attack' }),
        ).toBeDisabled()
      }
    const run = () => dialog.getByRole('button', { name: 'Simulate' }).click()
    if (hidden) {
      await run()
      await expect(dialog.getByRole('alert')).toContainText('Simulation failed')
    }
    await run()
    await expect(
      dialog.getByRole('region', { name: 'Simulation results' }),
    ).toBeVisible()
    const results = dialog.getByRole('region', { name: 'Simulation results' })
    expect(
      await results.evaluate((el) =>
        Boolean(
          el.compareDocumentPosition(
            document.querySelector('[aria-label="Attack planning"]')!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    ).toBe(true)
    await expect(
      dialog.getByRole('group', {
        name: 'Attacker Light Fighter average outcome',
      }),
    ).toHaveText('8 remaining')
    await expect(
      dialog.getByRole('group', { name: 'Attacker Bomber average outcome' }),
    ).toHaveText('0 remaining')
    const cargo = results.getByRole('region', { name: 'Cargo and loot' })
    await expect(
      cargo
        .getByText('Avg. surviving capacity', { exact: true })
        .locator('..')
        .getByRole('definition'),
    ).toHaveText('400')
    await expect(
      results.getByText('Average Rounds: 1', { exact: true }),
    ).toBeVisible()
    await expect(results.getByText(/sampled battles/)).toHaveCount(0)
    await expect(
      results.getByRole('row', { name: /^Moon creation/ }).getByRole('cell'),
    ).toHaveText(hidden ? '20%' : '0%')
    if (hidden) {
      await expect(cargo).not.toContainText(/unknown|not observed/i)
      await expect(
        cargo.getByRole('table', { name: 'Haul', exact: true }),
      ).toHaveCount(0)
      await expect(
        cargo.getByText('Potential loot', { exact: false }),
      ).toHaveCount(0)
      await expect(
        cargo.getByText('Extra space for full haul', { exact: true }),
      ).toHaveCount(0)
    } else {
      await expect(
        cargo
          .getByText('Potential loot', { exact: true })
          .locator('..')
          .getByRole('definition'),
      ).toHaveText('15,000')
      const haul = cargo.getByRole('table', { name: 'Haul', exact: true })
      await expect(haul.getByRole('rowheader')).toHaveText([
        'Metal',
        'Crystal',
        'Deuterium',
        'Total',
      ])
      await expect(haul.getByRole('cell')).toHaveText([
        '216',
        '55',
        '45',
        '316',
      ])
      await expect(cargo).not.toContainText('attacker victories')
      await expect(
        cargo
          .getByText('Extra space for full haul', { exact: true })
          .locator('..')
          .getByRole('definition'),
      ).toHaveText('22,025')
    }
    if (!hidden) {
      for (const name of ['Metal', 'Crystal', 'Deuterium'])
        await expect(
          results.getByRole('img', { name, exact: true }).first(),
        ).toBeVisible()
      expect(
        (await page.evaluate(() => window.empireScene.simulations.at(-1)!))
          .observed_resources,
      ).toEqual(observedResources)
    } else
      expect(
        (await page.evaluate(() => window.empireScene.simulations.at(-1)!))
          .observed_resources,
      ).toBeUndefined()
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await results.evaluate((el) => el.scrollIntoView({ block: 'start' }))
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
      expect(
        await dialog.locator('input[id^="simulation-"]').evaluateAll((inputs) =>
          inputs.every((input) => {
            const label = (
              input as HTMLInputElement
            ).labels![0].getBoundingClientRect()
            const box = input.getBoundingClientRect()
            return label.right <= box.left + 1 || label.bottom <= box.top + 1
          }),
        ),
      ).toBe(true)
    }
    const debris = results.getByRole('region', {
      name: 'Debris and moon creation',
    })
    await expect(
      debris.getByRole('row', { name: /^Recyclers/ }).getByRole('cell'),
    ).toHaveText('1')
    await expect(debris).not.toContainText('max')
    await expect(results).not.toContainText(/mutual destruction/i)
    await expect(
      results.getByText('10 Attacker wins', { exact: true }),
    ).toHaveCSS('color', 'rgb(145, 201, 172)')
    await expect(
      results.getByText('0 Defender wins', { exact: true }),
    ).toHaveCSS('color', 'rgb(227, 152, 133)')
    expect(
      (await page.evaluate(() => window.empireScene.simulations.at(-1)!))
        .defender.units,
    ).toEqual(
      hidden
        ? []
        : [
            { item: { kind: 'Ship', id: 'LightFighter' }, count: 12 },
            { item: { kind: 'Defense', id: 'HeavyLaser' }, count: 7 },
            { item: { kind: 'Defense', id: 'LargeShieldDome' }, count: 1 },
            { item: { kind: 'Defense', id: 'PlasmaTurret' }, count: 3 },
          ],
    )
    expect(
      (await page.evaluate(() => window.empireScene.simulations.at(-1)!))
        .attacker.units,
    ).toEqual([
      { item: { kind: 'Ship', id: 'Bomber' }, count: 2 },
      { item: { kind: 'Ship', id: 'LightFighter' }, count: 10 },
    ])
    await dialog
      .getByLabel('Attacker Light Fighter', { exact: true })
      .fill('20')
    await expect(
      dialog.getByRole('region', { name: 'Simulation results' }),
    ).toHaveCount(0)
    await dialog.getByText('Use my planet as defender', { exact: true }).click()

    await dialog
      .getByRole('button', {
        name: 'Replace defender from current planet',
        exact: true,
      })
      .click()
    await expect(
      dialog.getByLabel('Defender Light Fighter', { exact: true }),
    ).toHaveValue('0')
    await expect(
      dialog.getByLabel('Attacker Light Fighter', { exact: true }),
    ).toHaveValue('20')
    await dialog.getByRole('button', { name: 'Simulate' }).click()
    await expect(results).toBeVisible()
    expect(
      (await page.evaluate(() => window.empireScene.simulations.at(-1)!))
        .observed_resources,
    ).toBeUndefined()
    if (!hidden) {
      await expect(
        cargo.getByRole('table', { name: 'Haul', exact: true }),
      ).toHaveCount(0)
      await expect(
        cargo.getByText('Potential loot', { exact: true }),
      ).toHaveCount(0)
      await expect(
        cargo.getByText('Extra space for full haul', { exact: true }),
      ).toHaveCount(0)
    }
    await dialog
      .getByRole('button', {
        name: 'Replace defender from report',
        exact: true,
      })
      .click()
    await expect(results).toHaveCount(0)
    await expect(
      dialog.getByLabel('Defender Light Fighter', { exact: true }),
    ).toHaveValue(hidden ? '0' : '12')
    await expect(
      dialog.getByLabel('Attacker Light Fighter', { exact: true }),
    ).toHaveValue('20')
    if (hidden)
      await dialog
        .getByRole('button', {
          name: 'Replace defender from current planet',
          exact: true,
        })
        .click()
    await dialog.getByRole('button', { name: 'Clear espionage report' }).click()
    await expect(
      dialog.getByRole('link', { name: /Espionage report/ }),
    ).toHaveCount(0)
    await expect(
      dialog.getByRole('region', { name: 'Attack planning', exact: true }),
    ).toHaveCount(0)

    await expect(defenderShips.locator('details')).toHaveJSProperty(
      'open',
      hidden,
    )
    if (hidden)
      await expect(
        dialog.getByLabel('Defender Light Fighter', { exact: true }),
      ).toBeVisible()
    await expect(
      dialog.getByLabel('Defender Light Fighter', { exact: true }),
    ).toHaveValue(hidden ? '0' : '12')
    await expect(
      dialog.getByLabel('Attacker Light Fighter', { exact: true }),
    ).toHaveValue('20')
    await dialog.getByRole('button', { name: 'Simulate' }).click()
    expect(
      (await page.evaluate(() => window.empireScene.simulations.at(-1)!))
        .observed_resources,
    ).toBeUndefined()
    if (hidden)
      await expect(
        results.getByRole('row', { name: /^Moon creation/ }).getByRole('cell'),
      ).toHaveText('0%')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    if (!hidden) {
      await trigger.press('Enter')
      await expect(dialog).toBeVisible()
      await expect(defenderShips.locator('details')).toHaveJSProperty(
        'open',
        false,
      )
      await expect(
        dialog.getByRole('button', {
          name: 'Replace defender from current planet',
        }),
      ).toBeVisible()
      await expect(
        dialog.getByLabel('Attacker Light Fighter', { exact: true }),
      ).toHaveValue('0')
      await expect(results).toHaveCount(0)
    }
  })
