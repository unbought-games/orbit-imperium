import {
  Eye,
  Flag,
  Globe2,
  Package,
  Recycle,
  Swords,
  Shield,
} from 'lucide-react'

export const missionOptions = {
  Hold: {
    icon: Shield,
    description:
      'Defend an ally or friend, then return home. No Depot is needed to hold.',
  },
  Transport: { icon: Package, description: 'Deliver cargo, then return home.' },
  Deploy: {
    icon: Flag,
    description: 'Move ships and cargo to an owned planet or moon.',
  },
  Attack: {
    icon: Swords,
    description: 'Engage a target and raid its resources.',
  },
  Harvest: {
    icon: Recycle,
    description: 'Collect resources from a debris field.',
  },
  Espionage: {
    icon: Eye,
    description: 'Scout a target and bring back intelligence.',
  },
  Colonize: {
    icon: Globe2,
    description: 'Use a Colony Ship to settle an empty planet slot.',
  },
}
export type DispatchMission = keyof typeof missionOptions
export const dispatchMissions = Object.keys(missionOptions) as DispatchMission[]
