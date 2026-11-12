import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import {
  AutomaticTitles,
  automaticTitleMilestones,
  automaticTitleSummary,
  MilestoneTitles,
} from './automatic-titles'
import { automaticTitlesFixture } from '../../test-support/automatic-titles'
import { communityRewardsApi } from '../../adapters/community-rewards'
import { validate } from '../../client-model/schema'

it('preserves automatic titles through strict owner/action contracts and the HTTP adapter', async () => {
  const owner = automaticTitlesFixture()
  expect(validate('CommunityOwner', owner)).toEqual(owner)
  expect(
    validate('CommunityActionResponse', {
      contract_version: 1,
      owner,
      result: {},
    }),
  ).toMatchObject({ owner })
  const api = communityRewardsApi(
    '',
    async () => new Response(JSON.stringify(owner)),
  )
  expect(await api.owner(new AbortController().signal)).toEqual(owner)
  const invalid = structuredClone(owner)
  invalid.milestones[0].automatic_titles![0].payload = {
    type: 'script',
  } as never
  expect(() => validate('CommunityOwner', invalid)).toThrow()
})

it('shows actual earned and locked titles separately from available and claimed cosmetic choices', () => {
  const markup = renderToStaticMarkup(
    createElement(AutomaticTitles, {
      owner: automaticTitlesFixture(),
      player: 'player-1',
    }),
  )
  expect(markup).toContain('Sample Pathfinder')
  expect(markup).toContain('Sample Stargazer')
  expect(markup).toContain('Sample Voyager')
  expect(markup).toContain('Earned permanently')
  expect(markup).toContain('Cosmetic choices claimed.')
  expect(markup).toContain('Plus 2 cosmetic choices available below.')
  expect(markup).toContain('Awarded automatically at 5 Renown')
  expect(markup).toContain('Plus 1 permanent cosmetic choice.')
  expect(markup).toContain('never changes your current title')
  expect(markup).toContain('href="/profiles/empire/player-1"')
  expect(markup).not.toContain('<button')
})

it('does not call an ungranted title owned and includes a separately returned next milestone once', () => {
  const owner = automaticTitlesFixture()
  owner.milestones = owner.milestones.slice(0, 2)
  owner.milestones[1].automatic_titles![0].owned = false
  expect(
    automaticTitleMilestones(owner).map((milestone) => milestone.id),
  ).toEqual(['sample-claimed', 'sample-step', 'sample-locked'])
  expect(
    renderToStaticMarkup(
      createElement(AutomaticTitles, { owner, player: 'player-1' }),
    ),
  ).toContain('Unlocked · automatic award pending')
})

it('accepts older owners without automatic titles and defaults to no title summary', () => {
  const owner = automaticTitlesFixture()
  for (const milestone of owner.milestones) delete milestone.automatic_titles
  expect(validate('CommunityOwner', owner)).toEqual(owner)
  expect(
    renderToStaticMarkup(
      createElement(AutomaticTitles, { owner, player: 'player-1' }),
    ),
  ).toBe('')
})

it('keeps forty title milestones behind a closed disclosure with only current and next shown by default', () => {
  const owner = automaticTitlesFixture()
  const milestone = owner.milestones[1]
  const title = milestone.automatic_titles![0]
  owner.milestones = Array.from({ length: 40 }, (_, index) => ({
    ...milestone,
    id: `fixture-step-${index + 1}`,
    threshold: index + 1,
    unlocked: index < 20,
    remaining: index < 19 ? 0 : milestone.selections,
    automatic_titles: [
      {
        ...title,
        id: `fixture-title-${index + 1}`,
        name: `Fixture Title ${index + 1}`,
        owned: index < 20,
      },
    ],
  }))
  owner.next_milestone = owner.milestones[20]
  const original = structuredClone(owner)
  expect(automaticTitleSummary(owner).map((m) => m.threshold)).toEqual([20, 21])
  const markup = renderToStaticMarkup(
    createElement(AutomaticTitles, { owner, player: 'player-1' }),
  )
  expect(markup).toContain('<details>')
  expect(markup).not.toContain('<details open')
  expect(markup).toContain('View all 40 title milestones')
  const collapsed = markup.replace(/<details>[\s\S]*?<\/details>/, '')
  expect(collapsed.match(/<strong>/g)).toHaveLength(2)
  expect(collapsed).toContain('Fixture Title 20</strong>')
  expect(collapsed).toContain('Fixture Title 21</strong>')
  expect(collapsed).not.toContain('Fixture Title 1</strong>')
  expect(collapsed).not.toContain('Fixture Title 40</strong>')
  expect(markup).toContain('Fixture Title 40</strong>')
  expect(markup).toContain('Cosmetic choices claimed.')
  expect(owner).toEqual(original)
  owner.milestones.forEach((m) => {
    m.unlocked = false
  })
  expect(automaticTitleSummary(owner).map((m) => m.threshold)).toEqual([1])
  owner.milestones.forEach((m) => {
    m.unlocked = true
  })
  expect(automaticTitleSummary(owner).map((m) => m.threshold)).toEqual([40])
})

it('shows the automatic title benefit inline without adding a claim or equip action', () => {
  const milestone = automaticTitlesFixture().milestones[1]
  const markup = renderToStaticMarkup(
    createElement(MilestoneTitles, { milestone }),
  )
  expect(markup).toContain('Automatic title benefit')
  expect(markup).toContain('Sample Stargazer')
  expect(markup).toContain('Earned permanently · awarded automatically')
  expect(markup).not.toContain('<button')
  expect(markup).not.toContain('<a')
})
