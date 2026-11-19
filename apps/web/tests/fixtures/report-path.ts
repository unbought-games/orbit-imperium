import { routeTarget } from '../../src/shell/route-target'
import { body } from './game'

function pathFor(target: ReturnType<typeof routeTarget>) {
  return Object.entries(target.params).reduce(
    (path, [key, value]) => path.replace('$' + key, encodeURIComponent(value)),
    String(target.to),
  )
}

export function reportPath(report?: string) {
  return pathFor(routeTarget('Andromeda', 'reports', body.id, report))
}

export function settingsGamePath() {
  return pathFor(routeTarget('Andromeda', 'settings', body.id, 'game'))
}
