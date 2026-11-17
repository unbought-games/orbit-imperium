import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { test, expect, type Page, type Locator } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import type { ShipAppearanceState } from '../../src/client-model/ship-appearance-types'
import type { ShipCustomizationControl } from './ship-customization.scenarios'

declare global {
  interface Window {
    shipCustomizationScene?: ShipCustomizationControl
  }
}

// Only the exact installed originals are intercepted. Unexpected API clients
// still hit the isolated fixture's blanket catcher and fail the test.
test.beforeEach(async ({ context }) => {
  for (const symbol of ['compass', 'forge-starwing']) {
    const bytes = await readFile(
      new URL(
        `../../../../crates/application/assets/insignias/${symbol}.svg`,
        import.meta.url,
      ),
    )
    const hash = createHash('sha256').update(bytes).digest('hex')
    await context.route(
      `**/api/media/insignias/${symbol}/${hash}.svg`,
      (route) => route.fulfill({ contentType: 'image/svg+xml', body: bytes }),
    )
  }
})
test.afterEach(async ({ page }) => {
  if (!page.isClosed())
    await page.evaluate(() => window.shipCustomizationScene?.dispose())
})

async function pixels(canvas: Locator) {
  return canvas.evaluate((node) => {
    const image = node as HTMLCanvasElement
    const bytes = image
      .getContext('2d')!
      .getImageData(0, 0, image.width, image.height).data
    let hash = 2166136261
    for (let i = 0; i < bytes.length; i++)
      hash = Math.imul(hash ^ bytes[i], 16777619)
    return hash >>> 0
  })
}
async function openHangar(page: Page, mount: (name: string) => Promise<void>) {
  await mount('ship-customization')
  const opener = page.getByRole('button', { name: 'Customize Light Fighter' })
  await opener.click()
  const dialog = page.getByRole('dialog', {
    name: 'Light Fighter',
    exact: true,
  })
  await expect(
    dialog.getByRole('textbox', { name: 'Design name' }),
  ).toHaveValue('First light')
  const canvas = dialog.locator('canvas')
  await expect(canvas).toHaveCSS('opacity', '1')
  return { dialog, canvas, opener }
}

