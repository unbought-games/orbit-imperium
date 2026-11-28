import { test, expect } from './fixture'
import { captureVacation as capture } from '../fixtures/vacation-capture'

test('capture only dismisses replacement notifications when evidence is enabled', async ({
  page,
}) => {
  await page.setContent(
    '<main><output aria-label="Dismissed notifications">0</output></main>',
  )
  await page.evaluate(() => {
    let dismissed = 0
    function addToast(replace: boolean) {
      const toast = document.createElement('div')
      toast.dataset.testid = 'swipeable-toast'
      const button = document.createElement('button')
      button.textContent = replace
        ? 'First notification'
        : 'Replacement notification'
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return
        toast.remove()
        document.querySelector('output')!.textContent = String(++dismissed)
        if (replace) addToast(false)
      })
      toast.append(button)
      document.querySelector('main')!.append(toast)
    }
    addToast(true)
  })
  const original = process.env.ORBIT_TEST_SCREENSHOTS
  try {
    delete process.env.ORBIT_TEST_SCREENSHOTS
    await capture(page, page, {
      path: 'test-results/vacation-capture-helper.png',
    })
    await expect(page.getByTestId('swipeable-toast')).toHaveCount(1)
    await expect(page.getByLabel('Dismissed notifications')).toHaveText('0')
    process.env.ORBIT_TEST_SCREENSHOTS = '1'
    await capture(page, page, {
      path: 'test-results/vacation-capture-helper.png',
    })
    await expect(page.getByTestId('swipeable-toast')).toHaveCount(0)
    await expect(page.getByLabel('Dismissed notifications')).toHaveText('2')
  } finally {
    if (original === undefined) delete process.env.ORBIT_TEST_SCREENSHOTS
    else process.env.ORBIT_TEST_SCREENSHOTS = original
  }
})
