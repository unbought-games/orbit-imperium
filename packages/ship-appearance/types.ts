import type { components } from '../../apps/web/src/contracts'
export type InsigniaAppearance = components['schemas']['InsigniaAppearance']
export type ShipColors = { primary: string; accent: string }
export type EmblemTreatment = 'none' | 'full' | 'layers'
export type EmblemPlacement = 'near-wing' | 'paired'
export type PackageManifest = {
  version: 1
  id: string
  revision: string
  renderer: string
  target: { kind: 'Ship' | 'Defense' | 'Building'; id: string }
  collection_id: string
  view: string
  channels: ['primary', 'accent']
  map_encoding: 'rgba8-finish-decal-v1'
  color_space: 'srgb'
  alpha: 'straight-preserved'
  capabilities: {
    treatments: ['none', 'full', 'layers']
    placements: ['near-wing', 'paired']
  }
  width: number
  height: number
  reference: [string, string]
  maps: Record<
    'source' | 'material' | 'response' | 'receiver' | 'decalResponse',
    { file: string; sha256: string; bytes: number }
  >
  slots: { id: string; quad: [number, number][] }[]
  paint: { opacity: number; responseFloor: number; responseCeiling: number }
}
export type ShipPackage = { manifest: PackageManifest } & Record<
  'source' | 'material' | 'response' | 'receiver' | 'decalResponse',
  Uint8ClampedArray
>
export type EmblemTexture = {
  pixels: Uint8ClampedArray
  width: number
  height: number
}
