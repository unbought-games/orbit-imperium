import { Eye, Flag, Globe2, Package, Recycle, Swords } from 'lucide-react'

export const missionOptions = {
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
    description: 'Establish a colony on an empty planet slot.',
  },
}
export type DispatchMission = keyof typeof missionOptions
export const dispatchMissions = Object.keys(missionOptions) as DispatchMission[]
