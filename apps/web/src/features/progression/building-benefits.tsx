import { ResourceQuantity } from '../../ui/number-value'
import { DetailRow } from './detail-layout'
import { BenefitValue, benefitLabel, EnergyComparison } from './detail-metrics'
import type { buildingInsights } from './detail-insights'
import type { ProgressionProps } from './shared'

/** The same target forecast is used before and during construction. */
export function BuildingBenefits({
  insight,
  action,
  firstBuild,
  building,
  view,
  body,
}: {
  insight: ReturnType<typeof buildingInsights>
  action: 'Upgrade' | 'Demolition'
  firstBuild: boolean
  building: { id: string }
  view: ProgressionProps['view']
  body: ProgressionProps['body']
}) {
  const isMine = insight.benefit?.kind.endsWith('PerHour') ?? false
  return (
    <>
      {insight.benefit && (
        <DetailRow label={benefitLabel(insight.benefit)}>
          <span title={isMine ? 'Current output' : 'Change'}>
            <BenefitValue insight={insight.benefit} change={!isMine} />
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
            <BenefitValue insight={insight.benefit} target potential />
          </DetailRow>
        )}
      {(insight.energy.show || insight.energy.constructionBlocked) && (
        <EnergyComparison
          energy={insight.energy}
          balanceLabel={
            action === 'Demolition'
              ? 'Energy after demolition'
              : firstBuild
                ? 'Energy after build'
                : 'Energy after upgrade'
          }
          firstBuild={
            firstBuild &&
            !insight.benefit?.planetTotal &&
            building.id !== 'FusionReactor'
          }
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
    </>
  )
}
