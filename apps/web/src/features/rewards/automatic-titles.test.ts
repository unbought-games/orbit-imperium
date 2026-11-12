import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { AutomaticTitles, automaticTitleMilestones } from './automatic-titles'
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
