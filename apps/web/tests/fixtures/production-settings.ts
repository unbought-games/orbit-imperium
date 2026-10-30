import { expect, type Page } from '@playwright/test'
import { menuDestination } from './navigation'

export async function openProductionSettings(page: Page) {
  await (await menuDestination(page, 'Resource settings')).click()
  await expect(
    page.getByRole('region', { name: 'Production controls' }),
  ).toBeVisible()
}

/** Inject slider movement for transport/reconciliation fixtures; native pointer
 * and keyboard interactions are exercised separately in resources.spec.ts. */
export async function moveProductionSlider(page: Page, name: string, value: string) {
  await page.getByRole('slider', { name }).evaluate((element, next) => {
    const input = element as HTMLInputElement
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}
