import type { Page } from '@playwright/test'
import {
  resolvePlanetArt,
  resolveCatalogArt,
  atmosphereArt,
} from '../../src/ui/artwork'

/** Isolated asset review, deliberately separate from the game's UI and state. */
export async function artworkReviewFixture(page: Page) {
  const hero = resolvePlanetArt(4)
  const factory = resolveCatalogArt({ kind: 'Building', id: 'RoboticsFactory' })
  const ship = resolveCatalogArt({ kind: 'Ship', id: 'SmallCargo' })
  const portrait = (art: typeof hero, label: string, sizes: string) =>
    `<figure><img alt="${label}" src="${art.src}" srcset="${art.srcSet}" sizes="${sizes}" width="${art.width}" height="${art.height}"><figcaption>${label}</figcaption></figure>`
  await page.route('**/__atlas-review', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbit Imperium asset review</title><style>
      *{box-sizing:border-box}body{margin:0;color:#e9dfcb;background:#0d1827;font:16px/1.5 system-ui}main{max-width:1440px;margin:auto;padding:32px}h1{font:38px Georgia;margin:0 0 12px}p{color:#a4bbcb;margin:0 0 24px}.hero{display:grid;grid-template-columns:1fr 1fr;background:linear-gradient(90deg,#0d182722,#0d182777),url('${atmosphereArt.src}') center/cover;border-block:1px solid #cbb68d55}.objects{display:grid;grid-template-columns:1fr 1fr;align-items:center}figure{margin:0;min-width:0}img{display:block;width:100%;height:auto;object-fit:contain}figcaption{font-size:14px;text-align:center;color:#cbb68d;padding:0 8px 18px}.slots{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:32px}.slots img{max-width:160px;margin:auto}h2{font:26px Georgia;margin:32px 0 0}@media(max-width:600px){main{padding:20px}h1{font-size:28px}.hero{grid-template-columns:1fr}.objects{grid-template-columns:1fr 1fr}.slots{grid-template-columns:repeat(3,1fr)}.slots img{max-width:96px}figcaption{font-size:12px}}
    </style><main><h1>Orbit Imperium · art review</h1><p>Native artwork on navy. Hero, phone and thumbnail framing. This fixture is an asset inspection, not a game screen.</p><section class="hero">${portrait(hero, 'Copper world · slot 4', '(max-width: 600px) calc(100vw - 40px), 660px')}<div class="objects">${portrait(factory, 'Robotics Factory', '(max-width: 600px) calc((100vw - 40px) / 2), 330px')}${portrait(ship, 'Small Cargo', '(max-width: 600px) calc((100vw - 40px) / 2), 330px')}</div></section><h2>Fifteen distinct worlds</h2><section class="slots">${Array.from({ length: 15 }, (_, index) => portrait(resolvePlanetArt(index + 1), `Slot ${index + 1}`, '(max-width: 600px) 96px, 160px')).join('')}</section></main></html>`,
    }),
  )
}
