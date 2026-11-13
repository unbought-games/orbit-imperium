import { test, expect } from './fixture'

test('arrow shortcuts share button bounds, current coordinates and unmount cleanup', async ({
  page,
  mount,
}) => {
  await mount('galaxy-navigation')
  const destination = page.getByLabel('Destination', { exact: true })
  const previous = page.getByRole('button', { name: 'Previous system' })
  const next = page.getByRole('button', { name: 'Next system' })
  const toggle = page.getByRole('button', { name: 'Toggle navigation' })
  await toggle.focus()
  await page.keyboard.press('ArrowRight')
  await expect(destination).toHaveText('2:3')
  await expect(next).toBeDisabled()
  await page.keyboard.press('ArrowRight')
  await expect(destination).toHaveText('2:3')
  await page.keyboard.press('ArrowLeft')
  await expect(destination).toHaveText('2:2')
  await page.keyboard.press('ArrowLeft')
  await expect(destination).toHaveText('2:1')
  await expect(previous).toBeDisabled()
  await page.keyboard.press('ArrowLeft')
  await expect(destination).toHaveText('2:1')
  await next.click()
  await expect(destination).toHaveText('2:2')
  await page.getByRole('textbox', { name: 'Galaxy', exact: true }).fill('3')
  await page.getByRole('textbox', { name: 'Solar system' }).fill('1')
  await next.focus()
  await page.keyboard.press('ArrowRight')
  await expect(destination).toHaveText('2:3')
  await expect(
    page.getByRole('textbox', { name: 'Galaxy', exact: true }),
  ).toHaveValue('2')
  await expect(page.getByRole('textbox', { name: 'Solar system' })).toHaveValue(
    '3',
  )
  await toggle.click()
  await page.keyboard.press('ArrowLeft')
  await expect(destination).toHaveText('2:3')
})

test('arrow shortcuts leave editing, modifiers, menus and dialog focus alone', async ({
  page,
  mount,
}) => {
  await mount('galaxy-navigation')
  const destination = page.getByLabel('Destination', { exact: true })
  for (const control of [
    page.getByRole('textbox', { name: 'Galaxy', exact: true }),
    page.getByRole('textbox', { name: 'Solar system' }),
    page.getByRole('textbox', { name: 'Message' }),
    page.getByLabel('Editor'),
    page.getByRole('button', { name: 'Dialog action' }),
    page.getByRole('menuitem', { name: 'Menu action' }),
    page.getByRole('button', { name: 'Own keyboard handler' }),
  ]) {
    await control.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(destination).toHaveText('2:2')
    await page.keyboard.press('ArrowRight')
    await expect(destination).toHaveText('2:2')
  }
  const message = page.getByRole('textbox', { name: 'Message' })
  await message.focus()
  await message.press('End')
  await message.press('ArrowLeft')
  expect(
    await message.evaluate((el: HTMLTextAreaElement) => el.selectionStart),
  ).toBe(4)
  await page.getByRole('button', { name: 'Next system' }).focus()
  for (const modifier of ['Shift', 'Control', 'Alt', 'Meta']) {
    await page.keyboard.press(`${modifier}+ArrowRight`)
    await expect(destination).toHaveText('2:2')
  }
  await page.keyboard.press('ArrowRight')
  await expect(destination).toHaveText('2:3')
})

test('holding an arrow browses once until the key is released and pressed again', async ({
  page,
  mount,
}) => {
  await mount('galaxy-navigation')
  const destination = page.getByLabel('Destination', { exact: true })
  await page.getByRole('button', { name: 'Toggle navigation' }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(destination).toHaveText('2:1')
  await page.keyboard.down('ArrowRight')
  await expect(destination).toHaveText('2:2')
  // Playwright marks subsequent downs of a held key as repeat events.
  await page.keyboard.down('ArrowRight')
  await page.keyboard.down('ArrowRight')
  await expect(destination).toHaveText('2:2')
  await page.keyboard.up('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(destination).toHaveText('2:3')
  await page.keyboard.down('ArrowLeft')
  await expect(destination).toHaveText('2:2')
  await page.keyboard.down('ArrowLeft')
  await expect(destination).toHaveText('2:2')
  await page.keyboard.up('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(destination).toHaveText('2:1')
})
