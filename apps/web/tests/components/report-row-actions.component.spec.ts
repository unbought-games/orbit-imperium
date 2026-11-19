import { expect, test } from './fixture'
import { id } from '../../src/test-support/bootstrap'

test('a fine pointer archives and restores at the row edge, and the detail toolbar stays separately actionable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?scenario=report-triage&details')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'report-triage',
  )
  const target = id(71)
  const row = page
    .getByRole('article')
    .filter({ has: page.locator(`a[href$="/${target}"]`) })
  const route = page.getByLabel('Mounted report route')
  const clickEdge = async (button: import('@playwright/test').Locator) => {
    await expect(button).toBeEnabled()
    await button.scrollIntoViewIfNeeded()
    const bounds = (await button.boundingBox())!
    expect(bounds.width).toBe(24)
    expect(bounds.height).toBe(24)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440)
    expect((await button.locator('svg').boundingBox())!.width).toBe(16)
    await page.mouse.click(bounds.x + 2, bounds.y + bounds.height / 2)
  }
  await expect(row).toBeVisible()
  await clickEdge(
    row.getByRole('button', { name: 'Archive report', exact: true }),
  )
  await expect(row).toHaveCount(0)
  await expect(route).toHaveText(/\/reports$/)
  await page.getByRole('button', { name: 'Archived', exact: true }).click()
  await clickEdge(
    row.getByRole('button', { name: 'Move to inbox', exact: true }),
  )
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: 'Inbox', exact: true }).click()
  await row.getByRole('link', { name: 'Espionage', exact: true }).click()
  const observation = page.getByRole('region', { name: 'Report observation' })
  await expect(observation).toBeVisible()
  const archive = page.getByRole('button', {
    name: 'Archive report',
    exact: true,
  })
  const share = page.getByRole('button', { name: 'Share report', exact: true })
  const shareBox = (await share.boundingBox())!
  const archiveBox = (await archive.boundingBox())!
  expect(archiveBox.x).toBeGreaterThanOrEqual(shareBox.x + shareBox.width)
  await clickEdge(archive)
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.reportTriage.submissions
          .filter(
            (e) =>
              e.command.type === 'World' &&
              e.command.action.type === 'ArchiveReport',
          )
          .map((e) => e.command),
      ),
    )
    .toEqual([
      {
        type: 'World',
        action: { type: 'ArchiveReport', report: target, revoke_share: false },
      },
    ])
  await expect(route).toHaveText(/\/reports$/)
  await expect(row).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

async function openInbox(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/?scenario=report-triage&details')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'report-triage',
  )
  await expect(page.getByRole('article')).toHaveCount(5)
  const link = page
    .locator(`a[href$="/${id(71)}"]`)
    .filter({ hasText: 'Espionage' })
  const row = page.getByRole('article').filter({ has: link })
  return {
    row,
    link: row.getByRole('link', { name: 'Espionage', exact: true }),
    route: page.getByLabel('Mounted report route'),
  }
}

