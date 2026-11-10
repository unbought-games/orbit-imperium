import { useRef, type RefObject } from 'react'
import type { Coordinator } from '../client-model/coordinator'
import type { HarvestPosition } from '../client-model/galaxy-harvest'
import { ActionSheet } from '../ui/action-sheet'
import { ActionPopover } from '../ui/action-popover'
import { useMobileLayout } from '../ui/use-mobile-layout'
import { useGalaxyHarvest } from './use-galaxy-harvest'
import { GalaxyHarvestForm } from './galaxy-harvest-form'

/** One controller and form; only the presentation changes across the breakpoint. */
export function GalaxyHarvestAction({
  model,
  origin,
  position,
  open,
  onClose,
  onCustomize,
  returnFocusRef,
}: {
  model: Coordinator
  returnFocusRef: RefObject<HTMLElement | null>
  origin: string
  position: HarvestPosition
  open: boolean
  onClose: () => void
  onCustomize: () => void
}) {
  const harvest = useGalaxyHarvest(model, origin, position, open, onClose)
  return (
    <GalaxyHarvestPresentation
      harvest={harvest}
      position={position}
      open={open}
      onClose={onClose}
      onCustomize={onCustomize}
      returnFocusRef={returnFocusRef}
      onRecover={() => {
        if (harvest.commandId) void model.recover(harvest.commandId)
      }}
    />
  )
}

/** The responsive surface owns focus and presentation; the action owns commands. */
export function GalaxyHarvestPresentation({
  harvest,
  position,
  open,
  onClose,
  onCustomize,
  returnFocusRef,
  onRecover,
}: {
  harvest: ReturnType<typeof useGalaxyHarvest>
  position: HarvestPosition
  open: boolean
  onClose: () => void
  onCustomize: () => void
  returnFocusRef: RefObject<HTMLElement | null>
  onRecover: () => void
}) {
  const mobile = useMobileLayout()
  const input = useRef<HTMLInputElement>(null)
  const { galaxy, system, position: slot } = position.coordinates
  const presentation = {
    open,
    onOpenChange: (next: boolean) => {
      if (!next) onClose()
    },
    title: 'Harvest mission',
    description: `Debris at [${galaxy}:${system}:${slot}]`,
  }
  const form = (
    <GalaxyHarvestForm
      harvest={harvest}
      position={position}
      inputRef={input}
      onCustomize={onCustomize}
      onRecover={onRecover}
    />
  )
  return mobile ? (
    <ActionSheet {...presentation} returnFocusRef={returnFocusRef}>
      {form}
    </ActionSheet>
  ) : (
    <ActionPopover
      {...presentation}
      anchorRef={returnFocusRef}
      initialFocusRef={
        harvest.busy || harvest.blockers.length ? undefined : input
      }
    >
      {form}
    </ActionPopover>
  )
}
