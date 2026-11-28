import { expect, test } from './fixture'
import type {} from './rewards.scenario'
declare global { interface Window { invitationCopyAttempts:string[] } }

test('automatic titles expand beside the available cosmetic choices', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await mount('rewards-screen')
  const titles = page.getByRole('region', {
    name: 'Automatic milestone titles',
  })
  await expect(titles).toContainText('Sample Pathfinder')
  await expect(titles).toContainText('Sample Stargazer')
  await expect(titles).toContainText('Sample Voyager')
  await expect(titles).toContainText('Cosmetic choices claimed.')
  await expect(titles).toContainText('Plus 2 cosmetic choices available below.')
  await expect(titles).toContainText('Awarded automatically at 5 Renown')
  await expect(
    titles.getByRole('button', { name: 'Choose this reward' }),
  ).toHaveCount(0)
  await expect(
    titles.getByText('Sample Pathfinder', { exact: true }),
  ).toBeHidden()
  await expect(
    titles.getByRole('link', { name: 'Choose your displayed title' }),
  ).toHaveAttribute(
    'href',
    `/profiles/empire/${'00000000-0000-4000-8000-000000000002'}`,
  )
  const choices = page.getByRole('region', { name: 'Your reward choices' })
  await expect(
    choices.getByRole('button', { name: 'Choose this reward' }),
  ).toHaveCount(3)
  await expect(
    choices.getByRole('list', { name: 'Automatic title benefit' }),
  ).toContainText('Sample Stargazer')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await titles
    .locator('summary')
    .filter({ hasText: 'View all 3 title milestones' })
    .click()
  await expect(
    titles.getByText('Sample Pathfinder', { exact: true }),
  ).toBeVisible()
})
for (const [mode, content] of [
  ['offline', 'Rewards are temporarily unavailable'],
  ['inactive', 'Community rewards are not active on this server.'],
] as const) {
  test(`Rewards reads explain an ${mode} owner response`, async ({ page }) => {
    await page.goto('/?scenario=rewards-screen&mode=' + mode)
    await expect(page.locator('html')).toHaveAttribute(
      'data-component-ready',
      'rewards-screen',
    )
    if (mode === 'offline')
      await expect(page.getByRole('alert')).toContainText(content)
    else await expect(page.getByText(content, { exact: true })).toBeVisible()
  })
}
test('choosing the invitation universe reveals a selectable link after clipboard refusal', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.invitationCopyAttempts=[]
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
      writeText:async (url:string)=>{window.invitationCopyAttempts.push(url);throw Error('denied')}
    }})
  })
  await page.goto('/?scenario=rewards-screen&surface=management')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'rewards-screen',
  )
  const copy = page.getByRole('button', {
    name: 'Copy invite link',
    exact: true,
  })
  await expect(copy).toBeDisabled()
  await page
    .getByRole('combobox', { name: 'Invite to universe' })
    .selectOption({ label: 'Orion Reach' })
  await copy.click()
  await expect(
    page.getByRole('textbox', { name: 'Invitation link', exact: true }),
  ).toHaveValue(new URL('/invite/inv_fixture-A_9', page.url()).href)
  expect(await page.evaluate(()=>window.invitationCopyAttempts)).toEqual([new URL('/invite/inv_fixture-A_9',page.url()).href])
  await expect(
    page.getByRole('status').filter({ hasText: 'Select and copy' }),
  ).toBeVisible()
  expect(
    await page.evaluate(() =>
      window.rewardsScene.submitted.map((r) => r.action),
    ),
  ).toEqual([
    {
      type: 'create_invitation',
      kind: 'personal',
      game_id: 'orbit-imperium',
      universe_id: '00000000-0000-4000-8000-000000000091',
    },
  ])
})

test('desktop account menu exposes Rewards only in its popup and Enter follows the funded link', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mount('rewards-sidebar')
  const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
  await expect(
    sidebar.getByRole('link', { name: 'Rewards', exact: true }),
  ).toHaveCount(0)
  await sidebar
    .getByRole('button', { name: 'Account menu', exact: true })
    .click()
  const menu = page.getByRole('menu', { name: 'Account menu', exact: true })
  const link = menu.getByRole('menuitem', { name: 'Rewards', exact: true })
  await expect(link).toHaveAttribute(
    'href',
    '/u/andromeda/b/00000000-0000-4000-8000-000000000005/rewards',
  )
  await link.focus()
  await expect(link).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Rewards', exact: true }),
  ).toBeVisible()
})
