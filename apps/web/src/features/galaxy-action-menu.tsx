import { Crosshair, Ellipsis, Recycle, Rocket, Truck } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import type { MissileLaunchPresentation } from './missile-launch-action'
import { Menu } from '@base-ui/react/menu'
import { Button } from '../ui/button'
import type { components } from '../contracts'
import type { DispatchDraft } from './missions'
import type { galaxyMissionActions } from './galaxy-mission-actions'
import styles from './galaxy.module.css'

const icons = {
  Transport: Truck,
  Deploy: Rocket,
  Attack: Crosshair,
  Colonize: Rocket,
  Harvest: Recycle,
}
export function GalaxyActionMenu({
  target,
  coordinates,
  actions,
  colonyNote,
  missileAction,
  onDraft,
}: {
  target: string
  coordinates: components['schemas']['Coordinates']
  actions: ReturnType<typeof galaxyMissionActions>
  colonyNote?: string | null
  missileAction?: (presentation: MissileLaunchPresentation) => ReactNode
  onDraft: (
    coordinates: components['schemas']['Coordinates'],
    mission: DispatchDraft['mission'],
    opener?: HTMLElement | null,
  ) => void
}) {
  const [missileOpen, setMissileOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const handingOff = useRef(false)
  const enabled = !!missileAction || actions.some((action) => !action.reason)
  return (
    <>
      <Menu.Root
        onOpenChange={(open) => {
          if (open) handingOff.current = false
        }}
      >
        <Menu.Trigger
          ref={trigger}
          render={<Button variant="ghost" className={styles.actionTrigger} />}
          aria-label={`Actions for ${target}`}
          disabled={!enabled}
          title={
            enabled
              ? `Actions for ${target}`
              : 'No applicable actions for this position'
          }
        >
          <span className={styles.actionText}>Actions</span>
          <Ellipsis
            className={styles.actionIcon}
            size={18}
            aria-hidden="true"
          />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            sideOffset={4}
            align="end"
            className={styles.menuPositioner}
          >
            <Menu.Popup
              finalFocus={() => !handingOff.current}
              className={styles.actionMenu}
              aria-label={`Missions to ${target}`}
            >
              {actions.map((action) => {
                const Icon = icons[action.mission]
                return (
                  <Menu.Item
                    key={action.mission}
                    className={styles.menuItem}
                    disabled={!!action.reason}
                    title={action.reason}
                    onClick={() => {
                      handingOff.current = action.mission === 'Harvest'
                      onDraft(coordinates, action.mission, trigger.current)
                    }}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {action.mission}
                  </Menu.Item>
                )
              })}
              {missileAction && (
                <Menu.Item
                  className={styles.menuItem}
                  onClick={() => {
                    handingOff.current = true
                    setMissileOpen(true)
                  }}
                >
                  <Rocket size={15} aria-hidden="true" />
                  Launch missiles
                </Menu.Item>
              )}
              {[
                ...new Set(
                  actions.flatMap((action) =>
                    action.reason ? [action.reason] : [],
                  ),
                ),
              ].map((reason) => (
                <p key={reason} className={styles.menuNote}>
                  {reason}
                </p>
              ))}
              {actions.some((action) => action.mission === 'Colonize') && (
                <p className={styles.menuNote}>
                  {colonyNote} Requires at least one Colony Ship.
                </p>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {missileAction?.({
        open: missileOpen,
        onOpenChange: setMissileOpen,
        opener: trigger,
      })}
    </>
  )
}
