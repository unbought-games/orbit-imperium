import type { ComponentProps } from 'react'
import { Popover } from '../ui/popover'
import { Button } from '../ui/button'
import { coordinates as formatCoordinates } from '../ui/format'
import { BodyIllustration } from './body-illustration'
import { publicMoonBody } from './galaxy-body'
import {
  galaxyMissionActions,
  protectionExplanation,
} from './galaxy-mission-actions'
import { dispatchFailure } from '../client-model/dispatch-validation'
import { GalaxyActionMenu } from './galaxy-action-menu'
import type { GalaxyPosition } from './galaxy-position'
import styles from './galaxy.module.css'

type Props = Pick<
  ComponentProps<typeof GalaxyPosition>,
  | 'position'
  | 'player'
  | 'origin'
  | 'missions'
  | 'colony'
  | 'readOnly'
  | 'onDraft'
  | 'espionage'
>
export function GalaxyMoon({
  position,
  player,
  origin,
  missions,
  colony,
  readOnly,
  onDraft,
  espionage,
}: Props) {
  const moon = position.moon
  const body = publicMoonBody(position)
  if (!moon || !body) return null
  const target = `moon ${formatCoordinates({ coordinates: position.coordinates })}`
  const actions = galaxyMissionActions({
    position: { ...position, body, debris: null },
    player,
    origin,
    missions,
    colony,
  })
  const reason =
    body.attack_blocker === 'BeginnerProtected'
      ? protectionExplanation
      : body.attack_blocker
        ? dispatchFailure(body.attack_blocker)
        : !body.espionage_eligible
          ? 'Espionage unavailable'
          : espionage?.reason
  const illustration = (
    <BodyIllustration
      body={{ ...body, coordinates: position.coordinates }}
      className={styles.moonArt}
      sizes="32px"
    />
  )
  const details = `Diameter: ${moon.diameter_km.toLocaleString()} km`
  if (readOnly)
    return (
      <Popover
        placement="top"
        label={`Moon at ${formatCoordinates({ coordinates: position.coordinates })}`}
        className={styles.moonTrigger}
        trigger={illustration}
      >
        {details}
      </Popover>
    )
  return (
    <GalaxyActionMenu
      target={target}
      coordinates={position.coordinates}
      actions={actions}
      details={details}
      triggerElement={
        <Button variant="ghost" className={styles.moonTrigger}>
          {illustration}
        </Button>
      }
      missileIdentity={`${origin}:${body.id}`}
      quickSpy={
        body.owner !== player && body.id !== origin
          ? {
              send: () =>
                espionage
                  ? espionage.send()
                  : onDraft(
                      position.coordinates,
                      'Espionage',
                      undefined,
                      'moon',
                    ),
              disabled: !!reason || espionage?.busy || espionage?.paused,
              reason,
              count: espionage?.count,
            }
          : undefined
      }
      onDraft={(at, mission, opener) => onDraft(at, mission, opener, 'moon')}
    />
  )
}
