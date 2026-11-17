import type { components } from '../contracts'

// OpenAPI owns the wire contract; consumers share these concise aliases.
export type ShipPaintRecipe = components['schemas']['ShipPaintRecipe']
export type ShipSkin = components['schemas']['ShipSkin']
export type ShipDye = components['schemas']['ShipDye']
export type ShipDesign = components['schemas']['ShipDesign']
export type ShipArtwork = components['schemas']['ShipArtwork']
export type ShipRenderRequest = components['schemas']['ShipRenderRequest']
export type ShipEquipment = components['schemas']['ShipEquipment']
export type ShipAppearanceState = components['schemas']['ShipAppearanceState']
export type ShipAppearanceAction = components['schemas']['ShipAppearanceAction']
export type ShipRenderStage = ShipRenderRequest['stage']
