import { useEffect, useRef, useState } from 'react'
import { GalaxyActionsTrigger } from '../galaxy-actions-trigger'
import { ActionPopover } from '../../ui/action-popover'
import { resolveCatalogArt } from '../../ui/artwork'
import { useGameScreen } from '../../shell/screen-context'
import { routeTarget } from '../../shell/route-target'
import { Button, ButtonLink } from '../../ui/button'
import { ResourceSummary, NumberValue } from '../../ui/number-value'
import { label } from '../../ui/format'
import {
  personalSiteStatus,
  siteDispatchDraft,
  personalSiteTitle,
  type PersonalSite,
} from './galaxy-sites-model'
import styles from './galaxy-sites.module.css'

export function GalaxySite({
  site,
  origin,
  expanded,
  onToggle,
}: {
  site: PersonalSite
  origin: string
  expanded: boolean
  onToggle: () => void
}) {
  const art = resolveCatalogArt({ kind: 'Building', id: 'AllianceDepot' })
  const trigger = useRef<HTMLButtonElement>(null)
  const actions = useRef<HTMLButtonElement>(null)
  const [opener, setOpener] = useState<'identity' | 'actions'>('identity')
  const openFrom = (source: 'identity' | 'actions') => {
    setOpener(source)
    if (!expanded) onToggle()
  }
  const id = site.site.destination.selection.id
  useEffect(() => {
    if (expanded) {
      trigger.current?.scrollIntoView({ block: 'start' })
    }
  }, [expanded, id])
  return (
    <section
      className={styles.site}
      aria-label={personalSiteTitle(site)}
      data-completed={site.site.retired || undefined}
    >
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={`Inspect ${personalSiteTitle(site)}`}
        aria-expanded={expanded}
        aria-haspopup="dialog"
        onClick={() => openFrom('identity')}
      >
        <img
          className={styles.illustration}
          src={art.thumbnail}
          srcSet={art.srcSet}
          sizes="40px"
          width={40}
          height={40}
          alt=""
        />
        <span className={styles.identity}>
          <span className={styles.title}>{personalSiteTitle(site)}</span>
          <span className={styles.meta}>
            Personal site · {personalSiteStatus(site)}
          </span>
        </span>
      </button>
      <GalaxyActionsTrigger
        target={personalSiteTitle(site)}
        ref={actions}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onClick={() => openFrom('actions')}
      />
      <ActionPopover
        open={expanded}
        onOpenChange={(open) => {
          if (!open && expanded) onToggle()
        }}
        anchorRef={opener === 'actions' ? actions : trigger}
        title={personalSiteTitle(site)}
        description={`Personal site · ${personalSiteStatus(site)}`}
      >
        <SiteDetails site={site} origin={origin} />
      </ActionPopover>
    </section>
  )
}

function SiteDetails({ site, origin }: { site: PersonalSite; origin: string }) {
  const { view, prepareDispatch, universeName } = useGameScreen()
  const body = view.bodies.find((b) => b.id === origin)
  const draft = siteDispatchDraft(site, origin)
  const missing = site.recommended_ships.filter(
    (ship) =>
      !body?.inventories.some(
        (i) => i.item.id === ship && BigInt(i.count) > 0n,
      ),
  )
  return (
    <>
      <p className={styles.description}>
        {site.recommended_ships.includes('SmallCargo')
          ? 'A nearby stockpile to raid with your fighter and cargo ship. Bring the loot home to grow your colony.'
          : 'A small outpost near your planet. Send a Light Fighter to make first contact.'}
      </p>
      <p className={styles.meta}>Only visible to you · Nearby orbit</p>
      <dl className={styles.facts}>
        <div>
          <dt>Known defenses</dt>
          <dd>
            {site.remaining_forces.length
              ? site.remaining_forces.map((force, index) => (
                  <span key={index}>
                    {label(force.item.id)} × <NumberValue value={force.count} />
                  </span>
                ))
              : 'No remaining defenders'}
          </dd>
        </div>
        <div>
          <dt>Stockpile</dt>
          <dd>
            <ResourceSummary value={site.site.remaining_stock} />
          </dd>
        </div>
        <div>
          <dt>Recommended fleet</dt>
          <dd>{site.recommended_ships.map(label).join(' + ')}</dd>
        </div>
      </dl>
      {site.site.retired ? (
        <p className={styles.completed}>
          Mission completed. Any returning fleet continues home.
        </p>
      ) : site.busy ? (
        <>
          <p>Mission in progress.</p>
          <ButtonLink
            {...routeTarget(universeName, 'fleets', origin)}
            size="small"
          >
            Follow fleet
          </ButtonLink>
        </>
      ) : missing.length ? (
        <>
          <p>Build {missing.map(label).join(' + ')} to prepare your fleet.</p>
          <ButtonLink
            {...routeTarget(universeName, 'shipyard', origin, missing[0])}
            size="small"
          >
            Build recommended ships
          </ButtonLink>
        </>
      ) : (
        <Button
          size="small"
          onClick={() => {
            if (draft) prepareDispatch(draft)
          }}
        >
          Send fleet
        </Button>
      )}
      {!site.site.retired && (
        <p className={styles.lootNote}>
          Ships can take up to half the stockpile, limited by cargo space. Loot
          arrives when your fleet returns.
        </p>
      )}
    </>
  )
}
