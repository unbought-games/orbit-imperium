import {
  DurationValue,
  ResourceSummary,
  ResourceQuantity,
  NumberValue,
} from '../../ui/number-value'
import { progressionCommand, technologyRequest } from './options'
import { useId } from 'react'
import { SatelliteOutput } from './satellite-output'
import { ManufacturingOrderSummary } from './manufacturing-order-summary'
import { Network } from 'lucide-react'
import { Button } from '../../ui/button'
import { Field, NumberInput } from '../../ui/form'
import { ResourceCosts } from '../../ui/resource-costs'
import { CatalogItemLink } from '../../ui/catalog-item-link'
import { Requirements } from '../../ui/requirements'
import { label } from '../../ui/format'
import { ProgressionBlockers } from './quote-review'
import { pending, type ProgressionProps } from './shared'
import { TechnicalData } from './technical-data'
import { catalogContent } from './catalog-content'
import type { BoundProgressionOptions } from '../../client-model/commands'
import type { components } from '../../contracts'
import { ResearchWorkDetails } from './research-work-details'
import { researchProgress } from '../../client-model/research-progress'
import { currentServerTime } from '../../client-model/game-projection'
import { useManufacturingOrder } from './use-manufacturing-order'
import { unitCounts } from './unit-counts'
import {
  DetailLayout,
  DetailSection,
  DetailStat,
  DetailRow,
} from './detail-layout'
import {
  DecisionCosts,
  DecisionCostAvailability,
  EnergyAdvice,
} from './detail-metrics'
import { affordabilityForecast, nextLevelDependents } from './detail-insights'
import styles from './detail-layout.module.css'
import { ProgressionActionFeedback } from './action-feedback'

