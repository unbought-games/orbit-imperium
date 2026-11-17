import { renderLivery } from './render.mjs'
import { concepts, conceptPresets } from './concepts.mjs'
const $ = (s) => document.querySelector(s),
  canvas = $('#ship'),
  ctx = canvas.getContext('2d'),
  status = $('#status')
let selected = concepts[0].id,
  recipe = structuredClone(conceptPresets.graphite)
const controls = () => [...document.querySelectorAll('input,select,button')]
controls().forEach((c) => (c.disabled = true))
async function pixels(url) {
  const image = new Image()
  image.src = url
  await image.decode()
  const off = document.createElement('canvas')
  off.width = image.width
  off.height = image.height
  const context = off.getContext('2d')
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, off.width, off.height).data
}
try {
  // Preload both immutable source packages so rapid switching has no stale fetch race.
  const packages = new Map(
    await Promise.all(
      concepts.map(async (concept) => {
        const response = await fetch(`./${concept.id}/asset.json`)
        if (!response.ok) throw Error('Asset metadata unavailable')
        const asset = await response.json()
        const [source, mask] = await Promise.all([
          pixels(`./${concept.id}/${asset.master}`),
          pixels(`./output/concepts/${concept.id}/mask.png`),
        ])
        return [concept.id, { asset, source, mask }]
      }),
    ),
  )
  function draw() {
    const { asset, source, mask } = packages.get(selected),
      concept = concepts.find((c) => c.id === selected),
      view = $('#view').value
    const rendered = renderLivery(source, mask, asset, recipe, {
      original: view === 'original',
      debug: view === 'debug',
    })
    ctx.putImageData(new ImageData(rendered, asset.width, asset.height), 0, 0)
    $('#ship-name').textContent = concept.name
    $('#principle').textContent = concept.principle
    $('#description').textContent = concept.description
    $('#livery-name').textContent = recipe.label
    canvas.setAttribute(
      'aria-label',
      `${concept.name} Light Fighter — ${view === 'livery' ? recipe.label : view}`,
    )
    document
      .querySelectorAll('button[data-ship]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.ship === selected)),
      )
    document
      .querySelectorAll('[data-preset]')
      .forEach((b) =>
        b.setAttribute(
          'aria-pressed',
          String(
            JSON.stringify(recipe.colors) ===
              JSON.stringify(conceptPresets[b.dataset.preset].colors),
          ),
        ),
      )
    $('.mask-key').hidden = view !== 'debug'
    canvas.dataset.ship = selected
    canvas.dataset.ready = 'true'
  }
  function sync() {
    $('#primary').value = recipe.colors[0]
    $('#accent').value = recipe.colors[1]
    draw()
  }
  for (const [key, preset] of Object.entries(conceptPresets)) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.preset = key
    b.setAttribute('aria-label', preset.label)
    const swatches = document.createElement('span')
    swatches.className = 'swatches'
    swatches.setAttribute('aria-hidden', 'true')
    for (const color of preset.colors) {
      const swatch = document.createElement('i')
      swatch.style.backgroundColor = color
      swatches.append(swatch)
    }
    b.append(swatches, document.createTextNode(preset.label))
    b.onclick = () => {
      recipe = { ...recipe, label: preset.label, colors: [...preset.colors] }
      $('#view').value = 'livery'
      sync()
    }
    $('.concept-presets').append(b)
  }
  document.querySelectorAll('button[data-ship]').forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.ship
        draw()
      }),
  )
  for (const [i, id] of ['primary', 'accent'].entries())
    $('#' + id).addEventListener('input', (e) => {
      recipe = {
        ...recipe,
        label: 'Your signature',
        colors: recipe.colors.map((v, j) => (i === j ? e.target.value : v)),
      }
      $('#view').value = 'livery'
      draw()
    })
  $('#view').addEventListener('change', draw)
  $('#markings').addEventListener('change', (e) => {
    recipe = {
      ...recipe,
      pattern: e.target.value === 'bands' ? 'bands' : 'solid',
      emblem: e.target.value === 'chevron' ? 'chevron' : 'none',
    }
    $('#view').value = 'livery'
    draw()
  })
  $('#download').onclick = () => {
    const name = selected,
      view = $('#view').value
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob),
        a = document.createElement('a')
      a.href = url
      a.download = `${name}-${view}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }
  controls().forEach((c) => (c.disabled = false))
  status.textContent = ''
  sync()
} catch (error) {
  status.textContent =
    'The concept artwork could not load. Run npm run art:livery:concepts, then reload.'
  console.error(error)
}
