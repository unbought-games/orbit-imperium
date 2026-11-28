import { fixtureRoutePath } from './navigation'
import { body } from './game'

export function reportPath(report?: string) {
  return fixtureRoutePath('Andromeda', 'reports', body.id, report)
}

export function settingsGamePath() {
  return fixtureRoutePath('Andromeda', 'settings', body.id, 'game')
}
