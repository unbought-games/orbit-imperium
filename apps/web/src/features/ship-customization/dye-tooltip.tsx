import { ArrowUpRight } from 'lucide-react'
import { Tooltip } from '@base-ui/react/tooltip'
import type { ShipDye } from '../../client-model/ship-appearance-types'
import { useOptionalCommunityRewards } from '../../shell/community-rewards-context'
import { pendingChoices } from '../../client-model/community-rewards'
import type { CommunityOwner } from '../../adapters/community-rewards'
import tooltipStyles from '../../ui/info-tooltip.module.css'
import styles from './ship-customizer.module.css'

export function dyeUnlockHint(dye: ShipDye, owner?: CommunityOwner) {
  if (dye.availability === 'available') return ''
  const offer =
    owner?.program.status === 'active' &&
    owner.capabilities.claim &&
    pendingChoices(owner).find((milestone) =>
      milestone.options.some(
        (choice) =>
          choice.kind === 'dye' &&
          choice.item_id === dye.id &&
          !choice.owned &&
          choice.supported,
      ),
    )
  if (offer) {
    const name = offer.threshold
      ? `${offer.threshold} Renown`
      : 'Welcome reward'
    return `Available to claim in Community rewards under “${name}”.`
  }
  if (dye.access === 'earned')
    return 'Reward dye. Claim it permanently when it appears in your Renown choices. Members earn it this way too.'
  if (dye.access === 'membership')
    return 'Activate membership to use this dye, or claim it permanently if it appears in your rewards.'
  return 'Check your membership and permanent reward choices in Community rewards.'
}

export function DyeUnlockDetails({
  dye,
  guideHref,
}: {
  dye: ShipDye
  guideHref: string
}) {
  const rewards = useOptionalCommunityRewards()
  return (
    <>
      {dye.availability === 'unavailable' && (
        <p>Access could not be verified. Try again shortly.</p>
      )}
      <p>{dyeUnlockHint(dye, rewards?.owner)}</p>
      <a
        className={styles.unlockLink}
        href={guideHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        How to unlock dyes <ArrowUpRight size={14} aria-hidden="true" />
      </a>
    </>
  )
}

export function DyeTooltip({
  handle,
  id,
}: {
  handle: Tooltip.Handle<ShipDye>
  id: string
}) {
  return (
    <Tooltip.Root handle={handle}>
      {({ payload: dye }) =>
        dye && (
          <Tooltip.Portal>
            <Tooltip.Positioner
              className={styles.dyeTooltipPositioner}
              side="top"
              sideOffset={9}
              collisionPadding={12}
            >
              <Tooltip.Popup
                role="tooltip"
                id={id}
                className={tooltipStyles.popup}
              >
                <strong>{dye.name}</strong>
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        )
      }
    </Tooltip.Root>
  )
}
