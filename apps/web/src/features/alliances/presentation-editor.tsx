import { CosmeticColor, CosmeticTreatments } from '../rewards/cosmetic-controls'
import { useState, type ReactNode } from 'react'
import type { components } from '../../contracts'
import type { AllianceDetail } from '../../client-model/alliances'
import { useGameSession } from '../../shell/session-context'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { Field, Input, Select } from '../../ui/form'
import { LoadingRegion } from '../../ui/loading-region'
import { InsigniaComposer } from '../insignia-composer'
import {
  layeredRecipe,
  compositionAppearance,
} from '../../client-model/insignia-composer'
import { AllianceCrestMark, AllianceArtwork } from './visual-identity'
import type { Run } from './shared'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { Trash2 } from 'lucide-react'
import {
  imagePlacement,
  mediaPath,
  editorMediaUsage,
  publicWithDraft,
  templateGallery,
  templatePlacement,
  templateSections,
  type Placement,
} from './presentation-model'
import { PublicAllianceTemplate } from './public-template'
import { PresentationPreview } from './presentation-preview'
import { usePresentationEditor } from './use-presentation-editor'
import { ImageUploadField } from './image-upload-field'
import styles from './presentation.module.css'
type S = components['schemas']
type Editor = ReturnType<typeof usePresentationEditor>
type EditorSection = 'Identity' | 'Hall' | 'Public page' | 'Media'

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className={styles.editorSection}>
      <header>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </header>
      <div className={styles.editorFields}>{children}</div>
    </section>
  )
}

