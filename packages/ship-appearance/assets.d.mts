import type { InsigniaAppearance } from './types'
export function sha256(bytes: ArrayBuffer): Promise<string>
export function checkedAssetBytes(
  bytes: ArrayBuffer,
  reference: string,
): Promise<string>
export function appearanceAssetUrls(appearance: InsigniaAppearance): string[]
export function withEmbeddedAssets(
  appearance: InsigniaAppearance,
  assets: Record<string, string>,
): InsigniaAppearance
