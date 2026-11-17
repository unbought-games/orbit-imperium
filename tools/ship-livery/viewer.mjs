import { renderLivery, presets } from './render.mjs'
const canvas = document.querySelector('#ship'),
  ctx = canvas.getContext('2d'),
  status = document.querySelector('#status')
let recipe = structuredClone(presets.porcelain)
const controls = [...document.querySelectorAll('input,select,button')]
controls.forEach((c) => (c.disabled = true))
async function pixels(url) {
  const img = new Image()
  img.src = url
  await img.decode()
  const off = document.createElement('canvas')
  off.width = img.naturalWidth
  off.height = img.naturalHeight
  const c = off.getContext('2d')
  c.drawImage(img, 0, 0)
  return c.getImageData(0, 0, off.width, off.height).data
}
try {
  const response = await fetch('./light-fighter-v1/asset.json')
  if (!response.ok) throw Error('Asset metadata unavailable')
  const asset = await response.json()
  const [source, mask] = await Promise.all([
    pixels('./light-fighter-v1/master.png'),
    pixels('./output/mask.png'),
  ])
  function draw() {
    const result = renderLivery(source, mask, asset, recipe, {
      original: document.querySelector('#original').checked,
      debug: document.querySelector('#debug').checked,
    })
    ctx.putImageData(new ImageData(result, asset.width, asset.height), 0, 0)
    document.querySelector('#livery-name').textContent = recipe.label
    document
      .querySelectorAll('.presets button')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(recipe.label === b.textContent)),
      )
  }
  function sync() {
    recipe.colors.forEach(
      (v, i) => (document.querySelector(`#color-${i}`).value = v),
    )
    for (const key of ['pattern', 'emblem', 'finish'])
      document.querySelector(`#${key}`).value = recipe[key]
    draw()
  }
  for (const preset of Object.values(presets)) {
    const b = document.createElement('button')
    b.textContent = preset.label
    b.onclick = () => {
      recipe = structuredClone(preset)
      document.querySelector('#original').checked = false
      sync()
    }
    document.querySelector('.presets').append(b)
  }
  for (let i = 0; i < 3; i++)
    document.querySelector(`#color-${i}`).addEventListener('input', (e) => {
      recipe = {
        ...recipe,
        label: 'Your signature',
        colors: recipe.colors.map((c, j) => (i === j ? e.target.value : c)),
      }
      draw()
    })
  for (const key of ['pattern', 'emblem', 'finish'])
    document.querySelector(`#${key}`).addEventListener('change', (e) => {
      recipe = { ...recipe, label: 'Your signature', [key]: e.target.value }
      draw()
    })
  for (const id of ['debug', 'original'])
    document.querySelector(`#${id}`).addEventListener('change', draw)
  document.querySelector('#download').onclick = () =>
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob),
        a = document.createElement('a')
      a.download = 'orbit-light-fighter.png'
      a.href = url
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  controls.forEach((c) => (c.disabled = false))
  status.textContent = ''
  sync()
  canvas.dataset.ready = 'true'
} catch (error) {
  status.textContent =
    'The fighter could not load. Run the asset export and reload.'
  console.error(error)
}
