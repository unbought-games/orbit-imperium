import { test, expect } from './fixture'
import { body } from '../../src/test-support/empire'

test.describe('tablet resource bar', () => {
  test.use({ hasTouch: true, viewport: { width: 768, height: 900 } })
  test('brand and resource targets fit their row and stay independently operable', async ({
    page,
    mount,
  }) => {
    await mount('shell-default')
    const brand = page.getByRole('link', {
      name: 'ORBIT IMPERIUM',
      exact: true,
    })
    const bounds = (await brand.boundingBox())!
    expect(bounds.width).toBeGreaterThanOrEqual(44)
    expect(bounds.height).toBeGreaterThanOrEqual(44)
    const resources = page.getByLabel('Current resources')
    const controls = resources
      .getByRole('button')
      .or(resources.getByRole('link'))
    const boxes = await controls.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      }),
    )
    expect(boxes).toHaveLength(4)
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right)
    for (const control of await controls.all()) {
      expect(
        await control.evaluate((el) => {
          const box = el.getBoundingClientRect()
          return [...el.querySelectorAll('svg, strong')].every((child) => {
            const bounds = child.getBoundingClientRect()
            return bounds.left >= box.left && bounds.right <= box.right
          })
        }),
      ).toBe(true)
    }
    await expect(resources.getByRole('button')).toHaveCount(3)
    for (const button of await resources.getByRole('button').all()) {
      await button.tap()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
    }
    await expect(
      resources.getByRole('link', {
        name: 'Energy — resource settings',
        exact: true,
      }),
    ).toHaveAttribute('href', /\/resource-settings$/)
  })
})

test('failed Empire body images become inert while dossier navigation stays available', async ({
  page,
  mount,
}) => {
  // The original idle Empire has no order thumbnails. This exercises the
  // world illustrations and their own error handlers.
  await page.addInitScript(() => {
    window.empireInput = {
      constructions: [],
      manufacturing: [],
      researchOperation: null,
      missions: {
        fleets: [],
        incoming: [],
        score_value_micro: '0',
        fleet_slots: '1',
      },
    }
  })
  await page.route('**/art/**', (route) => route.abort())
  await mount('empire')
  await expect(
    page.getByRole('article', {
      name: 'Planet [1:371:4] dossier',
      exact: true,
    }),
  ).toBeVisible()
  const art = page.locator('img[src*="/art/"]')
  await expect.poll(() => art.count()).toBeGreaterThan(0)
  await art.evaluateAll((images) =>
    images.forEach((image) => image.setAttribute('loading', 'eager')),
  )
  await expect
    .poll(() =>
      art.evaluateAll((images) =>
        images.every(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            !image.naturalWidth &&
            (getComputedStyle(image).opacity === '0' ||
              getComputedStyle(image).visibility === 'hidden'),
        ),
      ),
    )
    .toBe(true)
  const dossier = page.getByRole('article', {
    name: 'Planet [1:371:4] dossier',
    exact: true,
  })
  await expect(
    dossier.getByRole('link', { name: 'Resources', exact: true }),
  ).toHaveAttribute('href', new RegExp('/b/' + body.id + '/resources$'))
})

test('another dossier links its coordinates using the selected funding body', async ({
  page,
  mount,
}) => {
  await mount('empire')
  const dossier = page.getByRole('article', {
    name: 'Planet [1:380:8] dossier',
    exact: true,
  })
  const link = dossier.getByRole('link', {
    name: 'View [1:380:8] in galaxy',
    exact: true,
  })
  await expect(link).toHaveAttribute(
    'href',
    '/u/andromeda/b/' + body.id + '/galaxy?galaxy=1&system=380&position=8',
  )
  await link.click()
  await expect(page.getByLabel('Scene destination')).toHaveText(
    '/u/andromeda/b/' + body.id + '/galaxy?galaxy=1&system=380&position=8',
  )
})
