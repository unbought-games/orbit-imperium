import { Crosshair, Eye, Recycle, Rocket, Truck } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react'
import type { MissileLaunchPresentation } from './missile-launch-action'
import { Menu } from '@base-ui/react/menu'
import { GalaxyActionsTrigger } from './galaxy-actions-trigger'
import type { components } from '../contracts'
import type { DispatchDraft } from './missions'
import type { galaxyMissionActions } from './galaxy-mission-actions'
import styles from './galaxy.module.css'

const icons = {
  Transport: Truck,
  Deploy: Rocket,
  Attack: Crosshair,
  Espionage: Eye,
  Colonize: Rocket,
  Harvest: Recycle,
}
export function GalaxyActionMenu({
  target,
  coordinates,
  actions,
  colonyNote,
  missileAction,
  missileIdentity,
  onDraft,
  quickSpy,
  triggerElement,
  triggerLabel,
  details,
}: {
  triggerElement?: ReactElement
  triggerLabel?: string
  details?: ReactNode
  quickSpy?: {
    send: () => void
    disabled?: boolean
    reason?: string | null
    count?: string
  }
  target: string
  coordinates: components['schemas']['Coordinates']
  actions: ReturnType<typeof galaxyMissionActions>
  colonyNote?: string | null
  missileIdentity: string
  missileAction?: (presentation: MissileLaunchPresentation) => ReactNode
  onDraft: (
    coordinates: components['schemas']['Coordinates'],
    mission: DispatchDraft['mission'],
    opener?: HTMLElement | null,
  ) => void
}) {
  const [missileSelection, setMissileSelection] = useState<string | null>(null)
  const availableMissileIdentity = missileAction ? missileIdentity : null
  // Invalidate only the launch selection; Harvest still needs this row's trigger.
  useEffect(() => {
    setMissileSelection((selection) =>
      selection === availableMissileIdentity ? selection : null,
    )
  }, [availableMissileIdentity])
  const trigger = useRef<HTMLButtonElement>(null)
  const handingOff = useRef(false)
  const enabled =
    !!details ||
    !!quickSpy ||
    !!missileAction ||
    actions.some((action) => !action.reason)
  return (
    <>
      <Menu.Root
        onOpenChange={(open) => {
          if (open) handingOff.current = false
        }}
      >
        <Menu.Trigger
          ref={trigger}
          render={triggerElement ?? <GalaxyActionsTrigger target={target} />}
          aria-label={triggerLabel ?? `Actions for ${target}`}
          disabled={!enabled}
          title={
            enabled
              ? `Actions for ${target}`
              : 'No applicable actions for this position'
          }
        />
        <Menu.Portal>
          <Menu.Positioner
            sideOffset={4}
            align={triggerElement ? 'start' : 'end'}
            className={styles.menuPositioner}
          >
            <Menu.Popup
              finalFocus={() => !handingOff.current}
              className={styles.actionMenu}
              aria-label={`Missions to ${target}`}
            >
              {details && <div className={styles.menuNote}>{details}</div>}
              {quickSpy && (
                <Menu.Item
                  className={styles.menuItem}
                  disabled={quickSpy.disabled}
                  title={quickSpy.reason ?? undefined}
                  onClick={quickSpy.send}
                >
                  <Eye size={16} aria-hidden="true" />
                  Spy
                  {quickSpy.count && quickSpy.count !== '1'
                    ? ` (${quickSpy.count} probes)`
                    : ''}
                </Menu.Item>
              )}
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
                    {action.mission === 'Espionage'
                      ? 'Spy with…'
                      : action.mission}
                  </Menu.Item>
                )
              })}
              {missileAction && (
                <Menu.Item
                  className={styles.menuItem}
                  onClick={() => {
                    handingOff.current = true
                    setMissileSelection(missileIdentity)
                  }}
                >
                  <Rocket size={15} aria-hidden="true" />
                  Launch missiles
                </Menu.Item>
              )}
              {[
                ...new Set([
                  ...(quickSpy?.reason ? [quickSpy.reason] : []),
                  ...actions.flatMap((action) =>
                    action.reason ? [action.reason] : [],
                  ),
                ]),
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
        open: missileSelection === missileIdentity,
        onOpenChange: (open) =>
          setMissileSelection(open ? missileIdentity : null),
        opener: trigger,
      })}
    </>
  )
}
