import { useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { ArrowLeft } from 'lucide-react'
import { useShipAppearances } from '../../shell/ship-appearances-context'
import { Button } from '../../ui/button'
import { LoadingRegion } from '../../ui/loading-region'
import { DesignOptions } from './design-options'
import { EmblemControls } from './emblem-controls'
import { PaintControls } from './paint-controls'
import { RenderProgress } from './render-progress'
import { ShipPreview } from './ship-preview'
import { draftProblem, sameDesign, targetLabel } from './model'
import { useShipDraft } from './use-ship-draft'
import styles from './ship-customizer.module.css'

export type ShipCustomizerProps = { target: string; onClose: () => void }

/** The launch seam/provider own DEV gating. A target change starts a fresh editing session. */
export function ShipCustomizer(props: ShipCustomizerProps) {
  return <HangarSession key={props.target} {...props} />
}

function HangarSession({ target, onClose }: ShipCustomizerProps) {
  const {
    snapshot,
    loading,
    error: providerError,
    perform,
    errorMessage,
    reload,
  } = useShipAppearances()
  const {
    draft,
    equipment,
    edit,
    choose,
    save,
    run,
    busy,
    notice,
    error,
    hasUnsavedChanges,
  } = useShipDraft({ state: snapshot, target, perform, errorMessage })
  const [open, setOpen] = useState(true)
  const [confirmClose, setConfirmClose] = useState(false)
  const [returnFocus] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  )
  const closeButton = useRef<HTMLButtonElement>(null)
  const [refreshError, setRefreshError] = useState('')
  const problem = snapshot && draft ? draftProblem(snapshot, draft) : ''
  const savedDesign = snapshot?.library.find(
    (item) =>
      draft &&
      item.id === draft.id &&
      item.revision === draft.revision &&
      sameDesign(item, draft),
  )
  const isEquipped =
    savedDesign &&
    equipment?.design_id === savedDesign.id &&
    equipment.design_revision === savedDesign.revision
  async function refresh() {
    setRefreshError('')
    try {
      await reload()
    } catch {
      setRefreshError(
        'Could not refresh the hangar. Your edits are still here.',
      )
    }
  }
  const feedback =
    notice || error || providerError || refreshError ? (
      <div className={styles.feedback}>
        {notice && <p role="status">{notice}</p>}
        {(error || providerError || refreshError) && (
          <>
            <p role="alert" className={styles.warning}>
              {error || providerError || refreshError}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="small"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              Reload choices
            </Button>
          </>
        )}
      </div>
    ) : null
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && hasUnsavedChanges) setConfirmClose(true)
        else setOpen(next)
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup
          className={styles.hangar}
          initialFocus={closeButton}
          finalFocus={() => (returnFocus?.isConnected ? returnFocus : true)}
        >
          <div className={styles.hangarPlate} aria-hidden="true" />
          <header className={styles.header}>
            <div className={styles.titlePlate}>
              <Dialog.Close
                ref={closeButton}
                className={`${styles.eyebrow} ${styles.backLink}`}
                aria-label="Back to Shipyard"
                title="Back to Shipyard"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Ship hangar
              </Dialog.Close>
              <Dialog.Title className={styles.shipTitle}>
                {targetLabel(target)}
              </Dialog.Title>
              {snapshot && draft && (
                <span className={styles.skinCaption}>
                  {snapshot.catalog.find(
                    (item) => item.id === draft.recipe.skin_id,
                  )?.name ?? 'Saved ship skin'}
                </span>
              )}
            </div>
          </header>
          <LoadingRegion
            loading={!snapshot && loading}
            label="Loading ship designs"
            className={styles.workspace}
            contentClassName={styles.workspaceContent}
          >
            {snapshot && draft ? (
              <>
                <section
                  className={styles.stage}
                  aria-label="Live ship preview"
                >
                  <div className={styles.shipArrival}>
                    <ShipPreview state={snapshot} draft={draft} />
                  </div>
                </section>
                <form
                  className={styles.controls}
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!problem && !busy) void save()
                  }}
                >
                  <div className={styles.controlHeading}>
                    <h2>Customize</h2>
                    <DesignOptions
                      designs={snapshot.library.filter(
                        (item) => item.target === target,
                      )}
                      draft={draft}
                      disabled={busy}
                      onChoose={choose}
                      onNameChange={(name) => edit({ name })}
                      onReset={
                        equipment?.design_id
                          ? () =>
                              void run(
                                {
                                  type: 'Reset',
                                  target,
                                  expected_equipment_revision:
                                    equipment.revision,
                                },
                                'Standard appearance restored.',
                              )
                          : undefined
                      }
                    />
                  </div>
                  <PaintControls
                    recipe={draft.recipe}
                    skins={snapshot.catalog.filter(
                      (item) => item.target === target,
                    )}
                    dyes={snapshot.dyes}
                    disabled={busy}
                    onChange={(recipe) => edit({ recipe })}
                  />
                  <EmblemControls
                    emblem={snapshot.emblem}
                    value={draft.recipe.emblem}
                    disabled={busy}
                    onChange={(emblem) =>
                      edit({ recipe: { ...draft.recipe, emblem } })
                    }
                  />
                  {problem && <p className={styles.warning}>{problem}</p>}
                  <div className={styles.saveActions}>
                    <Button type="submit" disabled={busy || !!problem}>
                      {busy ? 'Saving changes…' : 'Save and equip'}
                    </Button>
                    {savedDesign && !isEquipped && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy || !!problem}
                        onClick={() =>
                          void run(
                            {
                              type: 'Equip',
                              target,
                              design_id: savedDesign.id,
                              design_revision: savedDesign.revision,
                              expected_equipment_revision:
                                equipment?.revision ?? 0,
                            },
                            'Saved design selected. Your fleet artwork is being prepared.',
                          )
                        }
                      >
                        Use saved design
                      </Button>
                    )}
                    {isEquipped && (
                      <span className={styles.muted}>
                        Selected for this empire
                      </span>
                    )}
                  </div>
                  <p className={styles.help}>
                    Saved designs are reusable. Changes here leave ships in
                    other empires as they are.
                  </p>
                  <RenderProgress equipment={equipment} busy={busy} run={run} />
                  {feedback}
                </form>
              </>
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <h2>
                    {snapshot
                      ? 'No ship skins available'
                      : 'The hangar could not load'}
                  </h2>
                  <p>
                    {snapshot
                      ? 'Your saved designs are preserved. No available skins and dyes are installed for this ship.'
                      : 'Refresh to try loading your ship designs again.'}
                  </p>
                  {feedback}
                </div>
              )
            )}
          </LoadingRegion>
          <AlertDialog.Root open={confirmClose} onOpenChange={setConfirmClose}>
            <AlertDialog.Portal>
              <AlertDialog.Backdrop className={styles.confirmBackdrop} />
              <AlertDialog.Popup
                className={styles.confirmDialog}
                finalFocus={closeButton}
              >
                <AlertDialog.Title>Discard unsaved changes?</AlertDialog.Title>
                <AlertDialog.Description>
                  Your unsaved edits will be lost. Saved designs and queued
                  renders will be kept.
                </AlertDialog.Description>
                <div className={styles.actions}>
                  <AlertDialog.Close render={<Button variant="secondary" />}>
                    Keep editing
                  </AlertDialog.Close>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setConfirmClose(false)
                      setOpen(false)
                    }}
                  >
                    Discard and leave
                  </Button>
                </div>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
