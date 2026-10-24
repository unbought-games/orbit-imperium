import { test, expect, type Locator } from './fixtures/test'
import { body, shellFixture } from './fixtures/game'

async function expectSelected(input: Locator) {
  await expect(input).toBeFocused()
  await expect
    .poll(() =>
      input.evaluate((element: HTMLInputElement) => [
        element.selectionStart,
        element.selectionEnd,
        element.value.length,
      ]),
    )
    .toEqual([
      0,
      (await input.inputValue()).length,
      (await input.inputValue()).length,
    ])
}

for (const interaction of ['click', 'tap'] as const) {
  test.describe(interaction, () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

    for (const screen of [
      'dispatch',
      'transport',
      'shipyard',
      'defense',
    ] as const) {
      test(`${screen} numbers are replaced after ${interaction} and refocus`, async ({
        page,
      }) => {
        if (screen === 'shipyard' || screen === 'defense') {
          await page.goto(
            `/detail-playground?scene=${screen === 'shipyard' ? 'ship-ready' : 'defense-queued'}`,
          )
        } else {
          await shellFixture(page, {
            protocol: screen === 'dispatch' ? 4 : 2,
            extraCapabilities: ['Transport'],
            catalog: [
              {
                key: { kind: 'Ship', id: 'SmallCargo' },
                requirements: [],
                enabled: true,
                mobile: true,
                body_kinds: ['Planet'],
              },
            ],
          })
          await page.goto(
            `/u/andromeda/b/${body.id}/${screen === 'dispatch' ? 'dispatch' : 'fleets'}`,
          )
        }

        const inputs = page.locator('input[inputmode="numeric"]')
        await expect(inputs).toHaveCount(
          screen === 'dispatch' ? 7 : screen === 'transport' ? 4 : 1,
        )
        for (const input of await inputs.all()) {
          // Actual typing must replace both the initial value (including zero)
          // and a previously edited value. fill() would hide selection bugs.
          for (const value of ['5', '12']) {
            await input.evaluate((element: HTMLInputElement) => element.blur())
            await input[interaction]()
            await expectSelected(input)
            await page.keyboard.type(value)
            await expect(input).toHaveValue(value)
          }
          // While already editing, normal caret navigation still works.
          await page.keyboard.press('ArrowLeft')
          await page.keyboard.type('3')
          await expect(input).toHaveValue('132')
          await input.click()
          await expect
            .poll(() =>
              input.evaluate(
                (element: HTMLInputElement) =>
                  element.selectionStart === element.selectionEnd,
              ),
            )
            .toBe(true)
        }
      })
    }
  })
}

test('tabbing into coordinates selects their values and typing stays editable', async ({
  page,
}) => {
  await shellFixture(page, { protocol: 4 })
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  const galaxy = page.getByLabel('Galaxy', { exact: true })
  const system = page.getByLabel('System', { exact: true })
  const position = page.getByLabel('Position', { exact: true })
  await galaxy.click()
  await page.keyboard.press('Tab')
  await expectSelected(system)
  await page.keyboard.type('45')
  await expect(system).toHaveValue('45')
  await page.keyboard.press('Tab')
  await expectSelected(position)
  await page.keyboard.type('5')
  await expect(position).toHaveValue('5')
  await page.keyboard.press('Shift+Tab')
  await expectSelected(system)
  await page.keyboard.type('9')
  await expect(system).toHaveValue('9')
})
