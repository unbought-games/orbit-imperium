import { useState } from 'react'
import type { components } from '../../contracts'
import type { ShipEquipment } from '../../client-model/ship-appearance-types'
import { resolveCatalogArt } from '../../ui/artwork'
import { resolveShipAppearanceArt } from './ship-appearance-art'

/** Decorative ship art. A failed asset must never hide the recognizable craft. */
export function ShipAppearanceImage({
  item,
  equipment,
  className,
  sizes,
  width,
  height,
}: {
  item: components['schemas']['CatalogKey3']
  equipment?: readonly ShipEquipment[]
  className?: string
  sizes: string
  width?: number
  height?: number
}) {
  const art = resolveShipAppearanceArt(item, equipment)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const display = failedSource === art.src ? resolveCatalogArt(item) : art
  return (
    <img
      className={className}
      src={display.src}
      srcSet={display.srcSet}
      sizes={sizes}
      width={width ?? display.width}
      height={height ?? display.height}
      alt=""
      decoding="async"
      onError={() => setFailedSource(art.src)}
    />
  )
}
