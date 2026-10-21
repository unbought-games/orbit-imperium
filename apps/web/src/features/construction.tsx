import { NumberValue, ResourceNumber } from '../ui/number-value'
import { canAfford } from '../client-model/resources'
import { QuotePanel, QuoteAction } from '../ui/quote-panel'
import { Button } from '../ui/button'
import { Heading, Text } from '../ui/typography'
import { CatalogActions, CatalogCard, CatalogGrid } from '../ui/catalog-layout'
import { useCountdown } from '../client-model/use-clock'
import type { CommandActions } from './operations'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Factory } from 'lucide-react'
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
import {
  ProgressionHeading,
  ResourceWorld,
} from './progression/progression-world'
type UpgradeRequest = Extract<QuoteRequest, { type: 'Upgrade' }>
export function Economy({
  view,
  body,
  actions,
  compact = false,
}: {
  view: View
  body: View['bodies'][number]
  actions: CommandActions
  compact?: boolean
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
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
  function closePreview() {
    generation.current++
    setDetailOpen(false)
  }
  useEffect(() => {
    if (detailOpen) return
    const frame = requestAnimationFrame(() =>
      opener.current?.focus({ preventScroll: true }),
    )
    return () => cancelAnimationFrame(frame)
  }, [detailOpen])
  const active = view.constructions.find((c) => c.body === body.id)
  const preview = useCallback(
    async (building: UpgradeRequest['building']) => {
      const current = ++generation.current
      setDetailOpen(true)
      setSelectedId(building)
      setProposal(null)
      try {
        setError('')
        const request: UpgradeRequest = {
          type: 'Upgrade',
          body: body.id,
          building,
        }
        const quote = await actions.quote(request)
        if (current === generation.current) {
          if (quote) setProposal({ request, quote })
          else setError('Quote unavailable. Refresh and try again.')
        }
      } catch {
        if (current === generation.current)
          setError('Quote unavailable. Refresh and try again.')
      }
    },
    [actions.quote, body.id],
  )
  const selectedLevel = selectedId
    ? body.levels[selectedId as keyof typeof body.levels]
    : undefined
  const proposalIsCurrent =
    !proposal ||
    selectedLevel === undefined ||
    proposal.quote.target_level === selectedLevel + 1
  useEffect(() => {
    if (compact && detailOpen && selectedId && !proposalIsCurrent)
      void preview(selectedId as UpgradeRequest['building'])
  }, [compact, detailOpen, selectedId, proposalIsCurrent, preview])
  if (compact)
    return (
      <>
        <ProgressionHeading page="resources" body={body} compact={detailOpen} />
        <CatalogStage
          scene={
            <ResourceWorld
              view={view}
              body={body}
              onSelect={(id, element) => {
                opener.current = element
                void preview(id as UpgradeRequest['building'])
              }}
            />
          }
          sceneLabel="Industrial resource colony"
          open={detailOpen}
          detailKey={selected?.id ?? ''}
          detailLabel="Upgrade quote"
          onClose={closePreview}
          footer={
            <>
              <Factory size={22} aria-hidden="true" />
              <Button
                variant="quiet"
                disabled
                title="Production settings are unavailable in this universe"
              >
                Resource settings
              </Button>
            </>
          }
        >
          {selected && (
            <>
              <div className={styles.header}>
                <h2>{label(selected.id)}</h2>
                <span>
                  Level {body.levels[selected.id as keyof typeof body.levels]}
                </span>
                <Button
                  variant="quiet"
                  aria-label="Dismiss"
                  onClick={closePreview}
                >
                  <ArrowLeft size={18} /> Back
                </Button>
              </div>
              <div className={styles.details}>
                <CatalogImage art={selected.art} />
                <div>
                  {progress?.building === selected.id && actions.model ? (
                    <ConstructionDetails
                      work={progress}
                      model={actions.model}
                    />
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
              <Text className={styles.description}>{selected.description}</Text>
            </>
          )}
        </CatalogStage>
        <CatalogSection title="Resource buildings">
          <ImageCatalog>
            {resourceBuildings.map((building) => (
              <ImageTile
                key={building.id}
                title={label(building.id)}
                aria-label={`Upgrade ${label(building.id)}`}
                art={building.art}
                progress={progress?.building === building.id ? progress : null}
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
                onClick={(event) => {
                  opener.current = event.currentTarget
                  void preview(building.id as UpgradeRequest['building'])
                }}
              />
            ))}
          </ImageCatalog>
        </CatalogSection>
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
            <ResourceNumber value={proposal.quote.cost.metal} /> metal ·{' '}
            <ResourceNumber value={proposal.quote.cost.crystal} /> crystal ·{' '}
            <NumberValue value={proposal.quote.duration} divisor={1000} />{' '}
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
          <QuoteAction
            disabled={busy}
            onClick={() =>
              void send({ type: 'CancelConstruction', operation: active.id })
            }
          >
            Cancel construction · full refund
          </QuoteAction>
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
