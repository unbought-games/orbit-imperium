import type { ComponentProps } from 'react'
import { Popover } from '../ui/popover'
import { coordinates as formatCoordinates } from '../ui/format'
import { BodyIllustration } from './body-illustration'
import { publicMoonBody } from './galaxy-body'
import {
  galaxyMissionActions,
  protectionExplanation,
} from './galaxy-mission-actions'
import { dispatchFailure } from '../client-model/dispatch-validation'
import { GalaxyActivity } from './galaxy-player-status'
import { GalaxySpyButton } from './galaxy-spy-button'
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
  return (
    <Popover
      placement="top"
      label={`Moon at ${formatCoordinates({ coordinates: position.coordinates })}`}
      className={styles.moonTrigger}
      trigger={
        <BodyIllustration
          body={{ ...body, coordinates: position.coordinates }}
          className={styles.moonArt}
          sizes="32px"
        />
      }
    >
      <p>
        Diameter: {moon.diameter_km.toLocaleString()} km{' '}
        <GalaxyActivity activity={body.activity} />
      </p>
      {!readOnly && (
        <>
          {body.owner !== player && body.id !== origin && (
            <GalaxySpyButton
              count={espionage?.count}
              name={`Moon ${formatCoordinates({ coordinates: position.coordinates })}`}
              reason={reason}
              busy={espionage?.busy}
              paused={espionage?.paused}
              error={espionage?.error}
              onSend={() =>
                espionage
                  ? espionage.send()
                  : onDraft(
                      position.coordinates,
                      'Espionage',
                      undefined,
                      'moon',
                    )
              }
            />
          )}
          <GalaxyActionMenu
            target={`moon ${formatCoordinates({ coordinates: position.coordinates })}`}
            coordinates={position.coordinates}
            actions={actions}
            missileIdentity={`${origin}:${body.id}`}
            onDraft={(at, mission, opener) =>
              onDraft(at, mission, opener, 'moon')
            }
          />
        </>
      )}
    </Popover>
  )
}
