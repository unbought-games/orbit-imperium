import { renderToStaticMarkup } from 'react-dom/server'
import { EmpireInsignia } from '../../apps/web/src/features/empire-insignia'
import insigniaCss from '../../apps/web/src/features/insignia.module.css?inline'
import treatmentCss from '../../apps/web/src/features/rewards/cosmetic-treatment.module.css?inline'
import { treatmentPatterns } from '../../apps/web/src/client-model/cosmetic-treatment'
import { withEmbeddedAssets } from './assets.mjs'
import type {
  InsigniaAppearance,
  EmblemTreatment,
  EmblemTexture,
} from './types'

// Same integer texture geometry and explicit treatment from the accepted proof.
// Freeze the existing reduced-motion treatment appearance, including named dyes.
export const staticInsigniaCss = `${insigniaCss}\n${treatmentCss}\n
.ship-static, .ship-static * { box-sizing:border-box; }
.ship-static { width:512px;height:576px;display:flex;align-items:center;justify-content:center;background:transparent;--pointer-x:50%;--pointer-y:40%; }
.ship-static > span { width:512px!important;height:576px!important;box-shadow:none!important;transform:none!important;transition:none!important; }
.ship-static > span[data-shape]:not([data-shape='shield']) { height:512px!important; }
.ship-static * { animation:none!important;transition:none!important; }
.ship-static.layers > span { background:transparent!important;border-color:transparent!important; }
.ship-static.layers > span[data-shape='diamond'],.ship-static.layers > span[data-shape='hexagon'] { border:0!important; }
`
export function staticInsigniaMarkup(
  appearance: InsigniaAppearance,
  treatment: EmblemTreatment,
  assets: Record<string, string>,
) {
  for (const item of [
    appearance.rendering?.finish,
    appearance.rendering?.effect,
  ]) {
    if (
      item &&
      item.renderer !== 'plain' &&
      !Object.hasOwn(treatmentPatterns, String(item.parameters.pattern))
    )
      throw Error('Unsupported static insignia treatment')
  }
  return renderToStaticMarkup(
    <div className={`ship-static ${treatment}`}>
      <EmpireInsignia
        appearance={withEmbeddedAssets(appearance, assets)}
        size="large"
      />
    </div>,
  )
}
export async function rasterizeInsignia(
  appearance: InsigniaAppearance,
  treatment: EmblemTreatment,
  assets: Record<string, string>,
): Promise<EmblemTexture> {
  const markup = staticInsigniaMarkup(appearance, treatment, assets)
  // All resources are verified and embedded. A data SVG keeps foreignObject's
  // origin clean; blob SVG URLs would taint Canvas in Chromium.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="576"><foreignObject width="512" height="576"><div xmlns="http://www.w3.org/1999/xhtml"><style>${staticInsigniaCss}</style>${markup}</div></foreignObject></svg>`
  const image = new Image()
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 576
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw Error('Canvas unavailable')
  context.drawImage(image, 0, 0)
  return {
    pixels: context.getImageData(0, 0, 512, 576).data,
    width: 512,
    height: 576,
  }
}
