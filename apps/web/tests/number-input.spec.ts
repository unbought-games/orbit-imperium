import { test, expect, type Locator } from './fixtures/test'

import { refuseFixtureReads, body, installGameFixture } from './fixtures/game'

import { withBootstrapResponse } from './fixtures/responses'

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

// NumberInput's mouse/touch selection permutations live in components/form.spec.ts.
// Keep one application assertion that Dispatch actually wires those controls.
test('dispatch numbers are replaced after click and refocus', async ({
  page,
}) => {
  refuseFixtureReads(page, { world: ['Galaxy', 'ResolveDestination'] })
  await installGameFixture(page, {
    protocol: 4,
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
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/dispatch`),
  )
  const inputs = page.locator(
    'input[inputmode="numeric"]:not([data-coordinate-input])',
  )
  await expect(inputs).toHaveCount(4)
  for (const input of await inputs.all()) {
    for (const value of ['5', '12']) {
      await input.evaluate((element: HTMLInputElement) => element.blur())
      await input.click()
      await expectSelected(input)
      await page.keyboard.type(value)
      await expect(input).toHaveValue(value)
    }
  }
})