test('row padding and keyboard open the observation while checkbox and protected archive gestures stay in the list', async ({
  page,
}) => {
  const { row, link, route } = await openInbox(page)
  const box = (await row.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 2)
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Back to reports' }).click()
  const select = row.getByRole('checkbox')
  await select.check()
  await expect(select).toBeChecked()
  await expect(route).toHaveText(/\/reports$/)
  await select.press('Space')
  await expect(select).not.toBeChecked()
  await expect(
    row.getByRole('button', { name: /^(Unstar|Star) report$/ }),
  ).toHaveCount(0)
  await link.click()
  await page
    .getByRole('button', { name: 'Star report', exact: true })
    .press('Enter')
  await expect(
    page.getByRole('button', { name: 'Unstar report', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Back to reports' }).click()
  const remove = row.getByRole('button', {
    name: 'Archive report',
    exact: true,
  })
  await expect(remove).toBeDisabled()
  await remove.hover()
  await page.mouse.down()
  await page.mouse.up()
  await expect(route).toHaveText(/\/reports$/)
  const countArchives = () =>
    page.evaluate(
      () =>
        window.reportTriage.submissions.filter(
          (e) =>
            e.command.type === 'World' &&
            ['SetReportHidden', 'ArchiveReport'].includes(
              e.command.action.type,
            ),
        ).length,
    )
  expect(await countArchives()).toBe(0)
  await link.click()
  await page
    .getByRole('button', { name: 'Unstar report', exact: true })
    .press('Enter')
  await expect(
    page.getByRole('button', { name: 'Star report', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('link', { name: 'Back to reports' }).click()
  await expect(remove).toBeEnabled()
  await select.focus()
  await page.keyboard.press('Tab')
  await expect(link).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(route).toContainText(id(71))
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Back to reports' }).click()
  await remove.click()
  await expect(row).toHaveCount(0)
  expect(await countArchives()).toBe(1)
})

test('refusing a report read and leaving its pending retry do not mark it read', async ({
  page,
}) => {
  const { row, link, route } = await openInbox(page)
  await page.evaluate(() => {
    const scene = window.reportTriage
    const read = scene.port.report!
    let first = true
    scene.port.report = async (context, id) => {
      if (first) {
        first = false
        throw { status: 503, code: 'Unavailable' }
      }
      await new Promise<void>((resolve) => {
        window.releaseReportPort = resolve
      })
      return read(context, id)
    }
  })
  await link.click()
  const retry = page.getByRole('button', { name: 'Retry reports' })
  await expect(retry).toBeVisible()
  const readCommands = () =>
    page.evaluate(
      () =>
        window.reportTriage.submissions.filter(
          (e) =>
            e.command.type === 'World' &&
            e.command.action.type === 'MarkReportRead',
        ).length,
    )
  expect(await readCommands()).toBe(0)
  try {
    await retry.click()
    await expect
      .poll(() => page.evaluate(() => typeof window.releaseReportPort))
      .toBe('function')
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await expect(route).toHaveText(/\/reports$/)
    await expect(row).toBeVisible()
    await page.evaluate(() => window.releaseReportPort?.())
    // The consumer has left. Wait until the real engine accepts the held read.
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            window.reportTriage.model.store.getState().reportDetails.has(id),
          id(71),
        ),
      )
      .toBe(true)
    expect(await readCommands()).toBe(0)
    expect(
      await page.evaluate(
        (id) => window.reportTriage.headers.find((row) => row.id === id)?.read,
        id(71),
      ),
    ).toBe(false)
  } finally {
    await page.evaluate(() => window.releaseReportPort?.())
  }
})

test('detail archive stays put on refusal and returns after a successful retry from the banner', async ({
  page,
}) => {
  const { link, route, row } = await openInbox(page)
  await link.click()
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  await page.evaluate(() => {
    const { port } = window.reportTriage
    const send = port.submit
    let archives = 0
    port.receipt = async () => {
      throw { status: 404 }
    }
    port.submit = async (envelope) => {
      if (
        envelope.command.type === 'World' &&
        envelope.command.action.type === 'ArchiveReport'
      ) {
        if (++archives === 1)
          return {
            protocol: 4,
            binding: envelope.binding,
            command_id: envelope.command_id,
            status: 'Rejected',
            code: 'NotFound',
            admitted_at: 1000,
            executed_at: 1000,
          }
        if (archives === 2) throw { status: 503, code: 'Unavailable' }
      }
      return send(envelope)
    }
  })
  const archive = page.getByRole('button', {
    name: 'Archive report',
    exact: true,
  })
  const banner = page.getByTestId('game-error-banner')
  await archive.click()
  await expect(banner).toContainText('Action rejected: Not Found')
  await expect(route).toContainText(id(71))
  await expect(archive).toBeEnabled()
  await archive.click()
  await expect(banner).toContainText(
    'We’re checking whether this order went through.',
  )
  await expect(route).toContainText(id(71))
  await expect(archive).toBeDisabled()
  await banner.getByRole('button', { name: 'Retry order', exact: true }).click()
  await expect(route).toHaveText(/\/reports$/)
  await expect(row).toHaveCount(0)
})

test('a refused initial Reports list offers Retry without rendering the empty destination', async ({
  page,
}) => {
  await page.goto('/?scenario=report-triage&list=unavailable')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'report-triage',
  )
  await expect(
    page.getByRole('button', { name: 'Retry reports' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'No reports to show.' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Explore the galaxy' }),
  ).toHaveCount(0)
})

test('a committed archive cannot navigate away from another mounted report', async ({
  page,
}) => {
  const { link, route } = await openInbox(page)
  await link.click()
  const observation = page.getByRole('region', { name: 'Report observation' })
  await expect(observation).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        (id) => window.reportTriage.headers.find((h) => h.id === id)?.read,
        id(71),
      ),
    )
    .toBe(true)
  await expect
    .poll(() =>
      page.evaluate(
        () => window.reportTriage.model.store.getState().view?.viewer_revision,
      ),
    )
    .toBe('2')
  await page.evaluate(() => {
    const scene = window.reportTriage
    const send = scene.port.submit
    scene.port.submit = async (e) => {
      if (
        e.command.type === 'World' &&
        e.command.action.type === 'ArchiveReport'
      )
        await new Promise<void>((resolve) => {
          window.releaseReportPort = resolve
        })
      return send(e)
    }
  })
  try {
    await page
      .getByRole('button', { name: 'Archive report', exact: true })
      .click()
    await expect
      .poll(() => page.evaluate(() => typeof window.releaseReportPort))
      .toBe('function')
    await page.getByRole('link', { name: 'Back to reports' }).click()
    const next = page
      .locator(`a[href$="/${id(72)}"]`)
      .filter({ hasText: 'Espionage' })
    await next.click()
    await expect(observation).toBeVisible()
    await expect(route).toContainText(id(72))
    await page.evaluate(() => window.releaseReportPort?.())
    // B was read before the archive. Revision 3 therefore requires A's
    // receipt and the subsequent authoritative view to have been processed.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.reportTriage.model.store.getState().view?.viewer_revision,
        ),
      )
      .toBe('3')
    await expect(route).toContainText(id(72))
    await expect(observation).toBeVisible()
  } finally {
    await page.evaluate(() => window.releaseReportPort?.())
  }
})

test('E belongs to the visible report selection and cannot submit through the open filter sheet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?scenario=report-triage&details')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'report-triage',
  )
  const rows = page.getByRole('article')
  await expect(rows).toHaveCount(5)
  await page.keyboard.press('e')
  const calls = () =>
    page.evaluate(() => window.reportTriage.submissions.length)
  expect(await calls()).toBe(0)
  await page.getByRole('button', { name: 'More report actions' }).click()
  await page
    .getByRole('menuitem', { name: 'Select reports', exact: true })
    .click()
  const check = (n: number) =>
    rows
      .filter({ has: page.locator(`a[href$="/${id(n)}"]`) })
      .getByRole('checkbox')
  await check(70).check()
  await check(71).check()
  await expect(
    page.getByRole('button', { name: 'Archive selected (2)' }),
  ).toHaveAttribute('aria-keyshortcuts', 'e')
  await page
    .getByRole('button', { name: 'Filter reports', exact: true })
    .click()
  const close = page
    .getByRole('dialog', { name: 'Filter reports' })
    .getByRole('button', { name: /Dismiss (sheet|popover)/ })
  await close.focus()
  await page.keyboard.press('e')
  expect(await calls()).toBe(0)
  await close.click()
  await check(71).focus()
  await page.keyboard.press('e')
  await expect(rows).toHaveCount(3)
  await expect(
    page.getByRole('group', { name: 'Report selection' }),
  ).toContainText('0 selected')
  expect(
    await page.evaluate(() =>
      window.reportTriage.headers.filter((h) => h.hidden).map((h) => h.id),
    ),
  ).toEqual([id(70), id(71), id(75)])
  expect(await calls()).toBe(1)
})

