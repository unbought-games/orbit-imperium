import { useEffect, useRef } from 'react'
import type { ShipSkin } from '../../apps/web/src/client-model/ship-appearance-types'
import type {
  ShipColors,
  InsigniaAppearance,
  EmblemTreatment,
  EmblemPlacement,
} from './types'
import { renderShipPixels } from './index.mjs'
import {
  loadShipPackage,
  loadEmblemAssets,
  installedPreviewUrl,
} from './browser-loader'
import { rasterizeInsignia } from './static-insignia'

export type ShipAppearancePreviewProps = {
  skin: ShipSkin
  colors: ShipColors
  emblem: InsigniaAppearance | null
  treatment: EmblemTreatment
  placement: EmblemPlacement
  className?: string
  alt?: string
  onError?: (message: string) => void
}
export function ShipAppearancePreview({
  skin,
  colors,
  emblem,
  treatment,
  placement,
  className,
  alt = 'Customized ship',
  onError,
}: ShipAppearancePreviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const fallback = useRef<HTMLImageElement>(null)
  const packageLoad = useRef<{
    key: string
    promise: ReturnType<typeof loadShipPackage>
  } | null>(null)
  const emblemLoad = useRef<{
    key: string
    promise: ReturnType<typeof rasterizeInsignia>
  } | null>(null)
  const errorCallback = useRef(onError)
  useEffect(() => {
    errorCallback.current = onError
  }, [onError])
  const skinKey = JSON.stringify({
    id: skin.id,
    package_revision: skin.package_revision,
    package_url: skin.package_url,
  })
  const emblemKey = JSON.stringify(emblem)
  useEffect(() => {
    let current = true
    const input = JSON.parse(skinKey) as ShipSkin
    if (packageLoad.current?.key !== skinKey)
      packageLoad.current = { key: skinKey, promise: loadShipPackage(input) }
    const loaded = packageLoad.current
    const appearance = JSON.parse(emblemKey) as InsigniaAppearance | null
    const textureKey = emblemKey + treatment
    if (
      appearance &&
      treatment !== 'none' &&
      emblemLoad.current?.key !== textureKey
    )
      emblemLoad.current = {
        key: textureKey,
        promise: loadEmblemAssets(appearance).then((assets) =>
          rasterizeInsignia(appearance, treatment, assets),
        ),
      }
    async function draw() {
      try {
        const [asset, texture] = await Promise.all([
          loaded.promise,
          appearance && treatment !== 'none'
            ? emblemLoad.current?.promise
            : null,
        ])
        if (!current || !canvas.current) return
        const pixels = renderShipPixels(
          asset,
          { primary: colors.primary, accent: colors.accent },
          texture ? { texture, treatment, placement } : null,
        )
        const node = canvas.current
        node.width = asset.manifest.width
        node.height = asset.manifest.height
        if (container.current)
          container.current.style.aspectRatio = `${node.width} / ${node.height}`
        const context = node.getContext('2d')
        if (!context) throw Error('Canvas unavailable')
        context.putImageData(
          new ImageData(new Uint8ClampedArray(pixels), node.width, node.height),
          0,
          0,
        )
        // Canvas pixels are the rendering output; visibility is local presentation,
        // not another persisted copy of the authoritative recipe or game state.
        node.style.opacity = '1'
        if (fallback.current) fallback.current.style.visibility = 'hidden'
      } catch (error) {
        if (current) {
          packageLoad.current = null
          emblemLoad.current = null
          errorCallback.current?.(
            error instanceof Error ? error.message : 'Ship preview unavailable',
          )
        }
      }
    }
    void draw()
    return () => {
      current = false
    }
  }, [skinKey, emblemKey, colors.primary, colors.accent, treatment, placement])
  return (
    <div
      ref={container}
      className={className}
      style={{ position: 'relative', aspectRatio: '3 / 2' }}
    >
      <img
        ref={fallback}
        src={installedPreviewUrl(skin)}
        alt=""
        aria-hidden="true"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          position: 'absolute',
          inset: 0,
        }}
      />
      <canvas
        ref={canvas}
        role="img"
        aria-label={alt}
        width={1536}
        height={1024}
        style={{
          position: 'relative',
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          opacity: 0,
        }}
      />
    </div>
  )
}
