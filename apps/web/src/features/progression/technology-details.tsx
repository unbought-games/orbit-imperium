import { progressionCommand } from './options'
import { useEffect, useRef } from 'react'
import { ArrowLeft, Info, Network } from 'lucide-react'
import { Button } from '../../ui/button'
import { Field, Input } from '../../ui/form'
import { CatalogImage } from '../../ui/image-catalog'
import { ResourceCosts } from '../../ui/resource-costs'
import { label, costs } from '../../ui/format'
import { ProgressionBlockers } from './quote-review'
import { pending, type ProgressionProps } from './shared'
import { catalogContent } from './catalog-content'
import type { BoundProgressionOptions } from '../../client-model/commands'
import type { components } from '../../contracts'
import styles from './building-details.module.css'
import local from './technology-page.module.css'
import { ResearchWorkDetails } from './research-work-details'
import { researchProgress } from '../../client-model/research-progress'
import { useManufacturingOrder } from './use-manufacturing-order'
import { ObjectOrbit } from './progression-world'
import { unitCounts } from './unit-counts'
export function TechnologyDetails({
  entry,
  count,
  proposal,
  loading,
  error,
  quantity,
  onQuantity,
  onInspect,
  onClose,
  onTechnology,
  ...props
}: ProgressionProps & {
  entry: components['schemas']['CatalogEntry3']
  count: number | string
  proposal: BoundProgressionOptions | null
  loading: boolean
  error: string
  quantity: string
  onQuantity: (value: string) => void
  onInspect: () => void
  onClose: () => void
  onTechnology: () => void
}) {
  const { coordinator: model, body, page } = props
  const research = researchProgress(model.store.getState())
  const activeResearch =
    entry.key.kind === 'Research' && research?.research === entry.key.id
      ? research
      : null
  const quantityInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (error.startsWith('Enter a positive')) quantityInput.current?.focus()
  }, [error])
  const content = catalogContent(entry.key)
  const manufacture = entry.key.kind === 'Ship' || entry.key.kind === 'Defense'
  const order = useManufacturingOrder(
    model,
    props.view,
    manufacture ? proposal : null,
    quantity,
    onInspect,
  )
  const display = manufacture ? order.preview : proposal
  const terms = display?.terms
  const material =
    terms?.type === 'Research' || terms?.type === 'Manufacture' ? terms : null
  const command = progressionCommand(proposal)
  const title = label(entry.key.id)
  const confirmed = model.store.getState().view
  const inventoryView =
    confirmed && confirmed.protocol !== 2 ? confirmed : props.view
  const inventory = unitCounts(
    inventoryView,
    inventoryView.bodies.find((x) => x.id === body.id) ?? body,
    entry,
  )
  const orderTitle = page === 'shipyard' ? 'Shipyard' : 'Defenses'
  return (
    <>
      <div className={styles.header}>
        <button type="button" aria-label="Dismiss quote" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <h2>{title}</h2>
        {!manufacture && <span>Level: {count}</span>}
      </div>
      <div className={styles.body}>
        <div
          className={`${local.portrait} ${entry.key.kind === 'Ship' ? local.shipPortrait : ''}`}
        >
          <ObjectOrbit>
            <CatalogImage art={content.art} />
          </ObjectOrbit>
          {manufacture && (
            <dl className={local.inventory} aria-label="Unit inventory">
              <div>
                <dt>Stationed</dt>
                <dd>{inventory.stationed}</dd>
              </div>
              {inventory.flying !== null && (
                <div>
                  <dt>In flight from here</dt>
                  <dd>{inventory.flying}</dd>
                </div>
              )}
              <div>
                <dt>On order</dt>
                <dd>{inventory.ordered}</dd>
              </div>
            </dl>
          )}
        </div>
        <div className={styles.details}>
          {activeResearch ? (
            <ResearchWorkDetails research={activeResearch} model={model} />
          ) : (
            <>
              {manufacture && (
                <div className={local.order}>
                  <Field>
                    {orderTitle} quantity
                    <Input
                      ref={quantityInput}
                      aria-label={`${orderTitle} quantity`}
                      inputMode="numeric"
                      value={quantity}
                      onChange={(e) => onQuantity(e.target.value)}
                      required
                    />
                  </Field>
                </div>
              )}
              {loading && <p role="status">Loading technology details…</p>}
              {error && (
                <div role="alert">
                  {error}{' '}
                  <Button variant="quiet" onClick={onInspect}>
                    Retry
                  </Button>
                </div>
              )}
              {!loading && !error && material && (
                <div className={`${styles.facts} ${local.facts}`}>
                  <dl>
                    <div>
                      <dt>
                        {manufacture
                          ? 'Production duration per unit:'
                          : 'Research time:'}
                      </dt>
                      <dd>
                        {duration(
                          material.type === 'Manufacture'
                            ? material.unit_duration_ms
                            : material.duration_ms,
                        )}
                      </dd>
                    </div>
                    {material.type === 'Research' && (
                      <div>
                        <dt>Effective laboratory level:</dt>
                        <dd>{material.effective_lab}</dd>
                      </div>
                    )}
                    {material.type === 'Manufacture' && (
                      <div>
                        <dt>Order:</dt>
                        <dd>
                          {material.quantity} × {title}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
              {display && <ProgressionBlockers proposal={display} />}
              {!loading && !error && !material && (
                <p>
                  {manufacture
                    ? 'Enter a quantity to see the total cost.'
                    : 'Research is unavailable.'}
                </p>
              )}
              {material?.type === 'Manufacture' &&
                material.quantity !== '1' && (
                  <p className={local.note}>
                    Cost per unit: {costs(material.unit_cost)}
                  </p>
                )}
              {order.error && <p role="alert">{order.error}</p>}
              <p className={local.note}>
                {manufacture
                  ? 'Prepaid · shared ship/defense queue. No cancellation, pause, or reordering.'
                  : 'One active research project per player. Full payment is refunded if cancelled before completion.'}
              </p>
              <div className={styles.purchase}>
                {material && (
                  <div>
                    {material.type === 'Research' && (
                      <p>
                        Required to improve to level {material.target_level}:
                      </p>
                    )}
                    <ResourceCosts
                      cost={material.paid}
                      available={body.amounts}
                    />
                  </div>
                )}
                <div className={local.terms}>
                  {display?.estimates && (
                    <p>
                      Estimated start:{' '}
                      {new Date(
                        display.estimates.first_start_at,
                      ).toLocaleString()}{' '}
                      · Completion:{' '}
                      {new Date(
                        display.estimates.final_due_at,
                      ).toLocaleString()}
                    </p>
                  )}
                </div>
                <Button
                  className={styles.improve}
                  aria-label={manufacture ? 'Build' : 'Confirm research'}
                  disabled={
                    manufacture
                      ? !order.canBuild
                      : loading ||
                        !command ||
                        !!proposal?.blockers.length ||
                        (!!command && pending(model, command))
                  }
                  onClick={() => {
                    if (manufacture) {
                      void order.build()
                      return
                    }
                    if (command) {
                      void model.send(command, proposal ?? undefined)
                    }
                  }}
                >
                  {manufacture
                    ? order.busy
                      ? 'Confirming order…'
                      : `Order ${quantity} ${title}`
                    : 'Research'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className={styles.description}>
        <Info size={17} aria-hidden="true" />
        <p>{content.description}</p>
      </div>
      <Button variant="quiet" onClick={onTechnology}>
        <Network size={16} />
        Technology tree
      </Button>
    </>
  )
}
function duration(ms: number) {
  const seconds = Math.ceil(ms / 1000)
  return `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ` : ''}${seconds >= 60 ? `${Math.floor(seconds / 60) % 60}m ` : ''}${seconds % 60}s`
}
