import { Worker } from 'node:worker_threads'
import sharp from 'sharp'
import { resolveEmblemAssets } from './assets.mjs'
import { RENDERER_VERSION } from '../../packages/ship-appearance/validation.mjs'
export function renderPixels(workerData, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const worker = new Worker(new URL('./pixel-worker.mjs', import.meta.url), {
      workerData,
    })
    const abort = () => {
      void worker.terminate()
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    worker.once('message', resolve)
    worker.once('error', reject)
    worker.once('exit', (code) => {
      signal.removeEventListener('abort', abort)
      if (code !== 0) reject(Error('Pixel renderer stopped'))
    })
  })
}
export async function renderRequest(
  request,
  { asset, browser, workerOrigin, bundled, config },
  signal,
) {
  if (
    request.package_id !== asset.manifest.id ||
    request.package_revision !== asset.manifest.revision
  )
    throw Error('Package is not installed')
  let emblem = null
  if (request.emblem && request.emblem.treatment !== 'none') {
    const assets = await resolveEmblemAssets(
      request.emblem.appearance,
      bundled,
      config,
      signal,
    )
    signal.throwIfAborted()
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    const abort = () => {
      void context.close()
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url())
        return url.origin === workerOrigin &&
          ['GET'].includes(route.request().method())
          ? route.continue()
          : route.abort()
      })
      const page = await context.newPage()
      await page.goto(workerOrigin + '/worker.html')
      await page.waitForFunction(
        () => typeof window.prepareInsignia === 'function',
      )
      await page.evaluate((input) => window.prepareInsignia(input), {
        appearance: request.emblem.appearance,
        treatment: request.emblem.treatment,
        assets,
      })
      const bytes = await page
        .locator('#texture')
        .screenshot({ omitBackground: true, animations: 'disabled' })
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      if (info.width !== 512 || info.height !== 576)
        throw Error('Unexpected insignia raster bounds')
      emblem = {
        texture: { pixels: data, width: info.width, height: info.height },
        treatment: request.emblem.treatment,
        placement: request.emblem.placement,
      }
    } finally {
      signal.removeEventListener('abort', abort)
      await context.close()
    }
  }
  signal.throwIfAborted()
  const variants = await renderPixels(
    { asset, colors: request.colors, emblem },
    signal,
  )
  return {
    version: 1,
    request_id: request.request_id,
    renderer_version: RENDERER_VERSION,
    variants,
  }
}
