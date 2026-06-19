import { lazy, Suspense } from 'react'
import type { LibraryItem } from '../types'
import { useT } from '../i18n'
import { IconEye, IconList, IconX } from '../Icons'

const Viewer = lazy(() => import('../Viewer'))

// 그래프/통합 뷰의 읽기 전용 미리보기 패널
export default function PreviewPanel({
  item,
  allTags,
  onOpenInList,
  onClose
}: {
  item: LibraryItem
  allTags: string[]
  onOpenInList: () => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <div className="preview-panel">
      <div className="preview-bar">
        <span className="preview-title">
          <IconEye size={14} />
          {t('app.preview.readOnly')}
        </span>
        <div className="preview-bar-actions">
          <button onClick={onOpenInList}>
            <IconList size={13} />
            <span>{t('app.preview.openInList')}</span>
          </button>
          <button className="icon-only" onClick={onClose}>
            <IconX size={14} />
          </button>
        </div>
      </div>
      <Suspense fallback={<div className="empty">{t('common.loading')}</div>}>
        <Viewer key={item.id} item={item} readOnly allTags={allTags} />
      </Suspense>
    </div>
  )
}
