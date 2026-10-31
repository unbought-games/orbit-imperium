import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import { Button } from '../ui/button'
import { defaultInsignia } from '../client-model/insignias'
import { EmpireInsignia } from './empire-insignia'
import { useInsigniaEditor } from './use-insignia-editor'
import styles from './insignia.module.css'

export function InsigniaEditor() {
  const editor = useInsigniaEditor()
  const { snapshot, design } = editor
  const symbol = snapshot?.catalog.find((s) => s.id === design?.recipe.symbol)
  const previewSymbol =
    symbol ?? snapshot?.catalog.find((s) => s.id === defaultInsignia.symbol)
  return (
    <Section aria-label="Empire insignia" className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <Heading level={2}>Empire insignia</Heading>
          <Text>
            Fly your own symbol, or explore without one. Insignias are optional.
          </Text>
        </div>
        {editor.currentAppearance && (
          <EmpireInsignia
            appearance={editor.currentAppearance}
            size="medium"
            label="Current empire insignia"
          />
        )}
      </div>
      {editor.error && (
        <p role="alert">
          {editor.error}{' '}
          <Button
            variant="ghost"
            size="small"
            disabled={editor.busy}
            onClick={() => void editor.reload()}
          >
            Reload library
          </Button>
        </p>
      )}
      {!snapshot ? (
        <Text>
          {editor.error
            ? 'Try reloading when the connection returns.'
            : 'Loading your designs…'}
        </Text>
      ) : (
        <>
          {!snapshot.library.equipped && <Text>No insignia equipped.</Text>}
          <div className={styles.library}>
            <label>
              Saved designs
              <select
                value={design?.revision ? design.id : ''}
                disabled={editor.busy}
                onChange={(e) => editor.select(e.target.value)}
              >
                <option value="" disabled>
                  Choose a design
                </option>
                {snapshot.library.designs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.id === snapshot.library.equipped ? ' · Equipped' : ''}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              disabled={editor.busy || snapshot.library.designs.length >= 32}
              onClick={editor.create}
            >
              New design
            </Button>
          </div>
          {!design ? (
            <div className={styles.empty}>
              <Text>
                Your collection starts here. Choose a symbol and make it yours.
              </Text>
              <Text>
                Designs belong to your account. Each universe can fly a
                different insignia.
              </Text>
            </div>
          ) : (
            <form
              aria-label="Customize insignia"
              onSubmit={(e) => {
                e.preventDefault()
                void editor.save()
              }}
            >
              <div className={styles.workspace}>
                <div className={styles.preview}>
                  {previewSymbol && (
                    <EmpireInsignia
                      appearance={{
                        recipe: symbol ? design.recipe : defaultInsignia,
                        asset_url: previewSymbol.asset_url,
                      }}
                      size="large"
                      label="Insignia preview"
                    />
                  )}
                  <strong>{design.name || 'Your insignia'}</strong>
                  <small>
                    {editor.draft
                      ? 'Preview · Unsaved changes'
                      : design.id === snapshot.library.equipped
                        ? editor.access(design.recipe.symbol) === 'available'
                          ? 'Equipped in this universe'
                          : 'Selected · Using the default for now'
                        : 'Saved in your collection'}
                  </small>
                </div>
                <div className={styles.controls}>
                  <label>
                    Design name
                    <input
                      value={design.name}
                      maxLength={80}
                      disabled={editor.busy}
                      onChange={(e) => editor.edit({ name: e.target.value })}
                    />
                  </label>
                  <fieldset disabled={editor.busy}>
                    <legend>Choose a symbol</legend>
                    <div className={styles.symbols}>
                      {snapshot.catalog.map((item) => {
                        const access = editor.access(item.id)
                        const permanent =
                          snapshot.library.permanent_symbols.includes(item.id)
                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={design.recipe.symbol === item.id}
                            aria-label={`${item.name}${access === 'available' ? '' : ' · Supporter access required'}`}
                            disabled={access !== 'available'}
                            onClick={() =>
                              editor.edit({
                                recipe: {
                                  ...design.recipe,
                                  symbol:
                                    item.id as typeof design.recipe.symbol,
                                },
                              })
                            }
                          >
                            <EmpireInsignia
                              appearance={{
                                recipe: {
                                  ...design.recipe,
                                  symbol:
                                    item.id as typeof design.recipe.symbol,
                                },
                                asset_url: item.asset_url,
                              }}
                              size="medium"
                            />
                            <span>{item.name}</span>
                            <small
                              title={
                                permanent ? 'Permanently unlocked' : undefined
                              }
                              aria-label={
                                permanent ? 'Permanently unlocked' : undefined
                              }
                            >
                              {permanent
                                ? 'Unlocked'
                                : item.supporter
                                  ? snapshot.policy === 'unrestricted'
                                    ? 'Included'
                                    : 'Supporter'
                                  : 'Free'}
                            </small>
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                  {snapshot.policy === 'supporter' &&
                    snapshot.catalog.some((item) => item.supporter) && (
                      <Text>
                        {snapshot.catalog.some(
                          (item) =>
                            item.supporter &&
                            editor.access(item.id) === 'unavailable',
                        )
                          ? 'Supporter verification is temporarily unavailable. Free and permanently unlocked symbols remain available.'
                          : 'Supporters can use additional symbols. Permanent unlocks remain yours after membership ends.'}
                      </Text>
                    )}
                  <div className={styles.colors}>
                    <label>
                      Symbol color
                      <input
                        type="color"
                        aria-label="Symbol color"
                        value={design.recipe.foreground}
                        disabled={editor.busy}
                        onChange={(e) =>
                          editor.edit({
                            recipe: {
                              ...design.recipe,
                              foreground: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Background color
                      <input
                        type="color"
                        aria-label="Background color"
                        value={design.recipe.background}
                        disabled={editor.busy}
                        onChange={(e) =>
                          editor.edit({
                            recipe: {
                              ...design.recipe,
                              background: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              </div>
              {editor.access(design.recipe.symbol) !== 'available' && (
                <Text>
                  {editor.access(design.recipe.symbol) === 'not_installed'
                    ? 'This symbol is not installed on this server. Your saved design is preserved. Choose an available symbol or ask your server operator about the missing content.'
                    : 'This design is preserved in your collection. Your empire displays the default insignia until access returns or you equip another design.'}
                </Text>
              )}
              <div className={styles.actions}>
                <Button type="submit" disabled={!editor.canSave}>
                  {editor.busy ? 'Saving…' : 'Save & equip'}
                </Button>
                {editor.draft ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={editor.busy}
                    onClick={editor.cancel}
                  >
                    Discard changes
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        editor.busy ||
                        design.id === snapshot.library.equipped ||
                        editor.access(design.recipe.symbol) !== 'available'
                      }
                      onClick={() => void editor.equip()}
                    >
                      Equip design
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={editor.busy}
                      onClick={() => void editor.remove()}
                    >
                      Delete design
                    </Button>
                  </>
                )}
              </div>
            </form>
          )}
          <div className={styles.footer}>
            <Text>
              {snapshot.library.designs.length}/32 saved designs · Editing a
              saved design updates every empire using it.
            </Text>
            {snapshot.library.equipped && (
              <Button
                variant="ghost"
                size="small"
                disabled={editor.busy}
                onClick={() => void editor.reset()}
              >
                Remove insignia
              </Button>
            )}
          </div>
        </>
      )}
      <p role="status" className={styles.status}>
        {editor.message}
      </p>
    </Section>
  )
}
