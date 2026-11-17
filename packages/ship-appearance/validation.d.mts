import type {
  InsigniaAppearance,
  PackageManifest,
  ShipColors,
  EmblemTreatment,
  EmblemPlacement,
} from './types'
export const RENDERER_VERSION: string
export const MAX_REQUEST_BYTES: number
export const MAX_ASSET_BYTES: number
export const MAX_OUTPUT_BYTES: number
export function validateColors(value: unknown): asserts value is ShipColors
export function validatePlacement(
  treatment: EmblemTreatment,
  placement: EmblemPlacement,
): void
export function validateAppearance(
  value: unknown,
): asserts value is InsigniaAppearance
export function validateManifest(value: unknown): PackageManifest
export function validateRequest(value: unknown): unknown
export function validateAssetReference(value: unknown): URL