export function TechnologyDetails({
  entry,
  count,
  proposal,
  loading,
  error,
  quantity,
  onQuantity,
  onInspect,
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
  onTechnology: () => void
}) {
  const { coordinator: model, body, page, view } = props
  const unavailable = !entry.enabled || !entry.body_kinds.includes(body.kind)
  const state = model.store.getState()
  const research = researchProgress(state)
  const activeResearch =
    entry.key.kind === 'Research' && research?.research === entry.key.id
      ? research
      : null
  const quantityErrorId = useId()
  const manufacture = entry.key.kind === 'Ship' || entry.key.kind === 'Defense'
  const quantityError =
    manufacture &&
    quantity !== '' &&
    quantity !== '0' &&
    !technologyRequest(entry.key, body.id, 'Upgrade', quantity)
      ? 'Enter a positive whole quantity within the supported range.'
      : ''
  const order = useManufacturingOrder(
    model,
    view,
    manufacture ? proposal : null,
    quantity,
    onInspect,
    () => onQuantity('0'),
  )
  const display = manufacture ? order.preview : proposal
  const terms = display?.terms
  const material =
    terms?.type === 'Research' || terms?.type === 'Manufacture' ? terms : null
  const command = progressionCommand(proposal)
  const title = label(entry.key.id)
  const inventoryView =
    state.view && state.view.protocol !== 2 ? state.view : view
  const inventory = unitCounts(
    inventoryView,
    inventoryView.bodies.find((x) => x.id === body.id) ?? body,
    entry,
  )
  const orderTitle = page === 'shipyard' ? 'Shipyard' : 'Defenses'
  const now = currentServerTime(state)
  const canBuild =
    !unavailable &&
    (manufacture
      ? order.canBuild
      : !loading &&
        !!command &&
        !proposal?.blockers.length &&
        !pending(model, command))
  const forecast = material
    ? affordabilityForecast(view, body, material.paid)
    : null
  const dependents =
    material?.type === 'Research'
      ? nextLevelDependents(
          view,
          entry.key,
          Number(count),
          material.target_level,
        )
      : []
  return (
    <DetailLayout
      content={catalogContent(entry.key)}
      back={props.selection.back}
      footer={
        <>
          <Button variant="secondary" onClick={onTechnology}>
            <Network size={16} />
            Technology tree
          </Button>
          <details>
            <summary>Requirements & order terms</summary>
            <Requirements
              requirements={entry.requirements}
              view={view}
              body={body}
            />
            <p>
              {manufacture
                ? 'Prepaid · shared ship/defense queue. No cancellation, pause, or reordering.'
                : 'One research project at a time. Full refund if cancelled before completion.'}
            </p>
            {material?.type === 'Manufacture' && material.quantity !== '1' && (
              <p>
                Cost per unit: <ResourceSummary value={material.unit_cost} />
              </p>
            )}
            {material && (
              <ResourceCosts cost={material.paid} available={body.amounts} />
            )}
          </details>
        </>
      }
    >
      <DetailSection
        label={manufacture ? 'Unit inventory' : 'Current research level'}
      >
        <div className={styles.stats}>
          {manufacture ? (
            <>
              <DetailStat label="Stationed">
                <NumberValue value={inventory.stationed} />
              </DetailStat>
              {inventory.flying !== null && (
                <DetailStat label="In flight from here">
                  <NumberValue value={inventory.flying} />
                </DetailStat>
              )}
              <DetailStat label="On order">
                <NumberValue value={inventory.ordered} />
              </DetailStat>
            </>
          ) : (
            <DetailStat label="Current level">Level {count}</DetailStat>
          )}
        </div>
      </DetailSection>
      {activeResearch ? (
        <ResearchWorkDetails research={activeResearch} model={model} />
      ) : (
        <DetailSection
          title={
            manufacture
              ? 'New order'
              : `Next · level ${material?.type === 'Research' ? material.target_level : Number(count) + 1}`
          }
        >
          {unavailable && (
            <p>
              {!entry.enabled
                ? 'Unavailable in this universe.'
                : `Unavailable on this ${body.kind.toLowerCase()}.`}
            </p>
          )}
          {!manufacture && loading && (
            <p role="status">Loading technology details…</p>
          )}
          {!manufacture && error && (
            <div role="alert">
              {error}{' '}
              <Button variant="secondary" onClick={onInspect}>
                Retry
              </Button>
            </div>
          )}
          {entry.key.kind === 'Ship' && entry.key.id === 'SolarSatellite' && (
            <SatelliteOutput view={view} body={body} />
          )}
          {manufacture && (
            <ManufacturingOrderSummary
              source={proposal}
              preview={order.preview}
              view={view}
              body={body}
              title={title}
              now={now}
            />
          )}
          {!manufacture &&
            !loading &&
            !error &&
            material?.type === 'Research' && (
              <>
                <dl className={styles.compare}>
                  <DetailRow label="Research time">
                    <DurationValue milliseconds={material.duration_ms} />
                  </DetailRow>
                  {material.type === 'Research' && (
                    <DetailRow label="Effective laboratory level">
                      {material.effective_lab}
                    </DetailRow>
                  )}
                  {material.type === 'Research' &&
                    BigInt(material.required_energy) > 0n && (
                      <>
                        <DetailRow label="Required energy">
                          <ResourceQuantity
                            resource="energy"
                            value={material.required_energy}
                          />
                        </DetailRow>
                        <DetailRow label="Available energy">
                          <ResourceQuantity
                            resource="energy"
                            value={body.energy.supply}
                          />
                        </DetailRow>
                      </>
                    )}

                  {dependents.length > 0 && (
                    <DetailRow label="Required for">
                      {dependents.map((item, index) => (
                        <span key={`${item.kind}:${item.id}`}>
                          {index > 0 && ', '}
                          <CatalogItemLink
                            item={item}
                            body={body.id}
                            className={styles.inlineLink}
                          />
                        </span>
                      ))}
                    </DetailRow>
                  )}
                  <DecisionCosts
                    title="Research cost"
                    cost={material.paid}
                    available={body.amounts}
                    forecast={forecast!}
                  />
                </dl>
                {display?.blockers.some(
                  (blocker) => blocker.code === 'EnergyRequired',
                ) && (
                  <p className={styles.note}>
                    <EnergyAdvice view={view} body={body} construction />
                  </p>
                )}
              </>
            )}
          <div className={manufacture ? styles.orderAction : undefined}>
            {manufacture && (
              <Field className={styles.quantity}>
                <span className={styles.quantityLabel}>Qty</span>
                <NumberInput
                  aria-label={`${orderTitle} quantity`}
                  aria-invalid={!!quantityError}
                  aria-describedby={quantityError ? quantityErrorId : undefined}
                  value={quantity}
                  onChange={(e) => onQuantity(e.target.value)}
                  required
                />
              </Field>
            )}
            <Button
              data-analytics="confirm_technology_action"
              className={styles.action}
              aria-label={manufacture ? 'Build' : 'Confirm research'}
              disabled={!canBuild}
              onClick={() => {
                if (!canBuild) return
                if (manufacture) void order.build()
                else if (command)
                  void model.send(command, proposal ?? undefined)
              }}
            >
              {manufacture ? (
                order.busy ? (
                  'Confirming'
                ) : (
                  <span className={styles.orderLabel}>
                    Order {quantity}
                    <span className={styles.orderItem}> {title}</span>
                  </span>
                )
              ) : (
                'Research'
              )}
            </Button>
          </div>
          {manufacture && loading && (
            <p role="status">Loading technology details…</p>
          )}
          {manufacture && error && (
            <div role="alert">
              {error}{' '}
              <Button variant="secondary" onClick={onInspect}>
                Retry
              </Button>
            </div>
          )}
          {quantityError && (
            <p id={quantityErrorId} role="alert">
              {quantityError}
            </p>
          )}
          {manufacture && order.preview && forecast && (
            <DecisionCostAvailability
              cost={order.preview.terms.paid}
              available={body.amounts}
              forecast={forecast}
            />
          )}
          {display && (
            <ProgressionBlockers
              proposal={display}
              view={view}
              body={body}
              now={now}
              resourceWait={forecast?.wait ?? null}
              resourcesInCosts={!loading && !error && !!material}
            />
          )}
          {!manufacture && !loading && !error && !material && (
            <p>Research is unavailable.</p>
          )}
          {order.error && <p role="alert">{order.error}</p>}
          {manufacture && (
            <ProgressionActionFeedback
              model={model}
              body={body.id}
              item={entry.key}
            />
          )}
        </DetailSection>
      )}
      <TechnicalData
        key={`${entry.key.kind}:${entry.key.id}`}
        entry={entry}
        view={view}
        body={body}
      />
      {!manufacture && (
        <ProgressionActionFeedback
          model={model}
          body={body.id}
          item={entry.key}
        />
      )}
    </DetailLayout>
  )
}
