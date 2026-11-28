import { test, expect, type Locator } from './fixture'
import { refreshDispatch, setup } from './dispatch-driver'

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

// Ship quantities and cargo inputs share NumberInput but have independent callers.
test('all four Dispatch quantities select their entire value on repeated native focus', async ({
  page,
  mount,
}) => {
  const state = await setup(page, mount)
  const origin = state.bodies[0]
  origin.inventories = origin.inventories.filter(
    (stack) => stack.item.id === 'SmallCargo',
  )
  await refreshDispatch(page)
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
