import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { components } from '../../contracts'
import type { AllianceDetail } from '../../client-model/alliances'
import { useGameSession } from '../../shell/session-context'
import { useAuthSession } from '../../shell/auth-context'
import {
  allianceMedia,
  presentationCatalog,
  uploadAllianceMedia,
} from '../../adapters/alliance-presentation'
import { HttpError } from '../../adapters/http'
import { commandId } from '../../adapters/command-id'
import { AllianceDraftContext } from './drafts'
import {
  defaultPresentation,
  editPresentationDraft,
  type PresentationDraft,
  type Presentation,
  type TemplateDocument,
} from './presentation-model'
import type { Run } from './shared'
type S = components['schemas']
type Edits = PresentationDraft
const emptyEdits = (): Edits => ({ templates: {} })
export function usePresentationEditor(detail: AllianceDetail, run: Run) {
  const { view } = useGameSession(),
    { runtime } = useAuthSession(),
    drafts = useContext(AllianceDraftContext)
  const { account, player, universe, epoch } = view.binding
  const binding = useMemo(
    () => ({ account, player, universe, epoch }),
    [account, player, universe, epoch],
  )
  const csrf = runtime.status === 'authenticated' ? runtime.session.csrf : ''
  const key = `presentation:${detail.summary.id}`
  const [edits, setEdits] = useState<Edits>(
    () => (drafts?.authored.get(key) as Edits | undefined) ?? emptyEdits(),
  )
  const [catalog, setCatalog] = useState<
    S['AlliancePresentationCatalog'] | null
  >(null)
  const [library, setLibrary] = useState<S['AllianceMediaLibrary'] | null>(null)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true),
    [operation, setOperation] = useState<'save' | 'upload' | 'delete' | null>(
      null,
    )
  const working = operation !== null
  const [pendingUpload, setPendingUpload] = useState<{
    id: string
    file: File
  } | null>(null)
  const [reloadKey, reload] = useState(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    drafts?.authored.set(key, edits)
  }, [drafts, key, edits])
  const dirty = edits.revision !== undefined
  useEffect(() => {
    const abort = new AbortController()
    let active = true
    setLoading(true)
    void Promise.all([
      presentationCatalog(abort.signal),
      allianceMedia(binding, csrf, detail.summary.id, { type: 'List' }),
    ])
      .then(([c, l]) => {
        if (active) {
          setCatalog(c)
          setLibrary(l)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (active) {
          setError(
            e instanceof Error ? e.message : 'Could not load customization.',
          )
          setLoading(false)
        }
      })
    return () => {
      active = false
      abort.abort()
    }
  }, [binding, csrf, detail.summary.id, reloadKey])
  const saved = detail.presentation?.editor ?? defaultPresentation()
  const draft: Presentation = {
    ...saved,
    ...(edits.identity ? { identity: edits.identity } : {}),
    ...(edits.hall ? { hall: edits.hall } : {}),
    active_template: edits.active_template ?? saved.active_template,
    templates: { ...saved.templates, ...edits.templates },
  }
  function edit(patch: Partial<Edits>) {
    setEdits((old) => editPresentationDraft(saved, old, patch, detail.revision))
    setNotice('')
  }
  function template(content: TemplateDocument['content']) {
    edit({
      templates: {
        ...edits.templates,
        [draft.active_template]: { schema_version: 1, content },
      },
    })
  }
  async function save() {
    if (working || !dirty) return
    setOperation('save')
    setError('')
    setNotice('')
    const operations: S['PresentationEdit'][] = []
    if (edits.identity)
      operations.push({
        type: 'SetIdentity',
        schema_version: 1,
        value: edits.identity,
      })
    if (edits.hall)
      operations.push({ type: 'SetHall', schema_version: 1, value: edits.hall })
    for (const [id, document] of Object.entries(edits.templates))
      operations.push({
        type: 'SetTemplateDocument',
        template_id: id,
        document,
      })
    if (edits.active_template)
      operations.push({
        type: 'SelectTemplate',
        template_id: edits.active_template,
      })
    const ok = await run(
      {
        type: 'SavePresentation',
        alliance: detail.summary.id,
        edits: operations,
      },
      edits.revision,
    )
    if (!mounted.current) return
    if (ok) {
      setEdits(emptyEdits())
      drafts?.authored.delete(key)
      setNotice('Alliance presentation saved.')
    } else
      setError(
        'Changes were not saved. Your edits are still here. If the alliance changed, review the latest version before retrying.',
      )
    setOperation(null)
  }
  async function upload(file: File, id = commandId(crypto)) {
    if (working) return
    if (catalog?.max_file_bytes === 0) {
      setError('New uploads are disabled on this server.')
      return
    }
    if (file.size > (catalog?.max_file_bytes ?? 20 * 1024 * 1024)) {
      setError(
        `Choose an image no larger than ${(catalog?.max_file_bytes ?? 20971520) / 1048576} MiB.`,
      )
      return
    }
    setPendingUpload({ id, file })
    setOperation('upload')
    setError('')
    try {
      const uploaded = await uploadAllianceMedia(
        binding,
        csrf,
        detail.summary.id,
        file,
        id,
      )
      const l = await allianceMedia(binding, csrf, detail.summary.id, {
        type: 'List',
      })
      if (mounted.current) {
        setLibrary(l)
        setPendingUpload(null)
        setNotice(
          'Image uploaded. Choose it in your identity, Hall, or public page.',
        )
      }
      return uploaded
    } catch (e) {
      if (e instanceof HttpError && [400, 413, 422].includes(e.status)) {
        await allianceMedia(binding, csrf, detail.summary.id, {
          type: 'Delete',
          media_id: id,
        }).catch(() => undefined)
        if (mounted.current) setPendingUpload(null)
      }
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      if (mounted.current) setOperation(null)
    }
  }
  async function remove(id: string) {
    if (working) return false
    setOperation('delete')
    setError('')
    try {
      await allianceMedia(binding, csrf, detail.summary.id, {
        type: 'Delete',
        media_id: id,
      })
      const l = await allianceMedia(binding, csrf, detail.summary.id, {
        type: 'List',
      })
      if (mounted.current) setLibrary(l)
      return true
    } catch {
      if (mounted.current)
        setError(
          'This image could not be removed. Detach it from every saved template and the Hall first, then try again.',
        )
      return false
    } finally {
      if (mounted.current) setOperation(null)
    }
  }
  return {
    draft,
    saved,
    catalog,
    library,
    error,
    notice,
    loading,
    working,
    operation,
    dirty,
    pendingUpload,
    template,
    save,
    upload,
    remove,
    reload: () => reload((n) => n + 1),
    edit,
    discard: () => {
      setEdits(emptyEdits())
      drafts?.authored.delete(key)
      setError('')
    },
    reviewRevision: () => {
      setEdits((old) => ({ ...old, revision: detail.revision }))
      setError('')
    },
    stale: dirty && edits.revision !== detail.revision,
  }
}
