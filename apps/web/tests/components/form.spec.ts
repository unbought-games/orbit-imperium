import { test, expect, type Locator } from './fixture'

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

test('coordinates are one tab stop with colon and space advancement', async ({
  page,
  mount,
}) => {
  await mount('coordinate-form')
  const input = page.getByLabel('Destination coordinates', { exact: true })
  await input.fill('')
  await input.pressSequentially('1:45 5')
  await expect(input).toHaveValue('1:45:5')
  await input.press('Tab')
  await expect(
    page.getByRole('textbox', { name: 'Metal', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(input).toBeFocused()
  await input.press('ArrowRight')
  await input.press('Backspace')
  await input.pressSequentially('9')
  await expect(input).toHaveValue('1:45:9')
})

test('coordinate input offers a numeric keyboard and a touch separator control', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('coordinate-form')
  const input = page.getByLabel('Destination coordinates', { exact: true })
  await expect(input).toHaveAttribute('inputmode', 'numeric')
  await input.fill('1')
  await page.getByRole('button', { name: 'Next coordinate segment' }).click()
  await input.pressSequentially('45')
  await page.getByRole('button', { name: 'Next coordinate segment' }).click()
  await input.pressSequentially('8')
  await expect(input).toHaveValue('1:45:8')
})

test.describe('scheduled completion date', () => {
  test.use({ timezoneId: 'UTC', locale: 'en-US' })
  test('completion details include day, year and semantic time across midnight', async ({
    page,
    mount,
  }) => {
    await page.clock.pauseAt(new Date('2026-12-31T12:00:00Z'))
    await mount('completion-details')
    await page
      .getByRole('button', { name: 'Completion time details', exact: true })
      .click()
    const details = page.getByRole('dialog', {
      name: 'Completion time',
      exact: true,
    })
    await expect(details).toContainText('Jan 2, 2027')
    await expect(details).toContainText('6:00 PM')
    await expect(details.locator('time')).toHaveAttribute(
      'datetime',
      '2027-01-02T18:00:00.000Z',
    )
  })
})

test.describe('numeric field paste', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  async function paste(input: Locator, text: string) {
    await input.focus()
    await input
      .page()
      .evaluate((value) => navigator.clipboard.writeText(value), text)
    await input.press('ControlOrMeta+v')
  }

  test('quantity paste removes commas and preserves selection and caret editing', async ({
    page,
    mount,
  }) => {
    await mount('number-form')
    const input = page.getByRole('textbox', { name: 'Quantity' })
    const submitted = page.getByLabel('Submitted quantity')
    await paste(input, '12,50')
    await input.press('Enter')
    await expect(submitted).toHaveText('1250')
    await input.press('ControlOrMeta+a')
    await paste(input, '1,2,3.5')
    await input.press('Enter')
    await expect(submitted).toHaveText('123.5')
    await input.fill('456')
    await input.press('ArrowLeft')
    await input.press('Shift+ArrowLeft')
    await paste(input, '12,500')
    await input.press('Enter')
    await expect(submitted).toHaveText('4125006')
    await input.press('7')
    await input.press('Enter')
    await expect(submitted).toHaveText('41250076')
  })

  test('galaxy navigation rejects grouping commas in both coordinate fields', async ({
    page,
    mount,
  }) => {
    await mount('galaxy-navigation')
    const fields = ['Galaxy', 'Solar system'].map((name) =>
      page.getByRole('textbox', { name, exact: true }),
    )
    for (const field of fields) {
      await paste(field, '0,003')
      await expect(field).toHaveValue('0,003')
    }
    await page.getByRole('button', { name: 'Go', exact: true }).click()
    for (const field of fields)
      await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Destination', { exact: true })).toHaveText(
      '2:2',
    )
  })
})
