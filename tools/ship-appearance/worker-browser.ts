import {
  staticInsigniaCss,
  staticInsigniaMarkup,
} from '../../packages/ship-appearance/static-insignia'
import type {
  InsigniaAppearance,
  EmblemTreatment,
} from '../../packages/ship-appearance/types'
const style = document.createElement('style')
style.textContent = `html,body{margin:0;background:transparent;}#texture{width:512px;height:576px;}\n${staticInsigniaCss}`
document.head.append(style)
declare global {
  interface Window {
    prepareInsignia: (input: {
      appearance: InsigniaAppearance
      treatment: EmblemTreatment
      assets: Record<string, string>
    }) => Promise<void>
  }
}
window.prepareInsignia = async ({ appearance, treatment, assets }) => {
  await Promise.all(
    Object.values(assets).map(async (src) => {
      const image = new Image()
      image.src = src
      await image.decode()
    }),
  )
  document.getElementById('texture')!.innerHTML = staticInsigniaMarkup(
    appearance,
    treatment,
    assets,
  )
}