function ImageChoice({
  label,
  value,
  onChange,
  editor,
  universe,
}: {
  label: string
  value: Placement | null
  onChange: (p: Placement | null) => void
  editor: Editor
  universe: string
}) {
  const media = editor.library?.media.filter((m) => m.state === 'ready') ?? []
  return (
    <div className={styles.placement}>
      <Field>
        {label}
        <Select
          value={value?.media_id ?? ''}
          onChange={(e) =>
            onChange(e.target.value ? imagePlacement(e.target.value) : null)
          }
        >
          <option value="">Use default artwork</option>
          {value && !media.some((m) => m.id === value.media_id) && (
            <option value={value.media_id}>Selected image unavailable</option>
          )}
          {media.map((m) => (
            <option key={m.id} value={m.id}>
              {m.filename}
            </option>
          ))}
        </Select>
      </Field>
      <ImageUploadField
        label="Upload an image"
        maxFileBytes={editor.catalog?.max_file_bytes}
        onSelect={(file) => {
          void editor.upload(file).then((m) => {
            if (m) onChange(imagePlacement(m.id))
          })
        }}
      />
      {value && (
        <>
          <div className={styles.mediaRow}>
            <AllianceArtwork universe={universe} placement={value} still />
            <small>Adjust the focal point for desktop and mobile.</small>
          </div>
          <Field>
            Image description
            <Input
              value={value.alt}
              maxLength={300}
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
            />
          </Field>
          <div className={styles.placementControls}>
            {(['x', 'y', 'mobile_x', 'mobile_y'] as const).map((key, i) => (
              <Field key={key}>
                {
                  [
                    'Desktop horizontal',
                    'Desktop vertical',
                    'Mobile horizontal',
                    'Mobile vertical',
                  ][i]
                }
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={value[key] ?? value[key === 'mobile_x' ? 'x' : 'y']}
                  onChange={(e) =>
                    onChange({ ...value, [key]: Number(e.target.value) })
                  }
                />
              </Field>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function IdentityFields({ editor }: { editor: Editor }) {
  const { view } = useGameSession(),
    identity = editor.draft.identity
  const set = (patch: Partial<typeof identity>) =>
    editor.edit({ identity: { ...identity, ...patch } })
  const recipe =
    identity.crest.kind === 'composition' ? identity.crest.recipe : null
  const snapshot: S['InsigniaState'] = {
    binding: view.binding,
    request_id: view.binding.player,
    library: {
      designs: [],
      equipped: null,
      permanent_symbols: editor.catalog?.symbols.map((s) => s.id) ?? [],
    },
    catalog: editor.catalog?.symbols ?? [],
    dyes: editor.catalog?.dyes?.map((d) => ({
      ...d,
      availability: 'available' as const,
    })),
    treatments: editor.catalog?.treatments?.map((t) => ({
      ...t,
      availability: 'available' as const,
    })),
    policy: 'unrestricted',
    appearance: null,
    expires_at: Number.MAX_SAFE_INTEGER,
    composition_access: 'available',
  }
  function setRecipe(next: S['InsigniaRecipe']) {
    const order = ['stripes', 'center', 'accents']
    const layers = next.layers
      ? [...next.layers].sort(
          (a, b) =>
            order.indexOf(
              snapshot.catalog.find((i) => i.id === a.symbol)?.group ??
                'legacy',
            ) -
            order.indexOf(
              snapshot.catalog.find((i) => i.id === b.symbol)?.group ??
                'legacy',
            ),
        )
      : undefined
    set({
      crest: {
        kind: 'composition',
        recipe: { ...next, ...(layers ? { layers } : {}) },
      },
    })
  }
  return (
    <>
      <Section
        title="Alliance style"
        description="One identity for your Hall and public page."
      >
        <Field>
          Motto
          <Input
            value={identity.motto}
            maxLength={160}
            onChange={(e) => set({ motto: e.target.value })}
          />
        </Field>
        <div className={styles.colorFields}>
          <Field>
            Primary color
            {snapshot.dyes?.length ? (
              <Select
                value={identity.primary}
                onChange={(e) => set({ primary: e.target.value })}
              >
                {!snapshot.dyes.some(
                  (d) => d.access === 'free' && d.color === identity.primary,
                ) && (
                  <option value={identity.primary}>Saved theme color</option>
                )}
                {snapshot.dyes
                  .filter((d) => d.access === 'free')
                  .map((d) => (
                    <option key={d.id} value={d.color}>
                      {d.name}
                    </option>
                  ))}
              </Select>
            ) : (
              <input
                type="color"
                value={identity.primary}
                onChange={(e) => set({ primary: e.target.value })}
              />
            )}
          </Field>
          <Field>
            Secondary color
            {snapshot.dyes?.length ? (
              <Select
                value={identity.secondary}
                onChange={(e) => set({ secondary: e.target.value })}
              >
                {!snapshot.dyes.some(
                  (d) => d.access === 'free' && d.color === identity.secondary,
                ) && (
                  <option value={identity.secondary}>Saved theme color</option>
                )}
                {snapshot.dyes
                  .filter((d) => d.access === 'free')
                  .map((d) => (
                    <option key={d.id} value={d.color}>
                      {d.name}
                    </option>
                  ))}
              </Select>
            ) : (
              <input
                type="color"
                value={identity.secondary}
                onChange={(e) => set({ secondary: e.target.value })}
              />
            )}
          </Field>
        </div>
      </Section>
      <Section
        title="Crest"
        description="Build an emblem, equip earned alliance distinctions, or upload your own. Recruitment honors belong to the alliance."
      >
        <div className={styles.crestPreview}>
          <AllianceCrestMark
            universe={view.binding.universe}
            identity={
              recipe
                ? {
                    ...identity,
                    crest: {
                      kind: 'composition',
                      recipe,
                      appearance: compositionAppearance(snapshot, recipe),
                    },
                  }
                : identity
            }
          />
          <Select
            aria-label="Crest source"
            value={recipe ? 'composition' : 'upload'}
            onChange={(e) => {
              if (e.target.value === 'composition')
                set({
                  crest: {
                    kind: 'composition',
                    recipe: layeredRecipe({
                      version: 1,
                      symbol: 'compass',
                      foreground: identity.primary,
                      background: '#152b40',
                    }),
                  },
                })
              else {
                const first = editor.library?.media.find(
                  (m) => m.state === 'ready',
                )
                if (first)
                  set({ crest: { kind: 'upload', media_id: first.id } })
              }
            }}
          >
            <option value="composition">Compose an emblem</option>
            <option
              value="upload"
              disabled={!editor.library?.media.some((m) => m.state === 'ready')}
            >
              Use an uploaded image
            </option>
          </Select>
        </div>
        {recipe ? (
          <>
            {recipe.layers === undefined ? (
              <>
                <Field>
                  Symbol
                  <Select
                    value={recipe.symbol}
                    onChange={(e) =>
                      setRecipe({ ...recipe, symbol: e.target.value })
                    }
                  >
                    {snapshot.catalog
                      .filter((s) => (s.group ?? 'legacy') === 'legacy')
                      .map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <div className={styles.colorFields}>
                  <CosmeticColor
                    snapshot={snapshot}
                    label="Symbol color"
                    value={recipe.foreground}
                    disabled={editor.working}
                    onChange={(color) =>
                      setRecipe({
                        ...recipe,
                        version: snapshot.dyes?.length ? 3 : recipe.version,
                        foreground: color,
                      })
                    }
                  />
                  <CosmeticColor
                    snapshot={snapshot}
                    label="Background color"
                    value={recipe.background}
                    disabled={editor.working}
                    onChange={(color) =>
                      setRecipe({
                        ...recipe,
                        version: snapshot.dyes?.length ? 3 : recipe.version,
                        background: color,
                      })
                    }
                  />
                </div>
                <CosmeticTreatments
                  snapshot={snapshot}
                  recipe={recipe}
                  busy={editor.working}
                  onChange={setRecipe}
                />
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setRecipe(layeredRecipe(recipe))}
                >
                  Build a layered emblem
                </Button>
              </>
            ) : (
              <InsigniaComposer
                snapshot={snapshot}
                recipe={recipe}
                now={0}
                busy={editor.working}
                onChange={setRecipe}
              />
            )}
          </>
        ) : (
          <Field>
            Crest image
            <Select
              value={
                identity.crest.kind === 'upload' ? identity.crest.media_id : ''
              }
              onChange={(e) =>
                set({ crest: { kind: 'upload', media_id: e.target.value } })
              }
            >
              {editor.library?.media
                .filter((m) => m.state === 'ready')
                .map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.filename}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <ImageUploadField
          label="Upload a crest"
          maxFileBytes={editor.catalog?.max_file_bytes}
          onSelect={(file) => {
            void editor.upload(file).then((m) => {
              if (m) set({ crest: { kind: 'upload', media_id: m.id } })
            })
          }}
        />
      </Section>
      <Section
        title="Banner"
        description="Shown publicly with your alliance. The Hall can use different, private artwork."
      >
        <ImageChoice
          label="Alliance banner"
          value={identity.banner}
          onChange={(banner) => set({ banner })}
          editor={editor}
          universe={view.binding.universe}
        />
      </Section>
    </>
  )
}
function HallFields({ editor }: { editor: Editor }) {
  const { view } = useGameSession(),
    hall = editor.draft.hall
  const set = (patch: Partial<typeof hall>) =>
    editor.edit({ hall: { ...hall, ...patch } })
  return (
    <>
      <Section
        title="Welcome home"
        description="Only your alliance members see this message."
      >
        <Field>
          Welcome message
          <textarea
            aria-label="Welcome message"
            value={hall.welcome_markdown}
            maxLength={8000}
            onChange={(e) => set({ welcome_markdown: e.target.value })}
          />
          <small>Markdown supported. Pasted URLs become links.</small>
        </Field>
        <Field>
          Community links
          <textarea
            aria-label="Community links"
            value={hall.community_markdown}
            maxLength={4000}
            onChange={(e) => set({ community_markdown: e.target.value })}
          />
          <small>Discord, your website, or useful resources for members.</small>
        </Field>
      </Section>
      <Section
        title="Hall artwork"
        description="This image stays within the Hall unless you also select it for your public page."
      >
        <ImageChoice
          label="Hall background"
          value={hall.background}
          onChange={(background) => set({ background })}
          editor={editor}
          universe={view.binding.universe}
        />
      </Section>
    </>
  )
}
function TemplateFields({ editor }: { editor: Editor }) {
  const { view } = useGameSession(),
    template = editor.catalog?.templates.find(
      (t) => t.id === editor.draft.active_template,
    )
  const content =
    editor.draft.templates[editor.draft.active_template]?.content ?? {}
  const set = (key: string, value: unknown) =>
    editor.template({ ...content, [key]: value })
  return (
    <>
      <Section
        title="Template"
        description="Each template keeps its own saved content."
      >
        <div className={styles.templateChoices}>
          {editor.catalog?.templates.map((t) => (
            <button
              key={t.id}
              className={styles.templateChoice}
              type="button"
              aria-pressed={editor.draft.active_template === t.id}
              onClick={() => editor.edit({ active_template: t.id })}
            >
              <strong>{t.name}</strong>
              <p>{t.description}</p>
            </button>
          ))}
        </div>
      </Section>
      {!template ? (
        <p role="alert">
          This template is not installed. Its saved content is preserved. Choose
          another template to continue.
        </p>
      ) : (
        template.fields.map((field) => {
          const value = content[field.key]
          if (field.kind === 'text' || field.kind === 'markdown')
            return (
              <Section key={field.key} title={field.label}>
                <Field>
                  <span className={styles.srOnly}>{field.label}</span>
                  {field.kind === 'text' ? (
                    <Input
                      aria-label={field.label}
                      value={typeof value === 'string' ? value : ''}
                      maxLength={field.max_length}
                      onChange={(e) => set(field.key, e.target.value)}
                    />
                  ) : (
                    <>
                      <textarea
                        aria-label={field.label}
                        value={typeof value === 'string' ? value : ''}
                        maxLength={field.max_length}
                        rows={field.key === 'letter_markdown' ? 10 : 4}
                        onChange={(e) => set(field.key, e.target.value)}
                      />
                      <small>
                        Markdown supported. Pasted URLs become links.
                      </small>
                    </>
                  )}
                </Field>
              </Section>
            )
          if (field.kind === 'media')
            return (
              <Section key={field.key} title={field.label}>
                <ImageChoice
                  label={field.label}
                  value={templatePlacement(value)}
                  onChange={(v) => set(field.key, v)}
                  editor={editor}
                  universe={view.binding.universe}
                />
              </Section>
            )
          if (field.kind === 'gallery') {
            const items = templateGallery(content)
            return (
              <Section
                key={field.key}
                title="Gallery"
                description="Images and their descriptions appear on your public page."
              >
                {items.map((p, index) => (
                  <div className={styles.repeatItem} key={index}>
                    <ImageChoice
                      label={`Image ${index + 1}`}
                      value={p}
                      onChange={(v) =>
                        set(
                          field.key,
                          v
                            ? items.map((item, i) => (i === index ? v : item))
                            : items.filter((_, i) => i !== index),
                        )
                      }
                      editor={editor}
                      universe={view.binding.universe}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        set(
                          field.key,
                          items.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove image {index + 1}
                    </Button>
                  </div>
                ))}
                <Field>
                  Add a gallery image
                  <Select
                    value=""
                    disabled={items.length >= field.max_length}
                    onChange={(e) => {
                      if (e.target.value)
                        set(field.key, [
                          ...items,
                          imagePlacement(e.target.value),
                        ])
                    }}
                  >
                    <option value="">Choose an uploaded image</option>
                    {editor.library?.media
                      .filter((m) => m.state === 'ready')
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.filename}
                        </option>
                      ))}
                  </Select>
                </Field>
              </Section>
            )
          }
          if (field.kind === 'sections') {
            const items = templateSections(content)
            return (
              <Section key={field.key} title="Your story">
                {items.map((s, index) => (
                  <div className={styles.repeatItem} key={index}>
                    <Field>
                      Section {index + 1} heading
                      <Input
                        value={s.heading}
                        maxLength={120}
                        onChange={(e) =>
                          set(
                            field.key,
                            items.map((item, i) =>
                              i === index
                                ? { ...item, heading: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field>
                      Section {index + 1} text
                      <textarea
                        value={s.markdown}
                        maxLength={8000}
                        onChange={(e) =>
                          set(
                            field.key,
                            items.map((item, i) =>
                              i === index
                                ? { ...item, markdown: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        set(
                          field.key,
                          items.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove section {index + 1}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={items.length >= field.max_length}
                  onClick={() =>
                    set(field.key, [...items, { heading: '', markdown: '' }])
                  }
                >
                  Add a section
                </Button>
              </Section>
            )
          }
          return null
        })
      )}
    </>
  )
}
function MediaLibrary({ editor }: { editor: Editor }) {
  const { view } = useGameSession(),
    media = editor.library?.media ?? []
  const usage = media.reduce(
    (sum, m) => sum + Math.max(m.declared_bytes, m.receipt?.bytes ?? 0),
    0,
  )
  return (
    <>
      <div className={styles.uploadField}>
        <h3>Alliance images</h3>
        <p>
          {media.filter((m) => m.state === 'ready').length}{' '}
          {media.filter((m) => m.state === 'ready').length === 1
            ? 'image'
            : 'images'}{' '}
          · {(usage / 1048576).toFixed(1)} MiB of{' '}
          {(editor.library?.max_total_bytes ?? 209715200) / 1048576} MiB
        </p>
        <ImageUploadField
          label="Upload artwork"
          maxFileBytes={editor.catalog?.max_file_bytes}
          onSelect={(file) => void editor.upload(file)}
        />
      </div>
      <div className={styles.mediaGrid}>
        {media
          .filter((m) => m.state === 'ready')
          .map((m) => (
            <article key={m.id} className={styles.mediaTile}>
              <img
                src={mediaPath(view.binding.universe, m.id, true, 256)}
                alt=""
              />
              <p>{m.filename}</p>
              <small>
                {((m.receipt?.bytes ?? m.declared_bytes) / 1048576).toFixed(2)}{' '}
                MiB
              </small>
              <small>
                {editorMediaUsage(editor.saved, editor.draft, m.id).length
                  ? `Used by ${editorMediaUsage(editor.saved, editor.draft, m.id).join(', ')}`
                  : 'Unattached · private'}
              </small>
              <ConfirmationButton
                variant="ghost"
                size="icon-touch"
                aria-label={`Delete ${m.filename}`}
                title="Delete image"
                dialogTitle="Delete this image?"
                review={
                  <p>
                    {m.filename} will be removed from the alliance library.
                    Images used in saved templates or the Hall must be detached
                    first. Save or discard edits before deleting an image they
                    use.
                  </p>
                }
                confirmLabel="Delete image"
                disabled={
                  editor.working ||
                  editorMediaUsage(editor.saved, editor.draft, m.id).length > 0
                }
                onConfirm={() => void editor.remove(m.id)}
              >
                <Trash2 size={16} aria-hidden="true" />
              </ConfirmationButton>
            </article>
          ))}
      </div>
    </>
  )
}

export function PresentationEditor({
  detail,
  run,
  busy,
  section,
}: {
  detail: AllianceDetail
  run: Run
  busy: boolean
  section: EditorSection
}) {
  const editor = usePresentationEditor(detail, run),
    { universeName } = useGameSession(),
    [preview, setPreview] = useState(false)
  const publicData = publicWithDraft(
    {
      summary: detail.summary,
      public_text: detail.public_text,
      universe_name: universeName,
    },
    editor.draft,
  )
  const disabled = busy || editor.working
  return (
    <section aria-label="Alliance presentation editor">
      {editor.operation === 'upload' && <p role="status">Uploading artwork…</p>}
      {editor.error && <p role="alert">{editor.error}</p>}
      {editor.notice && <p role="status">{editor.notice}</p>}
      {editor.stale && (
        <div role="alert">
          <p>
            The alliance changed while you were editing. Your edits are
            preserved.
          </p>
          <Button variant="secondary" onClick={editor.reviewRevision}>
            Keep my edits against the latest version
          </Button>
          <Button variant="ghost" onClick={editor.discard}>
            Discard my edits
          </Button>
        </div>
      )}
      {editor.pendingUpload && !editor.working && (
        <Button
          variant="secondary"
          onClick={() =>
            void editor.upload(
              editor.pendingUpload!.file,
              editor.pendingUpload!.id,
            )
          }
        >
          Retry upload
        </Button>
      )}
      <LoadingRegion
        loading={editor.loading}
        label="Loading alliance customization…"
      >
        {editor.catalog ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void editor.save()
            }}
          >
            <fieldset disabled={disabled} className={styles.editorForm}>
              {section === 'Identity' ? (
                <IdentityFields editor={editor} />
              ) : section === 'Hall' ? (
                <HallFields editor={editor} />
              ) : section === 'Public page' ? (
                <TemplateFields editor={editor} />
              ) : (
                <MediaLibrary editor={editor} />
              )}
              <div className={styles.editorFooter}>
                {section === 'Public page' && (
                  <ButtonLinkAnchor
                    variant="ghost"
                    size="small"
                    href={`/api/v4/universes/${detail.summary.universe}/alliances/${detail.summary.id}/image`}
                    download={`${detail.summary.tag}-recruitment.png`}
                  >
                    Download published card
                  </ButtonLinkAnchor>
                )}
                {editor.dirty && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={editor.discard}
                  >
                    Discard edits
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPreview(true)}
                >
                  Preview public page
                </Button>
                {section !== 'Media' && (
                  <Button
                    type="submit"
                    disabled={!editor.dirty || editor.stale}
                  >
                    {editor.operation === 'upload'
                      ? 'Uploading…'
                      : editor.operation === 'delete'
                        ? 'Removing…'
                        : editor.working
                          ? 'Saving…'
                          : 'Save presentation'}
                  </Button>
                )}
              </div>
            </fieldset>
          </form>
        ) : (
          !editor.loading && (
            <Button onClick={editor.reload}>Reload customization</Button>
          )
        )}
      </LoadingRegion>
      <PresentationPreview open={preview} onClose={() => setPreview(false)}>
        <PublicAllianceTemplate
          data={publicData}
          preview
          action={
            <Button disabled>
              {detail.summary.recruitment === 'Open'
                ? `Join ${detail.summary.name}`
                : `Apply to ${detail.summary.name}`}
            </Button>
          }
        />
      </PresentationPreview>
    </section>
  )
}
