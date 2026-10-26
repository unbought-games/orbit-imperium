import {
  DurationValue,
  ResourceQuantity,
  ResourceSummary,
} from '../../ui/number-value'
import { progressionCommand } from './options'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '../../ui/button'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { label } from '../../ui/format'
import { ProgressionBlockers } from './quote-review'
import { pending, type ProgressionProps } from './shared'
import type { BoundProgressionOptions } from '../../client-model/commands'
import type { CatalogContent } from './catalog-content'
import { buildingProgress } from '../../client-model/building-progress'
import { currentServerTime } from '../../client-model/game-projection'
import { buildingUnavailableReason } from './building-availability'
import { ConstructionDetails } from './construction-details'
import { buildingInsights, affordabilityForecast } from './detail-insights'
import {
  DetailLayout,
  DetailIntroduction,
  DetailSection,
  DetailStat,
  DetailRow,
} from './detail-layout'
import {
  BenefitValue,
  benefitLabel,
  StorageInsight,
  EnergyComparison,
  DecisionCosts,
} from './detail-metrics'
import styles from './detail-layout.module.css'
import { ProgressionActionFeedback } from './action-feedback'
import { TechnicalData } from './technical-data'

export function BuildingDetails({
  building,
  level,
  proposal,
  loading,
  error,
  action,
  onInspect,
  ...props
}: ProgressionProps & {
  building: CatalogContent
  level: number
  proposal: BoundProgressionOptions | null
  loading: boolean
  error: string
  action: 'Upgrade' | 'Demolition'
  onInspect: (action: 'Upgrade' | 'Demolition') => void
}) {
  const { view, body, coordinator: model } = props
  const state = model.store.getState()
  const progress = buildingProgress(state, body.id)
  const work = progress?.building === building.id ? progress : null
  const title = label(building.id)
  const firstBuild = level === 0 && action === 'Upgrade'
  const terms = proposal?.terms?.type === 'Building' ? proposal.terms : null
  const entry = view.catalog.find(
    (entry) => entry.key.kind === 'Building' && entry.key.id === building.id,
  )
  const unavailable = buildingUnavailableReason(entry, body, building.id)
  const command = progressionCommand(proposal)
  const insight = buildingInsights(view, body, building.id, proposal)
  const canBuild =
    !unavailable &&
    !loading &&
    !!command &&
    !proposal?.blockers.length &&
    !pending(model, command)
  const forecast = terms ? affordabilityForecast(view, body, terms.paid) : null
  const now = currentServerTime(state)
  const submit = () => {
    if (canBuild && command) void model.send(command, proposal ?? undefined)
  }
  const actionText = terms
    ? action === 'Upgrade'
      ? firstBuild
        ? `Build ${title}`
        : `Build level ${terms.target_level}`
      : `Demolish to level ${terms.target_level}`
    : loading
      ? 'Loading…'
      : 'Unavailable'
  return (
    <DetailLayout
      content={building}
      back={props.selection.back}
      footer={
        !work &&
        !unavailable &&
        (level > 0 || action === 'Demolition') && (
          <Button
            variant={action === 'Upgrade' ? 'destructive' : 'secondary'}
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
              <ArrowDown size={16} />
            ) : (
              <ArrowUp size={16} />
            )}
            {action === 'Upgrade' ? 'Tear down' : 'Review upgrade'}
          </Button>
        )
      }
    >
      {level > 0 && (
        <DetailSection label="Current level and benefit">
          <div className={styles.stats}>
            <DetailStat label="Current level">Level {level}</DetailStat>
            {insight.benefit && (
              <DetailStat label={benefitLabel(insight.benefit)}>
                <BenefitValue insight={insight.benefit} />
              </DetailStat>
            )}
          </div>
          {insight.storage && (
            <StorageInsight
              storage={insight.storage}
              showRate={!insight.benefit?.planetTotal}
            />
          )}
        </DetailSection>
      )}
      {work ? (
        <ConstructionDetails work={work} model={model} />
      ) : (
        <DetailSection
          title={
            firstBuild
              ? undefined
              : action === 'Demolition'
                ? `Tear down to level ${terms?.target_level ?? Math.max(0, level - 1)}`
                : `Next · level ${terms?.target_level ?? level + 1}`
          }
          label="Target level and benefit"
        >
          {firstBuild && !unavailable && <DetailIntroduction name={title} />}
          {unavailable && <p role="status">{unavailable}</p>}
          {loading && <p role="status">Loading building details…</p>}
          {error && (
            <p role="alert">
              {error}{' '}
              <Button variant="secondary" onClick={() => onInspect(action)}>
                Retry
              </Button>
            </p>
          )}
          {terms && !unavailable && (
            <>
              <dl className={styles.compare}>
                <DecisionCosts
                  title={
                    action === 'Upgrade'
                      ? firstBuild
                        ? 'Build cost'
                        : 'Upgrade cost'
                      : 'Demolition cost'
                  }
                  cost={terms.paid}
                  available={body.amounts}
                  forecast={forecast!}
                />
                {insight.benefit && (
                  <DetailRow label={benefitLabel(insight.benefit)}>
                    <span title="Change">
                      <BenefitValue insight={insight.benefit} change />
                    </span>{' '}
                    <span aria-hidden="true">→</span>{' '}
                    <strong title="New total">
                      <BenefitValue insight={insight.benefit} target />
                    </strong>
                  </DetailRow>
                )}
                {insight.benefit?.fullPowerTarget &&
                  BigInt(insight.benefit.fullPowerTarget) / 1000000n >
                    BigInt(insight.benefit.target) / 1000000n && (
                    <DetailRow label="With enough energy">
                      <BenefitValue
                        insight={insight.benefit}
                        target
                        potential
                      />
                    </DetailRow>
                  )}
                {(insight.energy.show ||
                  insight.energy.constructionBlocked) && (
                  <EnergyComparison
                    energy={insight.energy}
                    firstBuild={firstBuild && !insight.benefit?.planetTotal}
                    view={view}
                    body={body}
                  />
                )}
                {insight.fuel &&
                  (building.id === 'FusionReactor' ||
                    insight.fuel.current !== insight.fuel.target) && (
                    <DetailRow label="Deuterium fuel / hour">
                      <ResourceQuantity
                        resource="deuterium"
                        value={insight.fuel.current}
                      />
                      {' → '}
                      <ResourceQuantity
                        resource="deuterium"
                        value={insight.fuel.target}
                      />
                    </DetailRow>
                  )}
                <DetailRow label="Build time">
                  <DurationValue milliseconds={terms.duration_ms} />
                </DetailRow>
                {BigInt(terms.required_energy) > 0n && (
                  <DetailRow label="Construction energy required">
                    <ResourceQuantity
                      resource="energy"
                      value={terms.required_energy}
                    />
                  </DetailRow>
                )}
              </dl>
              {insight.benefit?.qualifier &&
                (!firstBuild ||
                  !insight.benefit.planetTotal ||
                  insight.storage?.state === 'full') && (
                  <p className={styles.note}>{insight.benefit.qualifier}.</p>
                )}
            </>
          )}
          {proposal && (
            <ProgressionBlockers
              proposal={proposal}
              view={view}
              body={body}
              now={now}
              resourceWait={forecast?.wait ?? null}
              resourcesInCosts={!!terms && !unavailable}
            />
          )}
          {!unavailable && (
            <>
              {action === 'Demolition' ? (
                <ConfirmationButton
                  key={`${building.id}:${terms?.target_level}:${proposal?.terms_hash}`}
                  className={styles.action}
                  variant="destructive"
                  aria-label="Confirm demolition"
                  disabled={!canBuild}
                  dialogTitle={`Tear down ${title}?`}
                  confirmLabel="Confirm demolition"
                  cancelLabel="Keep this level"
                  review={
                    <>
                      <p>
                        Reduce {title} from level {level} to{' '}
                        {terms?.target_level}. Its benefits will decrease.
                      </p>
                      {terms && (
                        <>
                          <p>
                            Cost: <ResourceSummary value={terms.paid} />
                          </p>
                          <p>
                            Time:{' '}
                            <DurationValue milliseconds={terms.duration_ms} />
                          </p>
                        </>
                      )}
                    </>
                  }
                  onConfirm={submit}
                >
                  {actionText}
                </ConfirmationButton>
              ) : (
                <Button
                  className={styles.action}
                  aria-label="Confirm upgrade"
                  data-analytics="confirm_upgrade"
                  disabled={!canBuild}
                  onClick={submit}
                >
                  {actionText}
                </Button>
              )}
            </>
          )}
          {!loading && !terms && !error && !unavailable && (
            <p>Construction is unavailable.</p>
          )}
        </DetailSection>
      )}
      {entry && (
        <TechnicalData
          key={entry.key.id}
          entry={entry}
          view={view}
          body={body}
        />
      )}
      <ProgressionActionFeedback
        model={model}
        body={body.id}
        item={{ kind: 'Building', id: building.id }}
      />
    </DetailLayout>
  )
}
