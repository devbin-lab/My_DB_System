import { useCallback, useEffect, useState } from 'react'
import type { LibraryItem, Pivot } from './types'
import { useT } from './i18n'
import { IconX } from './Icons'
import { ConfirmDialog } from './graph/overlays'
import { extLabel } from './util/format'

export default function TrashModal({
  onClose,
  onChanged
}: {
  onClose: () => void
  onChanged: () => void
}) {
  const t = useT()
  const [items, setItems] = useState<LibraryItem[]>([])
  const [pivots, setPivots] = useState<Pivot[]>([])
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const load = useCallback(async () => {
    const tr = await window.api.listTrash()
    setItems(tr.items)
    setPivots(tr.pivots)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const restore = async (kind: 'item' | 'pivot', id: string) => {
    await window.api.restoreTrash(kind, id)
    await load()
    onChanged()
  }
  const purge = async (kind: 'item' | 'pivot', id: string) => {
    await window.api.purgeTrash(kind, id)
    await load()
    onChanged()
  }
  const empty = async () => {
    setConfirmEmpty(false)
    await window.api.emptyTrash()
    await load()
    onChanged()
  }

  const isEmpty = items.length === 0 && pivots.length === 0

  return (
    <>
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('trash.title')}</h2>
          <button className="icon-only" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="modal-body">
          {isEmpty ? (
            <div className="empty">{t('trash.isEmpty')}</div>
          ) : (
            <>
              {pivots.length > 0 && (
                <section className="settings-group">
                  <h3>{t('trash.pivotsSection')}</h3>
                  {pivots.map((p) => (
                    <div className="trash-row" key={p.id}>
                      <span className="trash-name">{p.name}</span>
                      <div className="trash-actions">
                        <button className="btn-ghost" onClick={() => restore('pivot', p.id)}>
                          {t('trash.restore')}
                        </button>
                        <button className="btn-ghost danger" onClick={() => purge('pivot', p.id)}>
                          {t('trash.purge')}
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {items.length > 0 && (
                <section className="settings-group">
                  <h3>{t('trash.filesSection')}</h3>
                  {items.map((it) => (
                    <div className="trash-row" key={it.id}>
                      <span className="trash-ext">{extLabel(it)}</span>
                      <span className="trash-name" title={it.name}>
                        {it.name}
                      </span>
                      <div className="trash-actions">
                        <button className="btn-ghost" onClick={() => restore('item', it.id)}>
                          {t('trash.restore')}
                        </button>
                        <button className="btn-ghost danger" onClick={() => purge('item', it.id)}>
                          {t('trash.purge')}
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              <div className="trash-foot">
                <button className="btn-ghost danger" onClick={() => setConfirmEmpty(true)}>
                  {t('trash.empty')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

    {confirmEmpty && (
      <ConfirmDialog
        message={t('trash.emptyConfirm')}
        confirmLabel={t('trash.empty')}
        onConfirm={empty}
        onCancel={() => setConfirmEmpty(false)}
      />
    )}
    </>
  )
}
