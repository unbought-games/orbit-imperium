import {
  defaultParseSearch,
  defaultStringifySearch,
} from '@tanstack/react-router'
import { allianceSearch } from './recruitment'
import { withoutBodySearch } from '../shell/page-search'
import { describe, it, expect } from 'vitest'
import {
  recruitmentEntry,
  recruitmentEntryPath,
  recruitmentFromForm,
} from './recruitment'
import { allianceWelcomePath } from './use-recruitment-entry'
import { validateAuthSearch } from '../shell/auth-search'
const universe = '00000000-0000-4000-8000-000000000001',
  alliance = '00000000-0000-4000-8000-000000000002',
  invitation = '00000000-0000-4000-8000-000000000003'
describe('alliance entry context', () => {
  it('preserves stable alliance and invitation IDs through authentication and named game routes', () => {
    const entry = { universe, alliance, invitation }
    const path = recruitmentEntryPath(entry)
    expect(recruitmentEntry(path)).toEqual(entry)
    for (const auth of ['login', 'signup'])
      expect(
        recruitmentEntry(`/${auth}?${new URLSearchParams({ redirect: path })}`),
      ).toEqual(entry)
    expect(validateAuthSearch({ redirect: path })).toEqual({ redirect: path })
    expect(allianceWelcomePath('New Andromeda', entry)).toBe(
      `/u/new-andromeda/alliance?alliance=${alliance}&welcome=1&invitation=${invitation}`,
    )
  })
  it('rejects external, malformed, recursive and incomplete invitation destinations', () => {
    for (const path of [
      `https://elsewhere.example/join/${universe}?alliance=${alliance}`,
      `//elsewhere.example/join/${universe}?alliance=${alliance}`,
      `/join/${universe}`,
      `/join/${universe}?alliance=bad`,
      `/join/${universe}?alliance=${alliance}&invitation=bad`,
      '/login?redirect=/login',
    ])
      expect(recruitmentEntry(path)).toBeNull()
  })
  it('does not convert unset preferences into claims about an alliance', () => {
    expect(recruitmentFromForm(new FormData())).toEqual({
      listed: false,
      languages: null,
      beginners: null,
      activity: null,
    })
    const data = new FormData()
    data.set('listed', 'on')
    data.append('languages', 'en')
    data.append('languages', 'fr')
    data.set('beginners', 'Welcome')
    data.set('activity', 'Weekly')
    expect(recruitmentFromForm(data)).toEqual({
      listed: true,
      languages: ['en', 'fr'],
      beginners: 'Welcome',
      activity: 'Weekly',
    })
  })
})

it('retains the welcome when query parsing and planet selection normalize the game address', () => {
  for (const welcome of [1, '1']) {
    const search = allianceSearch({ alliance, invitation, welcome })
    expect(search.welcome).toBe('1')
    const normalized = withoutBodySearch({ body: 'planet', ...search })
    expect(
      allianceSearch(defaultParseSearch(defaultStringifySearch(normalized))),
    ).toEqual(search)
    expect(normalized.body).toBeUndefined()
  }
  expect(allianceSearch({ alliance }).welcome).toBeUndefined()
  expect(() => allianceSearch({ alliance, invitation: 'invalid' })).toThrow(
    'invalid invitation',
  )
})
