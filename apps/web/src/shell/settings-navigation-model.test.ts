import { expect, it } from 'vitest'
import { settingsEntryTarget } from './settings-navigation-model'

it.each([true, false])(
  'migrates old probe bookmarks to a real game-settings route with desktop=%s',
  (desktop) => {
    expect(settingsEntryTarget(desktop, 'galaxy-espionage')).toEqual({
      section: 'game',
      hash: '',
    })
  },
)
it('keeps the mobile index and desktop identity default for ordinary entries', () => {
  expect(settingsEntryTarget(false, '')).toBeUndefined()
  expect(settingsEntryTarget(true, '')).toEqual({
    section: 'identity',
    hash: '',
  })
})