// Regression: nested discard confirmation must preserve the editor and return
// keyboard focus; canceling confirmation must not replay the hangar arrival.
test('hangar traps keyboard focus, preserves dirty edits on cancel, and restores the opener', async ({
  page,
  mount,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const { dialog, canvas, opener } = await openHangar(page, mount)
  const entrance = await dialog.evaluate((node) =>
    node.getAnimations({ subtree: true }).map((animation) => ({
      name: (animation as CSSAnimation).animationName,
      duration: animation.effect?.getTiming().duration,
    })),
  )
  expect(
    entrance.some(
      (item) => item.name?.includes('ship-arrive') && item.duration === 1000,
    ),
  ).toBe(true)
  await dialog.evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    )
  })
  const back = dialog.getByRole('button', { name: 'Shipyard', exact: true })
  await expect(back).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(
    dialog.getByRole('button', { name: 'Use standard appearance' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(back).toBeFocused()
  const name = dialog.getByRole('textbox', { name: 'Design name' })
  await name.fill('Night watch')
  const originalCanvas = await canvas.elementHandle()
  await page.keyboard.press('Escape')
  const confirmation = page.getByRole('alertdialog', {
    name: 'Discard unsaved changes?',
  })
  await expect(confirmation).toBeVisible()
  await expect(
    confirmation.getByRole('button', { name: 'Keep editing' }),
  ).toBeFocused()
  await diagnosticScreenshot(page, {
    path: testInfo.outputPath('hangar-discard-desktop-1280x900.png'),
  })
  await confirmation.getByRole('button', { name: 'Keep editing' }).click()
  await expect(confirmation).toHaveCount(0)
  await expect(back).toBeFocused()
  await expect(name).toHaveValue('Night watch')
  expect(await originalCanvas!.evaluate((node) => node.isConnected)).toBe(true)
  await expect(canvas).toHaveCSS('opacity', '1')
  await page.keyboard.press('Escape')
  await confirmation.getByRole('button', { name: 'Discard and leave' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await opener.click()
  await expect(name).toHaveValue('First light')
  expect(
    await dialog.evaluate(
      (node) => node.getAnimations({ subtree: true }).length,
    ),
  ).toBe(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

// Regression: newer observations must repaint the current emblem without
// overwriting local edits; rendering must not lock out a subsequent submission.
test('hangar retains edits across emblem observations and allows another save while rendering', async ({
  page,
  mount,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const { dialog, canvas } = await openHangar(page, mount)
  const name = dialog.getByRole('textbox', { name: 'Design name' })
  const initialPixels = await pixels(canvas)
  await dialog
    .getByRole('button', { name: 'Primary: Copper', exact: true })
    .click()
  await expect.poll(() => pixels(canvas)).not.toBe(initialPixels)
  await name.fill('Copper wings')
  const beforeTreatment = await pixels(canvas)
  await dialog.getByLabel('Appearance', { exact: true }).selectOption('layers')
  await expect.poll(() => pixels(canvas)).not.toBe(beforeTreatment)
  const beforePlacement = await pixels(canvas)
  await dialog
    .getByLabel('Placement', { exact: true })
    .selectOption('near-wing')
  await expect.poll(() => pixels(canvas)).not.toBe(beforePlacement)
  // Await the preceding input's render before delivering another scenario.
  const beforeEmblem = await pixels(canvas)
  await name.focus()
  const emblemDelivery = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        '/api/media/insignias/forge-starwing/ce58d05bd105345e680f2f3d5d88aa35c2b7f4fce3eee5d4d2c521d90b827591.svg' &&
      response.ok(),
  )
  await page.evaluate(async () => {
    const scene = window.shipCustomizationScene!
    const snapshot = scene.snapshot()
    snapshot.emblem = {
      recipe: {
        version: 1,
        symbol: 'forge-starwing',
        foreground: '#44ddff',
        background: '#233f61',
      },
      asset_url:
        '/api/media/insignias/forge-starwing/ce58d05bd105345e680f2f3d5d88aa35c2b7f4fce3eee5d4d2c521d90b827591.svg',
    }
    snapshot.emblem_revision = 2
    await scene.observe(snapshot)
  })
  const deliveredEmblem = await emblemDelivery
  expect(await deliveredEmblem.finished()).toBeNull()
  await expect(name).toHaveValue('Copper wings')
  await expect(name).toBeFocused()
  await expect(
    dialog.getByRole('button', { name: 'Primary: Copper', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.getByLabel('Appearance', { exact: true })).toHaveValue(
    'layers',
  )
  await expect(dialog.getByLabel('Placement', { exact: true })).toHaveValue(
    'near-wing',
  )
  await expect.poll(() => pixels(canvas)).not.toBe(beforeEmblem)
  await diagnosticScreenshot(page, {
    path: testInfo.outputPath('hangar-live-emblem-desktop-1280x900.png'),
  })

  await dialog
    .getByRole('button', { name: 'Save and equip', exact: true })
    .click()
  await expect(
    dialog.getByRole('button', { name: 'Saving changes…' }),
  ).toBeDisabled()
  const submitted = await page.evaluate(() =>
    window.shipCustomizationScene!.pending(),
  )
  expect(submitted).toMatchObject({
    type: 'Save',
    equip: true,
    expected_equipment_revision: 1,
    design: {
      name: 'Copper wings',
      revision: 1,
      recipe: {
        primary: 'copper',
        emblem: { treatment: 'layers', placement: 'near-wing' },
      },
    },
  })
  const accepted: ShipAppearanceState = await page.evaluate(() =>
    window.shipCustomizationScene!.snapshot(),
  )
  if (submitted?.type !== 'Save') throw Error('Expected a pending Save')
  accepted.library.push({ ...submitted.design, revision: 2 })
  accepted.equipment[0] = {
    ...accepted.equipment[0],
    revision: 2,
    design_revision: 2,
    render: {
      id: '00000000-0000-4000-8000-000000000009',
      stage: 'queued',
      can_cancel: true,
      can_retry: false,
    },
  }
  await page.evaluate(
    (snapshot) => window.shipCustomizationScene!.accept(snapshot),
    accepted,
  )
  await expect(dialog.getByText('Queued', { exact: true })).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Save and equip', exact: true }),
  ).toBeEnabled()
  accepted.equipment[0].render!.stage = 'rendering'
  await page.evaluate(
    (snapshot) => window.shipCustomizationScene!.observe(snapshot),
    accepted,
  )
  await expect(dialog.getByText('Rendering', { exact: true })).toBeVisible()
  await name.fill('Second flight')
  await dialog
    .getByRole('button', { name: 'Save and equip', exact: true })
    .click()
  await expect(
    dialog.getByRole('button', { name: 'Saving changes…' }),
  ).toBeDisabled()
  expect(
    await page.evaluate(() => window.shipCustomizationScene!.pending()),
  ).toMatchObject({
    type: 'Save',
    expected_equipment_revision: 2,
    design: { name: 'Second flight', revision: 2 },
  })
  const next = await page.evaluate(() =>
    window.shipCustomizationScene!.pending(),
  )
  if (next?.type !== 'Save') throw Error('Expected second pending Save')
  accepted.library.push({ ...next.design, revision: 3 })
  accepted.equipment[0] = {
    ...accepted.equipment[0],
    revision: 3,
    design_revision: 3,
    render: {
      id: '00000000-0000-4000-8000-000000000010',
      stage: 'preparing',
      can_cancel: true,
      can_retry: false,
    },
  }
  await page.evaluate(
    (snapshot) => window.shipCustomizationScene!.accept(snapshot),
    accepted,
  )
  await expect(dialog.getByText('Preparing', { exact: true })).toBeVisible()
  accepted.equipment[0].render = {
    ...accepted.equipment[0].render!,
    stage: 'ready',
    can_cancel: false,
  }
  await page.evaluate(
    (snapshot) => window.shipCustomizationScene!.observe(snapshot),
    accepted,
  )
  await expect(dialog.getByText('Ready', { exact: true })).toBeVisible()
  await expect(name).toHaveValue('Second flight')
  await diagnosticScreenshot(page, {
    path: testInfo.outputPath('hangar-saved-desktop-1280x900.png'),
  })
})

// Regression: the full-screen mobile takeover must scroll to final controls,
// including nested confirmation, without forcing horizontal scrolling.
test('mobile hangar keeps final controls reachable without horizontal overflow', async ({
  page,
  mount,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { dialog, opener } = await openHangar(page, mount)
  await diagnosticScreenshot(page, {
    path: testInfo.outputPath('hangar-preview-mobile-390x844.png'),
  })
  expect(
    await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true)
  const save = dialog.getByRole('button', {
    name: 'Save and equip',
    exact: true,
  })
  await save.scrollIntoViewIfNeeded()
  await expect(save).toBeInViewport()
  await expect(save).toBeEnabled()
  const refresh = dialog.getByRole('button', { name: 'Refresh status' })
  await refresh.scrollIntoViewIfNeeded()
  await expect(refresh).toBeInViewport()
  await diagnosticScreenshot(page, {
    path: testInfo.outputPath('hangar-controls-mobile-390x844.png'),
  })
  await dialog
    .getByRole('textbox', { name: 'Design name' })
    .fill('Mobile flight')
  await dialog.getByRole('button', { name: 'Shipyard', exact: true }).click()
  const confirmation = page.getByRole('alertdialog', {
    name: 'Discard unsaved changes?',
  })
  await expect(confirmation).toBeInViewport()
  expect(
    await confirmation.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true)
  await confirmation.getByRole('button', { name: 'Discard and leave' }).click()
  await expect(opener).toBeFocused()
})

// Regression: a committed save with a lost response must become confirmed after
// reload, without discarding later edits or hiding another action's later error.
test('reload confirms a lost save response without losing edits or clearing a later failure', async ({
  page,
  mount,
}) => {
  const { dialog } = await openHangar(page, mount)
  const name = dialog.getByRole('textbox', { name: 'Design name' })
  const save = dialog.getByRole('button', {
    name: 'Save and equip',
    exact: true,
  })
  const alert = dialog.getByRole('alert')
  await name.fill('Recovered original')
  await save.click()
  await expect(
    dialog.getByRole('button', { name: 'Saving changes…' }),
  ).toBeDisabled()
  const committed = await page.evaluate(() => {
    const scene = window.shipCustomizationScene!
    const action = scene.pending()
    if (action?.type !== 'Save') throw Error('Expected Save')
    const snapshot = scene.snapshot()
    snapshot.library.push({ ...action.design, revision: 2 })
    snapshot.equipment[0] = {
      ...snapshot.equipment[0],
      revision: 2,
      design_revision: 2,
    }
    scene.loseResponse(snapshot)
    return snapshot
  })
  await expect(alert).toContainText('could not be confirmed')
  await expect(save).toBeEnabled()
  await name.fill('Unsaved next flight')
  await dialog
    .getByRole('button', { name: 'Primary: Copper', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Refresh status' }).click()
  await expect(alert).toHaveCount(0)
  await expect(
    dialog.getByText('“Recovered original” is saved.', { exact: false }),
  ).toBeVisible()
  await expect(name).toHaveValue('Unsaved next flight')
  await expect(
    dialog.getByRole('button', { name: 'Primary: Copper', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(
    await page.evaluate(() => window.shipCustomizationScene!.pending()),
  ).toBeNull()

  // A second uncertain save later recovers, but its confirmation must not erase
  // the intervening Reset error. The observation still advances the draft token.
  await save.click()
  await expect(
    dialog.getByRole('button', { name: 'Saving changes…' }),
  ).toBeDisabled()
  const next = await page.evaluate(() =>
    window.shipCustomizationScene!.pending(),
  )
  expect(next).toMatchObject({
    type: 'Save',
    design: {
      revision: 2,
      name: 'Unsaved next flight',
      recipe: { primary: 'copper' },
    },
  })
  if (next?.type !== 'Save') throw Error('Expected second Save')
  committed.library.push({ ...next.design, revision: 3 })
  committed.equipment[0] = {
    ...committed.equipment[0],
    revision: 3,
    design_revision: 3,
  }
  await page.evaluate(
    (snapshot) => window.shipCustomizationScene!.loseResponse(snapshot),
    committed,
  )
  await expect(alert).toContainText('could not be confirmed')
  await dialog.getByRole('button', { name: 'Use standard appearance' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.shipCustomizationScene!.pending()?.type),
    )
    .toBe('Reset')
  await page.evaluate(() => window.shipCustomizationScene!.reject())
  await expect(alert).toContainText('could not be confirmed')
  await expect(save).toBeEnabled()
  await page.evaluate(
    (snapshot) => window.shipCustomizationScene!.observe(snapshot),
    committed,
  )
  await expect(name).toHaveValue('Unsaved next flight')
  await expect(dialog.getByLabel('Saved designs')).toHaveValue(
    `${next.design.id}:3`,
  )
  await expect(alert).toContainText('could not be confirmed')
  await expect(
    dialog.getByText('“Unsaved next flight” is saved.', { exact: false }),
  ).toHaveCount(0)
})
