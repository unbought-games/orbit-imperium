import { DurationValue, ResourceNumber } from '../../ui/number-value'
import { progressionCommand } from './options'
import { ArrowLeft, ArrowDown, ArrowUp, Info } from 'lucide-react'
import { Button } from '../../ui/button'
import { CatalogImage } from '../../ui/image-catalog'
import { ResourceCosts } from '../../ui/resource-costs'
import { Requirements } from '../../ui/requirements'
import { label } from '../../ui/format'
import { ProgressionBlockers } from './quote-review'
import { pending, type ProgressionProps } from './shared'
import type { BoundProgressionOptions } from '../../client-model/commands'
import type { CatalogContent } from './catalog-content'
import styles from './building-details.module.css'
import { buildingProgress } from '../../client-model/building-progress'
import { buildingUnavailableReason } from './building-availability'
import { ConstructionDetails } from './construction-details'
import { ObjectOrbit } from './progression-world'
export function BuildingDetails({
  building,
  level,
  proposal,
  loading,
  error,
  action,
  onInspect,
  onClose,
  ...props
}: ProgressionProps & {
  building: CatalogContent
  level: number
  proposal: BoundProgressionOptions | null
  loading: boolean
  error: string
  action: 'Upgrade' | 'Demolition'
  onInspect: (action: 'Upgrade' | 'Demolition') => void
  onClose: () => void
}) {
  const { view, body, coordinator: model } = props
  const progress = buildingProgress(model.store.getState(), body.id)
  const work = progress?.building === building.id ? progress : null
  const title = label(building.id)
  const terms = proposal?.terms?.type === 'Building' ? proposal.terms : null
  const entry = view.catalog.find(
    (entry) => entry.key.kind === 'Building' && entry.key.id === building.id,
  )
  const unavailable = buildingUnavailableReason(entry, body, building.id)
  const command = progressionCommand(proposal)
  const energy = proposal?.building_energy
  const energyChange = energy
    ? BigInt(energy.target_consumption) - BigInt(energy.current_consumption)
    : null
  return (
    <>
      <div className={styles.header}>
        <button type="button" aria-label="Dismiss quote" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <h2>{title}</h2>
        <span>Level {level}</span>
      </div>
      <div className={styles.body}>
        <ObjectOrbit>
          <CatalogImage art={building.art} className={styles.art} />
        </ObjectOrbit>
        <div className={styles.details}>
          <section aria-label="Building requirements">
            <h3>Requirements</h3>
            {unavailable && <p>{unavailable}</p>}
            {entry?.requirements.length ? (
              <Requirements
                requirements={entry.requirements}
                view={view}
                body={body}
              />
            ) : (
              <p>
                {entry
                  ? 'No prerequisites listed in this universe’s catalog.'
                  : 'Prerequisites unavailable.'}
              </p>
            )}
          </section>
          {work ? (
            <ConstructionDetails work={work} model={model} />
          ) : unavailable ? null : (
            <>
              <div className={styles.facts}>
                {loading ? (
                  <p role="status">Loading building details…</p>
                ) : error ? (
                  <p role="alert">
                    {error}{' '}
                    <Button variant="quiet" onClick={() => onInspect(action)}>
                      Retry
                    </Button>
                  </p>
                ) : (
                  terms && (
                    <dl>
                      <div>
                        <dt>Production duration:</dt>
                        <dd>
                          <DurationValue milliseconds={terms.duration_ms} />
                        </dd>
                      </div>
                      <div>
                        <dt>Construction possible:</dt>
                        <dd>
                          {proposal?.blockers.length
                            ? 'Requirements not met'
                            : 'Now'}
                        </dd>
                      </div>
                      <div>
                        <dt>Construction energy required:</dt>
                        <dd>
                          <ResourceNumber value={terms.required_energy} />
                        </dd>
                      </div>
                      {energyChange !== null && (
                        <div>
                          <dt>
                            {action === 'Upgrade'
                              ? 'Additional operating energy'
                              : 'Operating energy saved'}{' '}
                            (100%):
                          </dt>
                          <dd>
                            <ResourceNumber
                              value={
                                action === 'Upgrade'
                                  ? energyChange
                                  : -energyChange
                              }
                            />
                          </dd>
                        </div>
                      )}
                    </dl>
                  )
                )}
                {(level > 0 || action === 'Demolition') && (
                  <Button
                    variant="quiet"
                    className={styles.demolish}
                    aria-label={
                      action === 'Upgrade'
                        ? `Demolish ${title}`
                        : `Review upgrade ${title}`
                    }
                    disabled={loading}
                    onClick={() =>
                      onInspect(action === 'Upgrade' ? 'Demolition' : 'Upgrade')
                    }
                  >
                    {action === 'Upgrade' ? (
                      <ArrowDown size={20} />
                    ) : (
                      <ArrowUp size={20} />
                    )}
                    {action === 'Upgrade' ? 'Tear down' : 'Upgrade'}
                  </Button>
                )}
              </div>
              {proposal && <ProgressionBlockers proposal={proposal} />}
              {terms && (
                <div className={styles.purchase}>
                  <div>
                    <p>
                      {action === 'Upgrade'
                        ? 'Required to improve'
                        : 'Tear down'}{' '}
                      to level {terms.target_level}:
                    </p>
                    <ResourceCosts cost={terms.paid} available={body.amounts} />
                  </div>
                  <Button
                    className={
                      action === 'Upgrade' ? styles.improve : styles.destroy
                    }
                    data-analytics={
                      action === 'Upgrade'
                        ? 'confirm_upgrade'
                        : 'confirm_demolition'
                    }
                    aria-label={`Confirm ${action.toLowerCase()}`}
                    disabled={
                      loading ||
                      !command ||
                      !!proposal?.blockers.length ||
                      (!!command && pending(model, command))
                    }
                    onClick={() => {
                      if (command) {
                        void model.send(command, proposal ?? undefined)
                      }
                    }}
                  >
                    {action === 'Upgrade'
                      ? `Upgrade to level ${terms.target_level}`
                      : `Demolish to level ${terms.target_level}`}
                  </Button>
                </div>
              )}
              {!loading && !terms && !error && (
                <p>Construction is unavailable.</p>
              )}
            </>
          )}
        </div>
      </div>
      <div className={styles.description}>
        <Info size={17} aria-hidden="true" />
        <p>{building.description}</p>
      </div>
      {!work && (
        <details className={styles.requirements}>
          <summary>Construction terms</summary>
          <p>Full refund if cancelled before completion.</p>
          {proposal && (
            <p>Confirmed {new Date(proposal.as_of_ms).toLocaleString()}</p>
          )}
        </details>
      )}
    </>
  )
}
