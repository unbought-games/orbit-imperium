import type { CatalogSelection } from '../shell/use-catalog-selection'
import { NumberValue, ResourceQuantity } from '../ui/number-value'
import { canAfford } from '../client-model/resources'
import { QuotePanel, QuoteAction } from '../ui/quote-panel'
import { WorkCancellationButton } from './work-cancellation-button'
import { ResourceSummary } from '../ui/number-value'
import { Button, ButtonLinkAnchor } from '../ui/button'
import { Heading, Text } from '../ui/typography'
import { CatalogActions, CatalogCard, CatalogGrid } from '../ui/catalog-layout'
import { useCountdown } from '../client-model/use-clock'
import type { CommandActions } from './operations'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { CatalogStage } from '../ui/catalog-stage'
import {
  CatalogImage,
  CatalogSection,
  ImageCatalog,
  ImageTile,
} from '../ui/image-catalog'
import { resourceBuildings } from './progression/resource-buildings'
import { ResourceCosts } from '../ui/resource-costs'
import { label } from '../ui/format'
import styles from './legacy-resources.module.css'
import type { View } from '../adapters/http'
import type { Quote, QuoteRequest } from '../client-model/commands'
import { buildingProgress } from '../client-model/building-progress'
import { ConstructionDetails } from './progression/construction-details'
type UpgradeRequest = Extract<QuoteRequest, { type: 'Upgrade' }>
export function Economy({
  view,
  body,
  actions,
  compact = false,
  selection,
}: {
  view: View
  body: View['bodies'][number]
  actions: CommandActions
  compact?: boolean
  selection?: CatalogSelection
}) {
  const { send, busy } = actions
  const progress = actions.model
    ? buildingProgress(actions.model.store.getState(), body.id)
    : null
  const countdown = useCountdown(view.sampled_at)
  const [proposal, setProposal] = useState<{
      request: UpgradeRequest
      quote: Quote
    } | null>(null),
    [error, setError] = useState('')
  const [localOpen, setDetailOpen] = useState(false)
  const [localId, setSelectedId] = useState<string | null>(null)
  const selectedId = compact ? (selection?.selectedId ?? null) : localId
  const detailOpen = compact ? selectedId !== null : localOpen
  const selected = resourceBuildings.find(
    (building) => building.id === selectedId,
  )
  const generation = useRef(0)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )
  useEffect(() => {
    if (detailOpen) return
    const frame = requestAnimationFrame(() =>
      opener.current?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(frame)
  }, [detailOpen])
  const active = view.constructions.find((c) => c.body === body.id)
  const quoteRequest = useRef(actions.quote)
  quoteRequest.current = actions.quote
  const preview = useCallback(
    async (building: UpgradeRequest['building']) => {
      const current = ++generation.current
      if (!compact) {
        setDetailOpen(true)
        setSelectedId(building)
      }
      setProposal(null)
      try {
        setError('')
        const request: UpgradeRequest = {
          type: 'Upgrade',
          body: body.id,
          building,
        }
        const quote = await quoteRequest.current(request)
        if (current === generation.current) {
          if (quote) setProposal({ request, quote })
          else setError('Quote unavailable. Refresh and try again.')
        }
      } catch {
        if (current === generation.current)
          setError('Quote unavailable. Refresh and try again.')
      }
    },
    [body.id, compact],
  )
  const selectedLevel = selectedId
    ? body.levels[selectedId as keyof typeof body.levels]
    : undefined
  const proposalIsCurrent =
    proposal?.request.body === body.id &&
    proposal.request.building === selectedId &&
    selectedLevel !== undefined &&
    proposal.quote.target_level === selectedLevel + 1
  useEffect(() => {
    if (
      compact &&
      detailOpen &&
      selectedId &&
      selectedLevel !== undefined &&
      active?.building !== selectedId
    )
      void preview(selectedId as UpgradeRequest['building'])
  }, [compact, detailOpen, selectedId, selectedLevel, active?.id, preview])
  if (compact)
    return (
      <>
        {detailOpen ? (
          <CatalogStage
            open={detailOpen}
            detailKey={selected?.id ?? ''}
            detailLabel="Upgrade quote"
          >
            {selected && (
              <>
                <div className={styles.header}>
                  <h2>{label(selected.id)}</h2>
                  <span>
                    Level {body.levels[selected.id as keyof typeof body.levels]}
                  </span>
                  <ButtonLinkAnchor
                    variant="secondary"
                    size="icon-small"
                    {...selection?.back}
                    aria-label={selection?.back['aria-label'] ?? 'Back'}
                  >
                    <ArrowLeft size={18} aria-hidden="true" />
                  </ButtonLinkAnchor>
                </div>
                <div className={styles.details}>
                  <CatalogImage art={selected.art} />
                  <div>
                    {progress?.building === selected.id && actions.model ? (
                      <ConstructionDetails
                        work={progress}
                        model={actions.model}
                      />
                    ) : selectedLevel === undefined ? (
                      <Text>Unavailable in this universe.</Text>
                    ) : error ? (
                      <Text role="alert">
                        {error}
                        <Button
                          onClick={() =>
                            void preview(
                              selected.id as UpgradeRequest['building'],
                            )
                          }
                        >
                          Retry
                        </Button>
                      </Text>
                    ) : !proposal || !proposalIsCurrent ? (
                      <Text role="status">Loading building details…</Text>
                    ) : (
                      <>
                        <Heading level={3}>
                          Upgrade to level {proposal.quote.target_level}
                        </Heading>
                        <Text>
                          Production duration:{' '}
                          <NumberValue
                            value={proposal.quote.duration}
                            divisor={1000}
                          />{' '}
                          seconds
                        </Text>
                        <ResourceCosts
                          cost={proposal.quote.cost}
                          available={body.amounts}
                        />
                        <Button
                          disabled={
                            busy ||
                            !!active ||
                            !canAfford(proposal.quote.cost, body.amounts)
                          }
                          aria-label="Confirm upgrade"
                          onClick={() => {
                            void send(
                              {
                                ...proposal.request,
                                type: 'StartUpgrade',
                                expected_terms_hash: proposal.quote.terms_hash,
                              },
                              proposal.quote,
                            )
                          }}
                        >
                          Improve
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <Text className={styles.description}>
                  {selected.description}
                </Text>
              </>
            )}
          </CatalogStage>
        ) : (
          <CatalogSection title="Resource buildings">
            <ImageCatalog>
              {resourceBuildings.map((building) => (
                <ImageTile
                  key={building.id}
                  title={label(building.id)}
                  aria-label={`Upgrade ${label(building.id)}`}
                  art={building.art}
                  progress={
                    progress?.building === building.id ? progress : null
                  }
                  level={
                    body.levels[building.id as keyof typeof body.levels] ?? 0
                  }
                  selected={detailOpen && selected?.id === building.id}
                  disabled={
                    !(building.id in body.levels) ||
                    ((busy || !!active) && progress?.building !== building.id)
                  }
                  disabledReason={
                    !(building.id in body.levels)
                      ? 'unavailable in this universe'
                      : active
                        ? 'construction already in progress'
                        : 'command awaiting confirmation'
                  }
                  {...selection?.link(building.id)}
                />
              ))}
            </ImageCatalog>
          </CatalogSection>
        )}
      </>
    )
  return (
    <>
      <Heading level={2}>Economy</Heading>
      <CatalogGrid>
        {Object.entries(body.levels).map(([building, level]) => (
          <CatalogCard key={building}>
            <Heading level={3}>
              {building.replace(/([a-z])([A-Z])/g, '$1 $2')}
            </Heading>
            <Text>Level {level}</Text>
            <CatalogActions>
              <Button
                disabled={busy || !!active}
                onClick={() =>
                  void preview(building as UpgradeRequest['building'])
                }
              >
                Upgrade {building.replace(/([a-z])([A-Z])/g, '$1 $2')}
              </Button>
            </CatalogActions>
          </CatalogCard>
        ))}
      </CatalogGrid>
      {proposal && (
        <QuotePanel as="div" role="region" aria-label="Upgrade quote">
          <Heading level={3}>
            Upgrade to level {proposal.quote.target_level}
          </Heading>
          <Text>
            <ResourceQuantity
              resource="metal"
              value={proposal.quote.cost.metal}
            />{' '}
            ·{' '}
            <ResourceQuantity
              resource="crystal"
              value={proposal.quote.cost.crystal}
            />{' '}
            · <NumberValue value={proposal.quote.duration} divisor={1000} />{' '}
            seconds
          </Text>
          <QuoteAction
            disabled={
              busy || !!active || !canAfford(proposal.quote.cost, body.amounts)
            }
            onClick={() => {
              void send(
                {
                  ...proposal.request,
                  type: 'StartUpgrade',
                  expected_terms_hash: proposal.quote.terms_hash,
                },
                proposal.quote,
              )
              setProposal(null)
            }}
          >
            Confirm upgrade
          </QuoteAction>
          <QuoteAction onClick={() => setProposal(null)}>Dismiss</QuoteAction>
        </QuotePanel>
      )}
      {active && (
        <QuotePanel as="div">
          <Heading level={3}>Construction in progress</Heading>
          <Text>
            {active.building.replace(/([a-z])([A-Z])/g, '$1 $2')} → level{' '}
            {active.target_level} · {countdown(active.due_at)}
          </Text>
          <WorkCancellationButton
            model={actions.model}
            operationId={active.id}
            kind="CancelConstruction"
            key={active.id}
            disabled={busy}
            dialogTitle="Cancel construction?"
            confirmLabel="Confirm cancellation"
            cancelLabel="Keep construction"
            review={
              <p>
                Stop construction and refund{' '}
                <ResourceSummary value={active.paid} />?
              </p>
            }
            onConfirm={() =>
              void send({ type: 'CancelConstruction', operation: active.id })
            }
          >
            Cancel construction · full refund
          </WorkCancellationButton>
        </QuotePanel>
      )}
      {error && (
        <Text tone="danger" role="alert">
          {error}
        </Text>
      )}
    </>
  )
}
