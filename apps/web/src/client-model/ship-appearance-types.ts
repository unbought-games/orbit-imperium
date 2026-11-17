import type { components } from '../contracts'

export type ShipPaintRecipe = {
  version: 1
  skin_id: string
  package_revision: string
  primary: string
  accent: string
  emblem: { treatment: 'none' | 'full' | 'layers'; placement: 'near-wing' | 'paired' }
}
export type ShipSkin = {
  id: string
  name: string
  target: string
  package_revision: string
  package_url: string
  preview_url: string
  available: boolean
}
export type ShipDye = {
  id: string
  name: string
  color: string
  palette_id?: string
  availability: 'available' | 'locked' | 'unavailable'
}
export type ShipDesign = {
  id: string
  name: string
  target: string
  revision: number
  recipe: ShipPaintRecipe
}
export type ShipRenderStage = 'queued' | 'rendering' | 'preparing' | 'ready' | 'failed' | 'superseded' | 'canceled'
export type ShipArtwork = {
  id: string
  variants: { width: number; height: number; url: string }[]
}
export type ShipRenderRequest = {
  id: string
  stage: ShipRenderStage
  error?: string
  can_cancel: boolean
  can_retry: boolean
}
export type ShipEquipment = {
  target: string
  revision: number
  design_id: string | null
  design_revision: number | null
  render: ShipRenderRequest | null
  artwork: ShipArtwork | null
  fallback_reason?: string
}
export type ShipAppearanceState = {
  binding: components['schemas']['Binding']
  request_id: string
  catalog: ShipSkin[]
  dyes: ShipDye[]
  library: ShipDesign[]
  equipment: ShipEquipment[]
  emblem: components['schemas']['InsigniaAppearance'] | null
  emblem_revision: number
}
export type ShipAppearanceAction =
  | { type: 'Load' }
  | { type: 'Save'; design: ShipDesign; equip: boolean; expected_equipment_revision: number }
  | { type: 'Equip'; target: string; design_id: string; design_revision: number; expected_equipment_revision: number }
  | { type: 'Reset'; target: string; expected_equipment_revision: number }
  | { type: 'Cancel' | 'Retry'; request_id: string }
