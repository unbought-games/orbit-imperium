import type {
  ShipPackage,
  ShipColors,
  EmblemTexture,
  EmblemTreatment,
  EmblemPlacement,
  PackageManifest,
} from './types'
export const RENDERER_VERSION: string
export function validateManifest(manifest: unknown): PackageManifest
export function validateRequest(request: unknown): unknown
export function renderShipPixels(
  asset: ShipPackage,
  colors: ShipColors,
  emblem?: {
    texture: EmblemTexture
    treatment: EmblemTreatment
    placement: EmblemPlacement
  } | null,
): Uint8ClampedArray
