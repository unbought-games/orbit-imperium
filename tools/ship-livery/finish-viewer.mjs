import { renderFinish, finishPresets } from './finish-render.mjs'
import { renderLivery } from './render.mjs'
const $ = (s) => document.querySelector(s),
  canvas = $('#ship'),
  context = canvas.getContext('2d')
let recipe = structuredClone(finishPresets.rose)
const modes = {
  finished: [
    'Finished master · deterministic recolor',
    'Uses the approved finished image as its source. Color changes run locally, without AI calls.',
  ],
  gray: [
    'Original gray master · full coating',
    'Original gray pixels with full coverage and separate paint/metal tone curves. Reflections remain those of the gray source.',
  ],
  previous: [
    'Original gray master · previous masks',
    'The earlier partial-panel approach, shown with the same selected colors.',
  ],
  reference: [
    'Your supplied reference · unchanged',
    'The supplied AI-finished image. This comparison view does not respond to the color controls.',
  ],
  debug: [
    'Material regions · authoring inspection',
    'Red: painted hull. Green: metal trim and markings. Glass, engines and selected machinery are protected.',
  ],
}
const controls = () => [...document.querySelectorAll('input,select,button')]
controls().forEach((c) => (c.disabled = true))
async function pixels(path) {
  const i = new Image()
  i.src = path
  await i.decode()
  const c = document.createElement('canvas')
  c.width = i.width
  c.height = i.height
  const ctx = c.getContext('2d')
  ctx.drawImage(i, 0, 0)
  return ctx.getImageData(0, 0, i.width, i.height).data
}
try {
  const [gray, finished, mask, responseMap, oldMask, debug, asset] =
    await Promise.all([
      pixels('./concord-v1/master.png'),
      pixels('./concord-finish-v2/finished-master.png'),
      pixels('./output/finish/material-mask.png'),
      pixels('./output/finish/response-map.png'),
      pixels('./output/finish/previous-mask.png'),
      pixels('./output/finish/mask-debug.png'),
      fetch('./concord-v1/asset.json').then((r) => {
        if (!r.ok) throw Error('Missing asset')
        return r.json()
      }),
    ])
  function draw() {
    const mode = $('#method').value
    let output
    const start = performance.now()
    if (mode === 'reference') output = finished
    else if (mode === 'debug') output = debug
    else if (mode === 'previous')
      output = renderLivery(gray, oldMask, asset, {
        ...recipe,
        pattern: 'solid',
        emblem: 'none',
        finish: 'satin',
      })
    else
      output = renderFinish(mode === 'gray' ? gray : finished, mask, recipe, {
        mode,
        stage: 2,
        responseMap: mode === 'finished' ? responseMap : null,
      })
    context.putImageData(
      new ImageData(new Uint8ClampedArray(output), 1536, 1024),
      0,
      0,
    )
    $('#source-note').textContent = modes[mode][0]
    $('#method-note').textContent = modes[mode][1]
    $('#livery-name').textContent = recipe.label
    document
      .querySelectorAll('[data-preset]')
      .forEach((b) =>
        b.setAttribute(
          'aria-pressed',
          String(
            JSON.stringify(recipe.colors) ===
              JSON.stringify(finishPresets[b.dataset.preset].colors),
          ),
        ),
      )
    canvas.dataset.ready = 'true'
    canvas.dataset.mode = mode
    canvas.dataset.renderMs = String(performance.now() - start)
  }
  function sync() {
    $('#primary').value = recipe.colors[0]
    $('#accent').value = recipe.colors[1]
    draw()
  }
  for (const [key, preset] of Object.entries(finishPresets)) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.preset = key
    b.setAttribute('aria-label', preset.label)
    const s = document.createElement('span')
    s.className = 'swatches'
    s.setAttribute('aria-hidden', 'true')
    for (const color of preset.colors) {
      const i = document.createElement('i')
      i.style.backgroundColor = color
      s.append(i)
    }
    b.append(s, document.createTextNode(preset.label))
    b.onclick = () => {
      recipe = structuredClone(preset)
      if (['reference', 'debug'].includes($('#method').value))
        $('#method').value = 'finished'
      sync()
    }
    $('.finish-presets').append(b)
  }
  for (const [n, id] of ['primary', 'accent'].entries())
    $('#' + id).addEventListener('input', (e) => {
      recipe = {
        ...recipe,
        label: 'Your signature',
        colors: recipe.colors.map((v, i) => (i === n ? e.target.value : v)),
      }
      if (['reference', 'debug'].includes($('#method').value))
        $('#method').value = 'finished'
      draw()
    })
  $('#method').addEventListener('change', draw)
  $('#download').onclick = () => {
    const mode = $('#method').value
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob),
        a = document.createElement('a')
      a.download = `concord-${mode}.png`
      a.href = url
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }
  controls().forEach((c) => (c.disabled = false))
  $('#status').textContent = ''
  sync()
} catch (error) {
  $('#status').textContent =
    'Artwork could not load. Run npm run art:livery:finish and reload.'
  console.error(error)
}
