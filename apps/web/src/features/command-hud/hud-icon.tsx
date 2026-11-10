import {
  Atom,
  Crosshair,
  Hammer,
  Mail,
  Radar,
  Rocket,
  Shield,
  Swords,
  Telescope,
} from 'lucide-react'
import type { HudIcon } from './model'

const icons = {
  spy: Radar,
  fleet: Rocket,
  building: Hammer,
  research: Atom,
  shipyard: Rocket,
  defense: Shield,
  report: Telescope,
  message: Mail,
  attack: Swords,
  scan: Crosshair,
}
export function HudIconMark({
  kind,
  size = 20,
}: {
  kind: HudIcon
  size?: number
}) {
  const Icon = icons[kind]
  return <Icon size={size} aria-hidden="true" />
}
