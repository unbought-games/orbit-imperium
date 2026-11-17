import { shipCustomizationEnabled } from '../client-model/ship-customization-enabled'
import { ShipyardPage } from './shipyard/shipyard-page'
import { ResourcesPage } from './progression/resources-page'
import { TechnologyPage } from './progression/technology-page'
import type { ProgressionProps } from './progression/shared'
export function Progression(props: ProgressionProps) {
  if (shipCustomizationEnabled && props.page === 'shipyard')
    return <ShipyardPage {...props} />
  return props.page === 'resources' ? (
    <ResourcesPage {...props} />
  ) : (
    <TechnologyPage {...props} />
  )
}
