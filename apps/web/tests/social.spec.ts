import { withSocialResponse } from './fixtures/responses'
import { test, expect, type Page } from './fixtures/test'
import {
  installGameFixture,
  binding,
  body,
  id,
  matchesFixtureContext,
} from './fixtures/game'
import type { components } from '../src/contracts'
type S = components['schemas']
const peer = id(800)
const contact = (): S['SocialContact'] => ({
  player: peer,
  username: 'Nova',
  blocked: false,
  request: null,
  requested_by: null,
  accepted: false,
})
const message = (n: number): S['SocialMessage'] => ({
  id: id(1000 + n),
  sequence: String(n),
  sender: peer,
  body: `Message ${n}`,
  sent_at: 1700000000000 + n,
})

async function installThread(page: Page, bodies: (typeof body)[]) {
  await installGameFixture(page, {
    protocol: 4,
    bodies,
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await page.route(
    (url) =>
      url.pathname === `/api/v4/universes/${binding.universe}/alliances/query`,
    (r) => {
      if (r.request().method() !== 'POST') return r.fallback()
      const { context, query } = r.request().postDataJSON()
      if (!matchesFixtureContext(context) || query.type !== 'Mine')
        return r.fallback()
      return r.fulfill({
        json: {
          ...context,
          sampled_at: 1700000000000,
          directory: [],
          directory_count: 0,
          applications: [],
          alliance: null,
        },
      })
    },
  )
  const messages = [message(1)]
  const commands: S['SocialCommandRequest'][] = []
  let read = 0
  const api = `/api/v4/universes/${binding.universe}/social/`
  await page.route(
    (url) => url.pathname === api + 'query',
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const { context, query } = route
        .request()
        .postDataJSON() as S['SocialQueryRequest']
      if (!matchesFixtureContext(context)) return route.fallback()
      const result: S['SocialView'] = {
        ...context,
        conversations: [],
        messages: [],
        circulars: [],
        contacts: [],
        contact: null,
        next_cursor: null,
      }
      if (query.type === 'Conversations') {
        result.conversations = [
          {
            contact: contact(),
            latest: messages.at(-1)!,
            unread: messages.some(
              (m) => m.sender === peer && Number(m.sequence) > read,
            ),
          },
        ]
      } else if (query.type === 'Messages' && query.player === peer) {
        result.contact = contact()
        const offset = query.after
          ? messages.findIndex((m) => m.id === query.after)
          : -1
        result.messages = messages.slice(offset + 1)
      } else return route.fallback()
      await route.fulfill({ json: result })
    },
  )
  await page.route(
    (url) => url.pathname === api + 'commands',
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const req = route.request().postDataJSON() as S['SocialCommandRequest']
      if (!matchesFixtureContext(req.context)) return route.fallback()
      let sent: string | null = null
      if (req.action.type === 'Read' && req.action.player === peer) {
        const id = req.action.message
        const latest = messages.find((m) => m.id === id)
        if (!latest) return route.fallback()
        read = Number(latest.sequence)
      } else if (req.action.type === 'Send' && req.action.player === peer) {
        const m = {
          ...message(messages.length + 1),
          sender: binding.player,
          body: req.action.body,
        }
        messages.push(m)
        sent = m.id
      } else return route.fallback()
      commands.push(req)
      await route.fulfill({
        json: { command_id: req.command_id, message: sent },
      })
    },
  )
  return { commands }
}
// Application gate: command wiring plus the direct-message route and its return link.
// Isolated components own layout, draft editing, menus and keyboard permutations.
test(
  'submits a direct message from its deep link and returns to the conversation list',
  { tag: '@journey' },
  async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const selectedBody = { ...structuredClone(body), id: id(6), name: 'Beta' }
    const f = await installThread(page, [body, selectedBody])
    const list = `/u/andromeda/b/${selectedBody.id}/messages`
    await withSocialResponse(page, 'Messages', () =>
      page.goto(`${list}?player=${peer}#details`),
    )
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(
        page.getByRole('button', { name: 'Send message', exact: true }),
      ).toBeInViewport()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    }
    await page
      .getByLabel('Message', { exact: true })
      .fill('Meet at the outpost.')
    await withSocialResponse(page, 'Messages', () =>
      page.getByRole('button', { name: 'Send message', exact: true }).click(),
    )
    await expect(
      page
        .getByLabel('Message history')
        .getByText('Meet at the outpost.', { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue('')
    await page
      .getByRole('button', { name: 'Back to conversations', exact: true })
      .click()
    await expect(page).toHaveURL(`${list}#details`)
    await expect(
      page.getByRole('button', { name: /Open conversation with Nova/ }),
    ).toContainText('Meet at the outpost.')
    expect(
      f.commands.filter((command) => command.action.type === 'Send'),
    ).toHaveLength(1)
  },
)
