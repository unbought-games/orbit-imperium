import { id } from '../../src/test-support/bootstrap'
import { test, expect, type Page } from './fixture'
import { mountHud } from './mount-hud'
import { body } from '../../src/test-support/empire'
import { routeTarget } from '../../src/shell/route-target'

const articles = (page: Page) => page.getByRole('article')
const more = (page: Page) =>
  page.getByRole('button', { name: 'More report actions' })
async function openCleanup(page: Page) {
  await more(page).click()
  await page.getByRole('menuitem', { name: 'Archive…', exact: true }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Archive reports',
    exact: true,
  })
  await expect(dialog).toBeVisible()
  return dialog
}

async function setStatus(page: Page, value: string) {
  await page
    .getByRole('button', { name: 'Filter reports', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Filter reports' })
  await dialog.getByRole('combobox', { name: 'Status' }).selectOption(value)
  await dialog.getByRole('button', { name: /Dismiss (sheet|popover)/ }).click()
  await expect(dialog).toBeHidden()
}

for (const width of [390, 1280]) {
  test(`native filter pickers keep their panel in place and return focus at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mount('report-triage')
    const rows = articles(page)
    await expect(rows).toHaveCount(5)
    const tools = page.getByRole('group', { name: 'Report tools' })
    const original = await tools.elementHandle()
    await expect(tools.getByRole('button')).toHaveCount(3)
    await expect(rows.getByRole('checkbox')).toHaveCount(width === 390 ? 0 : 5)
    await expect(page.getByText('Known sort values only')).toHaveCount(0)
    await tools
      .getByRole('button', { name: 'Sort reports', exact: true })
      .click()
    await expect(page.getByRole('menuitemradio')).toHaveCount(5)
    await page
      .getByRole('menuitemradio', { name: 'Oldest first', exact: true })
      .click()
    await expect(page.getByRole('menu', { name: 'Sort reports' })).toBeHidden()
    await expect(rows.first()).toContainText('Fleet Returned')
    await expect(rows.first()).toContainText('10 days ago')
    const trigger = tools.getByRole('button', { name: 'Filter reports' })
    await trigger.click()
    const filter = page.getByRole('dialog', { name: 'Filter reports' })
    const panel =
      width === 390
        ? filter.getByRole('region', { name: 'Filter reports sheet' })
        : filter
    if (width === 1280)
      await expect(
        filter.getByRole('button', { name: 'Dismiss popover' }),
      ).toBeFocused()
    const initial = await panel.boundingBox()
    for (const name of ['Report type', 'Status']) {
      const select = filter.getByRole('combobox', { name, exact: true })
      await select.focus()
      await expect(select).toBeFocused()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
      expect(await panel.boundingBox()).toEqual(initial)
    }
    await filter
      .getByRole('combobox', { name: 'Report type' })
      .selectOption('Espionage')
    await filter
      .getByRole('combobox', { name: 'Status' })
      .selectOption('unread')
    expect(await panel.boundingBox()).toEqual(initial)
    await filter
      .getByRole('button', { name: /Dismiss (sheet|popover)/ })
      .click()
    await expect(filter).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Espionage')
    const chips = page.getByRole('group', { name: 'Active report filters' })
    await expect(chips.getByRole('button')).toHaveCount(2)
    await chips.getByRole('button', { name: 'Remove unread filter' }).click()
    await expect(rows).toHaveCount(2)
    await chips.getByRole('button', { name: 'Remove Espionage filter' }).click()
    await expect(rows).toHaveCount(5)
    if (width === 390) {
      await more(page).click()
      await page
        .getByRole('menuitem', { name: 'Select reports', exact: true })
        .click()
    }
    const protectedBox = rows
      .filter({ has: page.locator(`a[href$="/${id(74)}"]`) })
      .getByRole('checkbox')
    if (width === 390) await expect(protectedBox).toBeDisabled()
    else await expect(protectedBox).toBeEnabled()
    const bar = page.getByRole('group', { name: 'Report selection' })
    await expect(bar).toContainText('0 selected')
    await expect(
      bar.getByRole('button', { name: /Archive selected/ }),
    ).toHaveCount(0)
    await bar
      .getByRole('button', {
        name: `Select loaded reports (${width === 390 ? 4 : 5})`,
      })
      .click()
    await expect(bar).toContainText(width === 390 ? '4 selected' : '5 selected')
    await expect(
      bar.getByRole('button', { name: 'Archive selected (4)' }),
    ).toBeEnabled()
    await bar.getByRole('button', { name: 'Cancel selection' }).click()
    if (width === 390) await expect(bar).toBeHidden()
    else await expect(bar).toContainText('0 selected')
    expect(await original!.evaluate((el) => el.isConnected)).toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  })
}

test('changing filters clears selection and rejecting the bulk command restores its rows and checkboxes', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mount('report-triage')
  const rows = articles(page)
  await expect(rows).toHaveCount(5)
  await page.getByRole('button', { name: 'Select loaded reports (5)' }).click()
  await setStatus(page, 'unread')
  await expect(rows).toHaveCount(2)
  const bar = page.getByRole('group', { name: 'Report selection' })
  await expect(bar).toContainText('0 selected')
  await expect(
    bar.getByRole('button', { name: /Archive selected/ }),
  ).toHaveCount(0)
  await bar.getByRole('button', { name: 'Select loaded reports (2)' }).click()
  await page.evaluate(() => {
    window.reportTriage.port.submit = async (envelope) => {
      await new Promise<void>((resolve) => {
        window.releaseReportPort = resolve
      })
      return {
        protocol: 4,
        binding: envelope.binding,
        command_id: envelope.command_id,
        admitted_at: 1,
        executed_at: 1,
        status: 'Rejected',
        code: 'NotFound',
      }
    }
  })
  try {
    await bar.getByRole('button', { name: 'Archive selected (2)' }).click()
    await expect(rows).toHaveCount(0)
    await expect(
      page.getByRole('status').filter({ hasText: 'Archiving reports…' }),
    ).toBeVisible()
  } finally {
    await page.evaluate(() => window.releaseReportPort?.())
  }
  await expect(page.getByTestId('game-error-banner')).toContainText(
    'Action rejected: Not Found',
  )
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).getByRole('checkbox')).toBeChecked()
  await expect(rows.nth(1).getByRole('checkbox')).toBeChecked()
  await expect(
    bar.getByRole('button', { name: 'Archive selected (2)' }),
  ).toBeEnabled()
})

test('archive review retains the custom age across a breakpoint and archives unstarred reports outside the filter', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount('report-triage')
  const rows = articles(page)
  await expect(rows).toHaveCount(5)
  await setStatus(page, 'starred')
  await expect(rows).toHaveCount(1)
  const dialog = await openCleanup(page)
  await expect(dialog).toContainText('Entire Inbox · Starred reports stay.')
  await expect(
    dialog.getByRole('button', { name: 'Archive 1 report', exact: true }),
  ).toBeEnabled()
  await dialog
    .getByRole('combobox', { name: 'Older than' })
    .selectOption('custom')
  const hours = dialog.getByRole('spinbutton', { name: 'Hours' })
  await hours.fill('-1')
  await expect(
    dialog.getByRole('button', { name: 'Archive 0 reports', exact: true }),
  ).toBeDisabled()
  const all = dialog.getByRole('button', {
    name: 'Archive all (4)',
    exact: true,
  })
  await expect(all).toBeEnabled()
  await hours.fill('48')
  await expect(
    dialog.getByRole('button', { name: 'Archive 1 report', exact: true }),
  ).toBeEnabled()
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(
    dialog.getByRole('button', { name: 'Dismiss popover' }),
  ).toBeVisible()
  await expect(hours).toHaveValue('48')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(more(page)).toBeFocused()
  expect(
    await page.evaluate(() => window.reportTriage.submissions.length),
  ).toBe(0)
  await openCleanup(page)
  await all.click()
  await expect(
    dialog.getByRole('button', { name: 'Archive all (0)', exact: true }),
  ).toBeDisabled()
  await expect(rows).toHaveCount(1)
  expect(
    await page.evaluate(() => window.reportTriage.headers.map((r) => r.hidden)),
  ).toEqual([true, true, true, true, false, true])
})

test('archive review waits for the final page and keeps its confirm control usable after refusal', async ({
  page,
  mount,
}) => {
  await mount('report-triage')
  await expect(articles(page)).toHaveCount(5)
  await page.evaluate(() => {
    window.reportPageSize = 2
    const { port } = window.reportTriage
    const reports = port.reports!
    const gate = new Promise<void>((resolve) => {
      window.releaseReportPort = resolve
    })
    port.reports = async (...args) => {
      if (args[1]) await gate
      return reports(...args)
    }
    const submit = port.submit
    port.submit = async (envelope) => {
      port.submit = submit
      return {
        protocol: 4,
        binding: envelope.binding,
        command_id: envelope.command_id,
        admitted_at: 1,
        executed_at: 1,
        status: 'Rejected',
        code: 'NotFound',
      }
    }
  })
  const dialog = await openCleanup(page)
  try {
    await expect(
      dialog.getByRole('button', { name: 'Loading reports…' }),
    ).toBeDisabled()
    expect(
      await page.evaluate(() => window.reportTriage.submissions.length),
    ).toBe(0)
  } finally {
    await page.evaluate(() => window.releaseReportPort?.())
  }
  const all = dialog.getByRole('button', { name: 'Archive all (4)' })
  await all.click()
  await expect(dialog.getByRole('alert')).toContainText('Cleanup stopped.')
  await expect(articles(page)).toHaveCount(5)
  await expect(all).toBeEnabled()
  await all.click()
  await expect(articles(page)).toHaveCount(1)
  await expect(
    dialog.getByRole('button', { name: 'Archive all (0)' }),
  ).toBeDisabled()
})

test('folder switch holds focus while archived history loads and bulk restoration empties the folder', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await mount('report-triage')
  const rows = articles(page)
  await expect(rows).toHaveCount(5)
  const folders = page.getByRole('group', { name: 'Report folder' })
  const archived = folders.getByRole('button', {
    name: 'Archived',
    exact: true,
  })
  const originalFolder = await folders.elementHandle()
  const originalMore = await more(page).elementHandle()
  await page.evaluate(() => {
    const { port } = window.reportTriage
    const reports = port.reports!
    const gate = new Promise<void>((resolve) => {
      window.releaseReportPort = resolve
    })
    port.reports = async (...args) => {
      if (args[3]?.filter.hidden) await gate
      return reports(...args)
    }
  })
  await archived.focus()
  try {
    await archived.press('Space')
    await expect(page.getByText('Loading report history…')).toBeVisible()
    await expect(rows).toHaveCount(0)
    await expect(
      page.getByRole('region', { name: 'No reports to show.', exact: true }),
    ).toHaveCount(0)
    await expect(archived).toBeFocused()
  } finally {
    await page.evaluate(() => window.releaseReportPort?.())
  }
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Archived')
  await expect(archived).toHaveAttribute('aria-pressed', 'true')
  await expect(
    folders.getByRole('button', { name: 'Inbox', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(archived).toBeFocused()
  expect(await originalFolder!.evaluate((el) => el.isConnected)).toBe(true)
  expect(await originalMore!.evaluate((el) => el.isConnected)).toBe(true)
  const plate = folders.locator('[data-segment-selection]')
  await expect
    .poll(() =>
      plate.evaluate((el) => {
        const selected = el.getBoundingClientRect(),
          button = el.parentElement!.getBoundingClientRect()
        return Math.max(
          Math.abs(selected.x - button.x),
          Math.abs(selected.width - button.width),
        )
      }),
    )
    .toBeLessThanOrEqual(1)
  await more(page).click()
  await page.getByRole('menuitem', { name: 'Select reports' }).click()
  await rows.getByRole('checkbox').check()
  await page
    .getByRole('button', { name: 'Move to inbox (1)', exact: true })
    .click()
  const empty = page.getByRole('region', {
    name: 'No reports to show.',
    exact: true,
  })
  await expect(empty).toContainText(
    'Reports you archive appear here. Use Move to inbox to restore them.',
  )
  await expect(empty).toHaveCSS('border-top-style', 'none')
  await expect(empty).toHaveCSS('border-bottom-style', 'none')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await folders.getByRole('button', { name: 'Inbox', exact: true }).click()
  await expect(rows).toHaveCount(6)
  await archived.click()
  await expect(rows).toHaveCount(0)
  await expect(plate).toHaveCSS('transform', 'none')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('custom archive age persists after a document reload without submitting cleanup', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await mount('report-triage')
  await expect(articles(page)).toHaveCount(5)
  const review = await openCleanup(page)
  const preset = review.getByRole('combobox', { name: 'Older than' })
  await preset.selectOption('24')
  await page.keyboard.press('Escape')
  await expect(review).toBeHidden()
  await openCleanup(page)
  await expect(preset).toHaveValue('24')
  await preset.selectOption('custom')
  await review.getByRole('spinbutton', { name: 'Hours' }).fill('36.5')
  await page.keyboard.press('Escape')
  await expect(review).toBeHidden()
  expect(
    await page.evaluate(() => window.reportTriage.submissions.length),
  ).toBe(0)
  await mount('report-triage')
  await expect(articles(page)).toHaveCount(5)
  await openCleanup(page)
  await expect(preset).toHaveValue('custom')
  await expect(review.getByRole('spinbutton', { name: 'Hours' })).toHaveValue(
    '36.5',
  )
  expect(
    await page.evaluate(() => window.reportTriage.submissions.length),
  ).toBe(0)
})

test('Mark shown as read reports refusal and submits only the filtered rows of the current folder', async ({
  page,
  mount,
}) => {
  await mount('report-triage')
  const rows = articles(page)
  await expect(rows).toHaveCount(5)
  await page.evaluate(async () => {
    const scene = window.reportTriage
    scene.headers[4].read = false
    scene.headers[5].starred = true
    scene.view.viewer_revision = '2'
    await scene.model.refresh('2')
  })
  await setStatus(page, 'starred')
  await expect(rows).toHaveCount(1)
  const mark = async () => {
    await more(page).click()
    await page.getByRole('menuitem', { name: 'Mark shown as read' }).click()
  }
  const indicator = page.getByText('Marking shown reports as read…', {
    exact: true,
  })
  const success = page.getByText('Shown reports marked as read.', {
    exact: true,
  })
  await page.evaluate(() => {
    const port = window.reportTriage.port
    const mark = port.markReportsRead!
    port.markReportsRead = async () => {
      port.markReportsRead = async (...args) => {
        await new Promise<void>((resolve) => {
          window.releaseReportPort = resolve
        })
        port.markReportsRead = mark
        return mark(...args)
      }
      throw Error('Read unavailable')
    }
  })
  await mark()
  await expect(page.getByRole('alert')).toContainText(
    'Could not confirm the read change.',
  )
  await expect(rows).toHaveCount(1)
  try {
    await mark()
    await expect(indicator).toBeVisible()
    await expect(more(page)).toBeDisabled()
    await expect(rows).toHaveCount(1)
  } finally {
    await page.evaluate(() => window.releaseReportPort?.())
  }
  await expect(rows).toHaveCount(1)
  await expect(more(page)).toBeEnabled()
  await expect(success).toBeHidden()
  expect(
    await page.evaluate(() =>
      window.reportTriage.headers.map((row) => row.read),
    ),
  ).toEqual([false, false, true, true, true, false])
  await page.getByRole('button', { name: 'Archived', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Archived')
  await mark()
  await expect(rows).toHaveCount(1)
  await expect(more(page)).toBeEnabled()
  await expect(success).toBeHidden()
  expect(
    await page.evaluate(() =>
      window.reportTriage.headers.map((row) => row.read),
    ),
  ).toEqual([false, false, true, true, true, true])
  expect(await page.evaluate(() => window.reportTriage.readBatches)).toEqual([
    [id(74)],
    [id(75)],
  ])
})

// Stream 06 owns pagination and the observer. This covers only the desktop
// actions formerly observed inside the bulk-read report application journey.
test('desktop HUD report actions fit before the first item and allow keyboard focus', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mountHud(page, mount, { reports: 1 })
  await expect(page.getByTestId('unread-count')).toHaveText('1')
  await page.getByRole('button', { name: 'Open command HUD' }).click()
  const dialog = page.getByRole('dialog', { name: 'Command uplink' })
  const all = dialog.getByRole('link', { name: 'All reports', exact: true })
  await expect(all).toBeInViewport()
  const fleets = dialog.getByRole('button', { name: /^Fleets/ })
  await expect(fleets).toHaveAttribute('aria-expanded', 'false')
  const heading = dialog.getByRole('heading', { name: 'Reports & messages' })
  expect((await fleets.boundingBox())!.y).toBeLessThan(
    (await heading.boundingBox())!.y,
  )
  const actions = dialog.getByRole('group', {
    name: 'Report and message actions',
  })
  for (const [label, destination] of [
    ['All reports', 'reports'],
    ['Messages', 'messages'],
  ] as const) {
    const { to, params } = routeTarget('Andromeda', destination, body.id)
    const path = Object.entries(params).reduce(
      (path, [key, value]) =>
        path.replace('$' + key, encodeURIComponent(value)),
      String(to),
    )
    await expect(
      actions.getByRole('link', { name: label, exact: true }),
    ).toHaveAttribute('href', path)
  }
  for (const action of await actions.locator('a,button').all()) {
    const bounds = (await action.boundingBox())!
    expect([bounds.width, bounds.height]).toEqual([24, 24])
    await expect(action).toHaveAttribute('data-button-variant', 'ghost')
  }
  await all.focus()
  await expect(all).toBeFocused()
  const first = dialog
    .getByLabel('Intelligence list')
    .getByRole('button')
    .first()
  await expect(first).toBeVisible()
  expect((await all.boundingBox())!.y).toBeLessThan(
    (await first.boundingBox())!.y,
  )
})
