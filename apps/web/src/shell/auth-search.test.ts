import { expect, it } from 'vitest'
import { validateAuthSearch } from './auth-search'

it.each(['https://example.com', '//example.com', '/u/../../login'])(
  'discards the invalid auth return destination %s',
  (redirect) => {
    expect(validateAuthSearch({ redirect }).redirect).toBeUndefined()
  },
)

it('retains a canonical destination, query and fragment when switching auth forms', () => {
  const redirect = '/u/andromeda/b/earth/menu?tab=account#profile'
  expect(validateAuthSearch({ redirect })).toEqual({ redirect })
})
