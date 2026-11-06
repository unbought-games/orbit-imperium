import { expect, it } from 'vitest'
import { briefingRoute } from './briefing-route'
import { tutorialFixture } from '../../test-support/tutorial'

it('keeps report links usable while guidance loads and omits them without any planet', () => {
  expect(briefingRoute('Andromeda', null, 'selected')?.params).toEqual({
    universe: 'andromeda',
    body: 'selected',
  })
  const data = tutorialFixture()
  expect(briefingRoute('Andromeda', data, 'selected')?.params).toMatchObject({
    body: data.homeworld,
  })
  expect(
    briefingRoute('Andromeda', { ...data, homeworld: null }, 'selected')
      ?.params,
  ).toMatchObject({ body: 'selected' })
  expect(briefingRoute('Andromeda', null)).toBeNull()
})
