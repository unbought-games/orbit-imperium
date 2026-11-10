import { test, expect } from './fixture'

for (const interaction of ['click', 'tap'] as const) {
  test.describe(interaction, () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
    test(`numeric input replaces selected text, preserves editing and submits after ${interaction}`, async ({
      page,
      mount,
    }) => {
      await mount('number-form')
      const input = page.getByRole('textbox', { name: 'Quantity' })
      await expect(input).toHaveAttribute('inputmode', 'numeric')
      for (const value of ['5', '12']) {
        await page.getByRole('button', { name: 'Submit order' }).focus()
        await input[interaction]()
        await expect(input).toBeFocused()
        await expect
          .poll(() =>
            input.evaluate((el: HTMLInputElement) => [
              el.selectionStart,
              el.selectionEnd,
              el.value.length,
            ]),
          )
          .toEqual([
            0,
            (await input.inputValue()).length,
            (await input.inputValue()).length,
          ])
        await page.keyboard.type(value)
        await expect(input).toHaveValue(value)
      }
      await input.press('ArrowLeft')
      await page.keyboard.type('3')
      await expect(input).toHaveValue('132')
      await input.click()
      await expect
        .poll(() =>
          input.evaluate(
            (el: HTMLInputElement) => el.selectionStart === el.selectionEnd,
          ),
        )
        .toBe(true)
      await input.press('Enter')
      await expect(page.getByLabel('Submitted quantity')).toHaveText('132')
    })
  })
}
