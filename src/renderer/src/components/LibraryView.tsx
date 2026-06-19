import { lazy, Suspense } from 'react'
import type { ItemType, Language, LibraryItem } from '../types'
import { LOCALES, useT } from '../i18n'
import { TYPE_COLORS } from '../constants'
import { extLabel, formatSize } from '../util/format'
import { IconDownload, IconSearch, IconTrash, IconX } from '../Icons'

const Viewer = lazy(() => import('../Viewer'))

// 라이브러리(목록) 뷰: 검색 + 타입 필터/정렬 + 파일 목록 + 선택 뷰어
export default function LibraryView({
  items,
  filtered,
  presentTypes,
  typeFilter,
  setTypeFilter,
  sortBy,
  setSortBy,
  search,
  setSearch,
  selected,
  selectedId,
  setSelectedId,
  allTags,
  language,
  onRemove,
  onTagsChange
}: {
  items: LibraryItem[]
  filtered: LibraryItem[]
  presentTypes: ItemType[]
  typeFilter: ItemType | 'all'
  setTypeFilter: (t: ItemType | 'all') => void
  sortBy: 'recent' | 'name' | 'size'
  setSortBy: (s: 'recent' | 'name' | 'size') => void
  search: string
  setSearch: (s: string) => void
  selected: LibraryItem | null
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  allTags: string[]
  language: Language
  onRemove: (id: string) => void
  onTagsChange: () => void
}) {
  const t = useT()
  return (
    <section className="library">
      <aside className="lib-list">
        <div className="lib-search">
          <IconSearch size={15} />
          <input
            placeholder={t('app.lib.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="clear" onClick={() => setSearch('')}>
              <IconX size={13} />
            </button>
          )}
        </div>

        {/* 타입 필터 + 정렬 */}
        <div className="lib-toolbar">
          {presentTypes.length > 0 && (
            <div className="lib-filters">
              <button
                className={`type-chip ${typeFilter === 'all' ? 'on' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                {t('app.lib.filterAll')}
              </button>
              {presentTypes.map((tp) => (
                <button
                  key={tp}
                  className={`type-chip ${typeFilter === tp ? 'on' : ''}`}
                  style={
                    typeFilter === tp
                      ? { color: TYPE_COLORS[tp], borderColor: TYPE_COLORS[tp] }
                      : undefined
                  }
                  onClick={() => setTypeFilter(tp)}
                >
                  {t(`type.${tp}`)}
                </button>
              ))}
            </div>
          )}
          <select
            className="lib-sort"
            value={sortBy}
            title={t('app.lib.sortLabel')}
            onChange={(e) => setSortBy(e.target.value as 'recent' | 'name' | 'size')}
          >
            <option value="recent">{t('app.lib.sort.recent')}</option>
            <option value="name">{t('app.lib.sort.name')}</option>
            <option value="size">{t('app.lib.sort.size')}</option>
          </select>
        </div>

        <div className="lib-items">
          {filtered.length === 0 && (
            <div className="empty">
              {items.length === 0 ? (
                <>
                  <IconDownload size={28} />
                  <p>
                    {t('app.lib.emptyDrop')
                      .split('\n')
                      .map((line, i) => (
                        <span key={i}>
                          {i > 0 && <br />}
                          {line}
                        </span>
                      ))}
                  </p>
                </>
              ) : (
                <p>{t('app.lib.noResults')}</p>
              )}
            </div>
          )}
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`lib-card ${selectedId === item.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(item.id)}
            >
              <span
                className="ext-badge"
                style={{
                  color: TYPE_COLORS[item.type],
                  background: `${TYPE_COLORS[item.type]}1a`
                }}
              >
                {extLabel(item)}
              </span>
              <div className="lib-card-info">
                <div className="lib-card-name">{item.name}</div>
                <div className="lib-card-meta">
                  {formatSize(item.size)} ·{' '}
                  {new Date(item.createdAt).toLocaleDateString(LOCALES[language])}
                  {item.tags.length > 0 && (
                    <span className="lib-card-tags">
                      {' · '}
                      {item.tags.map((tag) => (
                        <button
                          key={tag}
                          className="tag-link"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSearch(tag)
                          }}
                        >
                          #{tag}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              </div>
              <button
                className="lib-card-del"
                title={t('app.lib.deleteTitle')}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(item.id)
                }}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="lib-viewer">
        {selected ? (
          <Suspense fallback={<div className="empty">{t('common.loading')}</div>}>
            <Viewer key={selected.id} item={selected} onTagsChange={onTagsChange} allTags={allTags} />
          </Suspense>
        ) : (
          <div className="empty">{t('app.lib.selectToView')}</div>
        )}
      </div>
    </section>
  )
}
