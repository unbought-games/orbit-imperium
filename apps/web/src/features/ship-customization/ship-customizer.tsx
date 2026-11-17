import { useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { ArrowLeft, Copy, X } from 'lucide-react'
import { useShipAppearances } from '../../shell/ship-appearances-context'
import { Button } from '../../ui/button'
import { Field, Input } from '../../ui/form'
import { LoadingRegion } from '../../ui/loading-region'
import { DesignLibrary } from './design-library'
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
  } = useShipDraft({ state: snapshot, target, perform })
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
            <div>
              <span className={styles.eyebrow}>Ship hangar</span>
              <Dialog.Title>{targetLabel(target)}</Dialog.Title>
            </div>
            <Dialog.Close ref={closeButton} render={<Button variant="ghost" />}>
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Shipyard</span>
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>
          <Dialog.Description className={styles.description}>
            Design your ship. Save it to your library and equip it in this
            empire.
          </Dialog.Description>
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
                  <div className={styles.stageCaption}>
                    <span className={styles.eyebrow}>Live preview</span>
                    <h2>{draft.name || 'Untitled design'}</h2>
                    <p>
                      {snapshot.catalog.find(
                        (item) => item.id === draft.recipe.skin_id,
                      )?.name ?? 'Saved ship finish'}
                    </p>
                  </div>
                  <div className={styles.shipArrival}>
                    <ShipPreview state={snapshot} draft={draft} />
                  </div>
                  <p className={styles.previewNote}>
                    Engine glow and glass retain their original finish.
                  </p>
                </section>
                <form
                  className={styles.controls}
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!problem && !busy) void save()
                  }}
                >
                  <div className={styles.controlHeading}>
                    <h2>Your design</h2>
                    <span>Saved designs for your fleet</span>
                  </div>
                  <DesignLibrary
                    designs={snapshot.library.filter(
                      (item) => item.target === target,
                    )}
                    selected={draft}
                    disabled={busy}
                    onChoose={choose}
                    onNew={() =>
                      choose({
                        ...draft,
                        id: '',
                        revision: 0,
                        name: `${targetLabel(target)} design`,
                      })
                    }
                  />
                  <div className={styles.nameRow}>
                    <Field>
                      Design name
                      <Input
                        value={draft.name}
                        disabled={busy}
                        maxLength={40}
                        onChange={(event) => edit({ name: event.target.value })}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      title="Make a copy"
                      aria-label="Make a copy of this design"
                      disabled={busy}
                      onClick={() =>
                        choose({
                          ...draft,
                          id: '',
                          revision: 0,
                          name: `${draft.name} copy`.slice(0, 40),
                        })
                      }
                    >
                      <Copy size={16} aria-hidden="true" />
                    </Button>
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
                </form>
              </>
            ) : (
              !loading && (
                <div className={styles.empty}>
                  <h2>
                    {snapshot
                      ? 'No ship finishes available'
                      : 'The hangar could not load'}
                  </h2>
                  <p>
                    {snapshot
                      ? 'Your saved designs are preserved. Refresh to check for available finishes and dyes.'
                      : 'Refresh to try loading your ship designs again.'}
                  </p>
                </div>
              )
            )}
          </LoadingRegion>
          <footer className={styles.footer}>
            <RenderProgress equipment={equipment} busy={busy} run={run} />
            <div className={styles.feedback}>
              {notice && <p role="status">{notice}</p>}
              {(error || providerError || refreshError) && (
                <p role="alert" className={styles.warning}>
                  {error || providerError || refreshError}
                </p>
              )}
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  size="small"
                  disabled={busy || loading}
                  onClick={() => void refresh()}
                >
                  Refresh status
                </Button>
                {equipment?.design_id && (
                  <Button
                    variant="ghost"
                    size="small"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        {
                          type: 'Reset',
                          target,
                          expected_equipment_revision: equipment.revision,
                        },
                        'Standard fleet appearance restored. Your designs remain saved.',
                      )
                    }
                  >
                    Use standard appearance
                  </Button>
                )}
              </div>
            </div>
          </footer>
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
