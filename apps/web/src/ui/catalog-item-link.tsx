import type { components } from '../contracts'
import { useUniverseName } from '../shell/session-context'
import { catalogPage } from '../shell/catalog-routes'
import { routeTarget } from '../shell/route-target'
import { Link } from './link'
import { label } from './format'

export function CatalogItemLink({
  item,
  body,
  className,
}: {
  item: components['schemas']['CatalogKey3']
  body: string
  className?: string
}) {
  const universe = useUniverseName()
  return (
    <Link
      className={className}
      {...routeTarget(universe, catalogPage(item), body, item.id)}
    >
      {label(item.id)}
    </Link>
  )
}
