import { test, expect, type Page } from './fixture'
import type { TutorialSceneInput } from './tutorial-briefing.scenario'
import { tutorialFixture } from '../../src/test-support/tutorial'
import type { TutorialData } from '../../src/client-model/tutorial-engine'

const initial = tutorialFixture()
const completed = tutorialFixture(true)
const home = initial.homeworld!
const base = `/u/andromeda/b/${home}`

async function prepare(page: Page, input: Omit<TutorialSceneInput, 'body'>) {
  await page.addInitScript(
    (input) => {
      window.tutorialInput = input
    },
    { body: home, ...input },
  )
}

function earned(id: string, previous = initial) {
  const data = structuredClone(previous)
  const objective = data.chapters
    .flatMap((c) => c.objectives)
    .find((o) => o.id === id)!
  objective.completed = true
  objective.inspection = null
  objective.next_action = null
  data.receipts.push(completed.receipts.find((r) => r.objective === id)!)
  return data
}

async function deliver(page: Page, data: TutorialData) {
  await page.evaluate((data) => window.deliverTutorial!(data), data)
}

test('an open briefing acknowledges newly delivered objectives and leaves later progress unread', async ({
  page,
  mount,
}) => {
  await prepare(page, {
    page: 'overview',
    data: { ...initial, beginner: false },
  })
  await mount('tutorial-briefing')
  await page.getByRole('link', { name: /^Open briefing/ }).click()
  await expect(
    page.getByRole('region', { name: 'Recommended next action' }),
  ).toBeVisible()
  const solar = { ...earned('solar-1'), beginner: false }
  await deliver(page, solar)
  await expect(
    page.getByRole('dialog', { name: 'Nicely done!' }),
  ).toContainText('Solar Plant')
  await page.getByRole('link', { name: 'Return to overview' }).click()
  await expect(
    page.getByRole('link', { name: 'Open briefing', exact: true }),
  ).toHaveAttribute('data-attention', 'false')
  await deliver(page, earned('metal-1', solar))
  await expect(
    page.getByRole('link', { name: 'Open briefing — unread updates' }),
  ).toHaveAttribute('data-attention', 'true')
})

test('the opening chapter presents energy first and keeps its later mine and power milestones in authored order', async ({
  page,
  mount,
}) => {
  await prepare(page, { page: 'briefing', data: initial })
  await mount('tutorial-briefing')
  const job = page.getByRole('region', { name: 'Recommended next action' })
  await expect(job).toContainText('Build Solar Plant level 1')
  await expect(
    job.getByRole('link', { name: 'Open Solar Plant' }),
  ).toHaveAttribute('href', base + '/resources/solar-plant')
  await page
    .getByRole('button', { name: /01 Establish the colony/ })
    .press('Enter')
  const rows = page
    .getByRole('region', { name: /01 Establish the colony/ })
    .getByRole('heading', { level: 4 })
  await expect(rows.first()).toBeVisible()
  const titles = (await rows.allTextContents()).map((title) =>
    title.replaceAll('\u00a0', ' '),
  )
  expect(titles.slice(0, 7)).toEqual([
    'Build Solar Plant level 1',
    'Build Metal Mine level 1',
    'Build Crystal Mine level 1',
    'Upgrade Metal Mine to level 2',
    'Upgrade Solar Plant to level 2',
    'Review resource settings',
    'Upgrade Crystal Mine to level 2',
  ])
  const metalFour = titles.indexOf('Upgrade Metal Mine to level 4')
  expect(titles.slice(metalFour, metalFour + 4)).toEqual([
    'Upgrade Metal Mine to level 4',
    'Upgrade Solar Plant to level 5',
    'Build Deuterium Synthesizer level 1',
    'Upgrade Deuterium Synthesizer to level 2',
  ])
  const robotics = titles.indexOf('Upgrade Robotics Factory to level 2')
  expect(titles.slice(robotics + 1)).toEqual([
    'Upgrade Deuterium Synthesizer to level 5',
    'Upgrade Crystal Mine to level 6',
    'Upgrade Metal Mine to level 7',
    'Upgrade Solar Plant to level 9',
  ])
})

test('an out-of-order lab receipt navigates forward to research and leaves the briefing free of receipt history', async ({
  page,
  mount,
}) => {
  const data = earned('lab-2')
  data.recommended_objectives = ['solar-1']
  await prepare(page, { page: 'briefing', data })
  await mount('tutorial-briefing')
  const bubble = page.getByRole('dialog', { name: 'Nicely done!' })
  await expect(bubble).toContainText('Research Lab · level 2')
  const next = bubble.getByRole('region', { name: 'Next directive' })
  await expect(next).toContainText('Research Energy Technology level 1')
  await expect(page.getByLabel('Latest accomplishment')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Dismiss receipt' }),
  ).toHaveCount(0)
  await next.getByRole('link', { name: 'Open Energy Technology' }).click()
  await expect(page.getByLabel('Destination', { exact: true })).toHaveText(
    base + '/research/energy-technology',
  )
  await expect(bubble).toHaveCount(0)
  await page.getByRole('link', { name: 'Return to overview' }).click()
  await page
    .getByRole('link', { name: /^Open briefing/ })
    .first()
    .click()
  await expect(page.getByLabel('Latest accomplishment')).toHaveCount(0)
  await page.getByRole('button', { name: /02 Build the first fleet/ }).click()
  const chapter = page.getByRole('region', { name: /02 Build the first fleet/ })
  await expect(
    chapter.getByRole('heading', { name: /Upgrade Research Lab to level\s2/ }),
  ).toBeVisible()
  await expect(
    chapter.getByRole('heading', { name: /Upgrade Shipyard to level\s2/ }),
  ).toBeVisible()
})