test('the shared detail archive shortcut requires explicit revocation and stays inactive on the archived detail', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?scenario=report-triage&details')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'report-triage',
  )
  await page.evaluate(async (id) => {
    const scene = window.reportTriage
    Object.assign(scene.headers.find((h) => h.id === id)!, {
      shared: true,
      starred: true,
    })
    scene.view.viewer_revision = '2'
    await scene.model.refresh('2')
  }, id(72))
  const row = page
    .getByRole('article')
    .filter({ has: page.locator(`a[href$="/${id(72)}"]`) })
  await row.getByRole('link').first().click()
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  const archive = page.getByRole('button', {
    name: 'Archive report',
    exact: true,
  })
  await expect(
    page.getByRole('button', { name: 'Unstar report' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(archive).toHaveAttribute('aria-keyshortcuts', 'e')
  await archive.click()
  const dialog = page.getByRole('dialog', {
    name: 'Archive this shared report?',
  })
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
  await expect(dialog).toHaveAccessibleDescription(
    /public link will stop working/,
  )
  await expect(cancel).toBeFocused()
  await cancel.click()
  await expect(dialog).toBeHidden()
  await expect(archive).toBeFocused()
  expect(
    await page.evaluate(() => window.reportTriage.submissions.length),
  ).toBe(0)
  await page.evaluate(() => {
    const port = window.reportTriage.port
    const submit = port.submit
    port.submit = async (e) => {
      await new Promise<void>((resolve) => {
        window.releaseReportPort = resolve
      })
      return submit(e)
    }
  })
  const route = page.getByLabel('Mounted report route')
  try {
    await page.keyboard.press('e')
    await dialog
      .getByRole('button', { name: /Archive and stop sharing/i })
      .click()
    await expect
      .poll(() => page.evaluate(() => typeof window.releaseReportPort))
      .toBe('function')
    await expect(route).toContainText(id(72))
    await expect(
      page.getByRole('button', { name: 'Move to inbox', exact: true }),
    ).toBeDisabled()
    await page.keyboard.press('e')
  } finally {
    await page.evaluate(() => window.releaseReportPort?.())
  }
  await expect(route).toHaveText(/\/reports$/)
  await page.getByRole('button', { name: 'Archived', exact: true }).click()
  if (
    !(await page.getByRole('group', { name: 'Report selection' }).isVisible())
  ) {
    await page.getByRole('button', { name: 'More report actions' }).click()
    await page
      .getByRole('menuitem', { name: 'Select reports', exact: true })
      .click()
  }
  await row.getByRole('checkbox').check()
  await page.keyboard.press('e')
  expect(
    await page.evaluate(() => window.reportTriage.submissions.length),
  ).toBe(1)
  await row.getByRole('link').first().click()
  await expect(
    page.getByRole('button', { name: 'Move to inbox', exact: true }),
  ).toBeEnabled()
  await page.keyboard.press('e')
  expect(
    await page.evaluate(() =>
      window.reportTriage.submissions.map((s) => s.command),
    ),
  ).toEqual([
    {
      type: 'World',
      action: { type: 'ArchiveReport', revoke_share: true, report: id(72) },
    },
  ])
  expect(
    await page.evaluate(
      (id) => window.reportTriage.headers.find((row) => row.id === id),
      id(72),
    ),
  ).toMatchObject({ hidden: true, starred: true, shared: false })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('private report dossier keeps the recorded affiliation after loading the newer authorized profile', async ({
  page,
}) => {
  await page.goto('/?scenario=report-triage&details&historical')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'report-triage',
  )
  await page
    .locator(`a[href$="/${id(71)}"]`)
    .filter({ hasText: 'Espionage' })
    .click()
  const observation = page.getByRole('region', { name: 'Report observation' })
  await expect(observation).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          window.reportSourceProfiles.store.getState().players[id]?.alliance
            ?.tag,
        id(9),
      ),
    )
    .toBe('NEW')
  const { focusPlayerDetails } = await import('../fixtures/profile-navigation')
  await focusPlayerDetails(
    page,
    observation.getByRole('link', { name: 'Commander Vega profile details' }),
  )
  await expect(
    page
      .getByRole('tooltip')
      .getByRole('link', { name: 'Alliance Original alliance [OLD]' }),
  ).toHaveAttribute('href', `/alliances/${id(3)}/${id(85)}`)
  await expect(observation).not.toContainText('[NEW]')
  await expect(observation).toContainText('Commander Vega')
})
