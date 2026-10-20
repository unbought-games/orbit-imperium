import { ResourcesPage } from './progression/resources-page'
import { TechnologyPage } from './progression/technology-page'
import type { ProgressionProps } from './progression/shared'
export function Progression(props: ProgressionProps) {
  return props.page === 'resources' ? (
    <ResourcesPage {...props} />
  ) : (
    <TechnologyPage {...props} />
  )
}