test('full-interface receipts wait while the advisor is suspended and the final briefing retains no reward-history controls', async ({
  page,
  mount,
}) => {
  await prepare(page, {
    page: 'overview',
    data: { ...earned('metal-1'), beginner: false },
  })
  await mount('tutorial-briefing')
  const bubble = page.getByRole('dialog', { name: 'Nicely done!' })
  await expect(bubble).toContainText('Metal Mine · level 1')
  await bubble.getByRole('link', { name: 'Briefing', exact: true }).click()
  await expect(page.getByLabel('Destination', { exact: true })).toHaveText(
    base + '/briefing',
  )
  await expect(bubble).toHaveCount(0)
  const suspend = page.getByRole('button', {
    name: 'Toggle advisor suspension',
  })
  await suspend.click()
  const final = { ...completed, beginner: false, homeworld: home }
  expect(final.receipts).toHaveLength(31)
  await deliver(page, final)
  await expect(
    page.getByRole('heading', { name: 'An empire of your own' }),
  ).toBeVisible()
  await expect(bubble).toHaveCount(0)
  await suspend.click()
  await expect(bubble).toContainText('30 directives completed.')
  await expect(bubble).toContainText('Briefing complete.')
  await expect(
    bubble.getByRole('region', { name: 'Next directive' }),
  ).toHaveCount(0)
  await bubble.getByRole('link', { name: 'Briefing', exact: true }).click()
  await expect(bubble).toHaveCount(0)
  await expect(page.getByText(/Automatic reward history/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Reward history' })).toHaveCount(
    0,
  )
})

for (const width of [1440, 390]) {
  test(`the Develop navigation promotes Facilities after the first deuterium directive at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const data = structuredClone(initial)
    data.recommended_objectives = ['deuterium-2']
    await prepare(page, { page: 'resources', data })
    await mount('tutorial-briefing')
    const develop = page.getByRole('navigation', {
      name: 'Develop navigation',
      exact: true,
    })
    await expect(develop).toBeVisible()
    const facilities = develop.getByRole('link', {
      name: 'Facilities',
      exact: true,
    })
    await expect(facilities).toHaveCount(0)
    const directive = data.chapters
      .flatMap((c) => c.objectives)
      .find((o) => o.id === 'deuterium-1')!
    directive.completed = true
    directive.next_action = null
    directive.inspection = null
    await deliver(page, data)
    await expect(facilities).toBeVisible()
    await facilities.click()
    await expect(page.getByLabel('Destination', { exact: true })).toHaveText(
      base + '/facilities',
    )
    await expect(facilities).toHaveAttribute('aria-current', 'page')
  })
}

for (const width of [1100, 390]) {
  test(`More opens deferred destinations and promotes routes after a private site arrives at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const data = structuredClone(initial)
    await prepare(page, { page: 'menu', data })
    await mount('tutorial-briefing')
    const navigation =
      width >= 1024
        ? page.getByLabel('Game navigation', { exact: true })
        : page.getByRole('navigation', {
            name: 'Menu destinations',
            exact: true,
          })
    const disclosure = navigation.locator('summary').filter({ hasText: 'More' })
    await expect(disclosure).toBeVisible()
    const messages = navigation.getByRole('link', {
      name: 'Messages',
      exact: true,
    })
    await expect(messages).not.toBeVisible()
    await disclosure.press('Enter')
    const more = navigation.getByRole('navigation', {
      name: 'More navigation',
      exact: true,
    })
    const alliance = more.getByRole('link', { name: 'Alliance', exact: true })
    await expect(alliance).toHaveAttribute('href', base + '/alliance')
    await expect(
      more.getByRole('link', { name: 'Messages', exact: true }),
    ).toHaveAttribute('href', base + '/messages')
    await expect(
      more.getByRole('link', { name: 'Reports', exact: true }),
    ).toBeVisible()
    data.sites = structuredClone(completed.sites)
    const directive = data.chapters
      .flatMap((c) => c.objectives)
      .find((o) => o.id === 'deuterium-1')!
    directive.completed = true
    directive.next_action = null
    directive.inspection = null
    await deliver(page, data)
    await expect(
      navigation.getByRole('link', { name: 'Reports', exact: true }),
    ).toBeVisible()
    await expect(
      more.getByRole('link', { name: 'Reports', exact: true }),
    ).toHaveCount(0)
  })
}

test('briefing retry after a failed refresh keeps the current chapter until completed progress arrives', async ({
  page,
  mount,
}) => {
  await prepare(page, { page: 'briefing', data: initial, retryData: completed })
  await mount('tutorial-briefing')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Unable to load guidance.')
  await expect(
    page.getByRole('region', { name: 'Recommended next action' }),
  ).toContainText('Build Solar Plant level 1')
  await alert.getByRole('button', { name: 'Retry guidance' }).click()
  await expect(
    page.getByRole('heading', { name: 'An empire of your own' }),
  ).toBeVisible()
  await expect(alert).toHaveCount(0)
})
