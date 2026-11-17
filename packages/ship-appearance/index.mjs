import { renderFinish } from './finish.mjs'
import { paintEmblems } from './emblem.mjs'
import {
  validateManifest,
  validateColors,
  validatePlacement,
} from './validation.mjs'
export {
  RENDERER_VERSION,
  validateRequest,
  validateManifest,
} from './validation.mjs'
export function renderShipPixels(asset, colors, emblem = null) {
  const { manifest, source, material, response, receiver, decalResponse } =
    asset
  validateManifest(manifest)
  validateColors(colors)
  const length = manifest.width * manifest.height * 4
  for (const pixels of [source, material, response, receiver, decalResponse])
    if (pixels.length !== length)
      throw Error('Package map dimensions do not match')
  const hull = renderFinish(
    source,
    material,
    { colors: [colors.primary, colors.accent] },
    { ...manifest, responseMap: response },
  )
  if (!emblem) return hull
  validatePlacement(emblem.treatment, emblem.placement)
  if (emblem.treatment === 'none') return hull
  if (
    !emblem.texture ||
    emblem.texture.width > 1024 ||
    emblem.texture.height > 1024 ||
    emblem.texture.width < 1 ||
    emblem.texture.height < 1
  )
    throw Error('Bounded insignia texture required')
  return paintEmblems(
    hull,
    emblem.texture,
    {
      ...manifest,
      slots:
        emblem.placement === 'near-wing'
          ? manifest.slots.slice(0, 1)
          : manifest.slots,
    },
    receiver,
    decalResponse,
  )
}
