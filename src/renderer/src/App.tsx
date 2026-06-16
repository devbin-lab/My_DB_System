import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { ItemLink, ItemType, LibraryItem, Link, Pivot, Settings } from './types'
import GraphView from './GraphView'
import SettingsModal from './Settings'
import TrashModal from './Trash'
import Onboarding from './Onboarding'
import { I18nContext, LOCALES, makeT } from './i18n'

// 뷰어는 react-markdown / highlight.js / papaparse 등 무거운 의존성을 쓰므로
// 필요할 때만 불러오도록 코드 분할(lazy)한다. 초기 번들이 가벼워진다.
const Viewer = lazy(() => import('./Viewer'))
import {
  IconDownload,
  IconEye,
  IconFolder,
  IconGraph,
  IconList,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTrash,
  IconX
} from './Icons'

const DEFAULT_SETTINGS: Settings = {
  maxSearchResults: 12,
  theme: 'slate',
  accent: 'teal',
  language: 'en'
}

// 테마별 그래프 캔버스 팔레트
export interface GraphPalette {
  file: string
  pivot: string
  edge: string
  label: string
  labelHover: string
  accent: string // 포인트색(부모→자식 방향 호 등 강조에 사용)
}

// 포인트색별 선명한 강조용 hex (CSS의 --accent-hover와 동일)
const ACCENT_HEX: Record<Settings['accent'], string> = {
  teal: '#2dd4bf',
  blue: '#60a5fa',
  violet: '#8d7cf7',
  amber: '#fbbf24',
  green: '#4ade80'
}

const GRAPH_PALETTES: Record<Settings['theme'], Omit<GraphPalette, 'accent'>> = {
  slate: {
    file: '#9aa1b5',
    pivot: '#cdd3e0',
    edge: 'rgba(154, 161, 181, 0.55)',
    label: 'rgba(232, 234, 242, 0.8)',
    labelHover: '#ffffff'
  },
  light: {
    file: '#7a8194',
    pivot: '#4a5165',
    edge: 'rgba(106, 114, 138, 0.5)',
    label: 'rgba(43, 49, 66, 0.85)',
    labelHover: '#10141f'
  },
  navy: {
    file: '#8da0bd',
    pivot: '#cfdcef',
    edge: 'rgba(141, 160, 189, 0.5)',
    label: 'rgba(227, 234, 245, 0.8)',
    labelHover: '#ffffff'
  }
}

export const TYPE_COLORS: Record<ItemType, string> = {
  md: '#7c6af2',
  pdf: '#f2786a',
  csv: '#5fd068',
  code: '#5ab8f5',
  image: '#f5c95a',
  ppt: '#e8703a',
  xls: '#2aa775',
  other: '#8a8fa8'
}

function extLabel(item: LibraryItem): string {
  const e = item.ext.replace('.', '').toUpperCase()
  return e.length > 4 ? e.slice(0, 4) : e || 'FILE'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function App() {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dataDir, setDataDir] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [view, setView] = useState<'graph' | 'library'>('graph')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  // null = 아직 확인 중, false = 첫 실행(마법사 표시), true = 온보딩 완료
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [pivots, setPivots] = useState<Pivot[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [itemLinks, setItemLinks] = useState<ItemLink[]>([])
  const [pivotLinks, setPivotLinks] = useState<ItemLink[]>([])
  const [activePivotId, setActivePivotId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null) // 그래프 읽기 전용 미리보기
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all') // 라이브러리 타입 필터
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'size'>('recent') // 라이브러리 정렬

  const t = useMemo(() => makeT(settings.language), [settings.language])

  // Esc로 미리보기/설정 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (trashOpen) setTrashOpen(false)
      else if (settingsOpen) setSettingsOpen(false)
      else if (previewId) setPreviewId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewId, settingsOpen, trashOpen])

  const refresh = useCallback(async () => {
    const [its, pvs, lks, ils, pls] = await Promise.all([
      window.api.list(),
      window.api.listPivots(),
      window.api.listLinks(),
      window.api.listItemLinks(),
      window.api.listPivotLinks()
    ])
    setItems(its)
    setPivots(pvs)
    setLinks(lks)
    setItemLinks(ils)
    setPivotLinks(pls)
  }, [])

  useEffect(() => {
    refresh()
    window.api.getDataDir().then(setDataDir)
    window.api.getSettings().then(setSettings)
    window.api.isOnboarded().then(setOnboarded)
  }, [refresh])

  const finishOnboarding = async () => {
    await window.api.completeOnboarding()
    setOnboarded(true)
  }

  const updateSetting = async (key: keyof Settings, value: unknown) => {
    setSettings(await window.api.setSetting(key, value))
  }

  // 테마/액센트를 CSS 변수로 적용
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.dataset.accent = settings.accent
  }, [settings.theme, settings.accent])

  const palette = useMemo(
    () => ({ ...GRAPH_PALETTES[settings.theme], accent: ACCENT_HEX[settings.accent] }),
    [settings.theme, settings.accent]
  )

  const changeStorage = async () => {
    const chosen = await window.api.chooseStorageDir()
    if (!chosen || chosen === dataDir) return
    try {
      const newDir = await window.api.setStorageDir(chosen)
      setDataDir(newDir)
      await refresh()
    } catch {
      alert(t('app.storage.moveFailed'))
    }
  }

  // 라이브러리에 존재하는 타입(필터 칩 노출용)과 모든 태그(자동완성용)
  const presentTypes = useMemo(() => {
    const order: ItemType[] = ['md', 'pdf', 'ppt', 'csv', 'xls', 'code', 'image', 'other']
    const set = new Set(items.map((i) => i.type))
    return order.filter((tp) => set.has(tp))
  }, [items])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) for (const tag of i.tags) set.add(tag)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [items])

  const filtered = useMemo(() => {
    let result = items
    if (typeFilter !== 'all') result = result.filter((i) => i.type === typeFilter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    const sorted = [...result]
    if (sortBy === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sortBy === 'size') sorted.sort((a, b) => b.size - a.size)
    else sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return sorted
  }, [items, search, typeFilter, sortBy])

  const selected = items.find((i) => i.id === selectedId) ?? null

  // 그래프에서 피벗 집중 보기 중이면, 추가하는 파일을 그 피벗에 연결한다
  const importPivotId = view === 'graph' ? activePivotId : null

  const handleImport = async () => {
    const added = await window.api.importDialog(importPivotId)
    if (added.length > 0) {
      await refresh()
      setSelectedId(added[0].id)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files).map((f) => window.api.getPathForFile(f))
    if (paths.length === 0) return
    const added = await window.api.importPaths(paths, importPivotId)
    // 폴더 드롭은 파일 외에 피벗/연결도 만들 수 있으므로 항상 새로고침한다.
    await refresh()
    if (added.length > 0) setSelectedId(added[0].id)
  }

  const handleRemove = async (id: string) => {
    await window.api.remove(id)
    if (selectedId === id) setSelectedId(null)
    if (previewId === id) setPreviewId(null)
    await refresh()
  }

  // ----- 피벗 / 연결 콜백 -----
  // 생성 즉시 그래프에 나타나고, 이름은 그 자리에서 바로 입력받는다(GraphView)
  const createPivot = async (): Promise<Pivot> => {
    const pivot = await window.api.createPivot(t('app.pivot.new'))
    await refresh()
    return pivot
  }
  const renamePivot = async (id: string, name: string) => {
    await window.api.renamePivot(id, name)
    await refresh()
  }
  const removePivot = async (id: string) => {
    await window.api.removePivot(id)
    if (activePivotId === id) setActivePivotId(null)
    await refresh()
  }
  const renameItem = async (id: string, name: string) => {
    await window.api.rename(id, name)
    await refresh()
  }
  const connect = async (pivotId: string, itemId: string) => {
    await window.api.addLink(pivotId, itemId)
    await refresh()
  }
  const disconnect = async (pivotId: string, itemId: string) => {
    await window.api.removeLink(pivotId, itemId)
    await refresh()
  }
  const connectItems = async (a: string, b: string) => {
    await window.api.addItemLink(a, b)
    await refresh()
  }
  const disconnectItems = async (a: string, b: string) => {
    await window.api.removeItemLink(a, b)
    await refresh()
  }
  const connectPivots = async (a: string, b: string) => {
    await window.api.addPivotLink(a, b)
    await refresh()
  }
  const disconnectPivots = async (a: string, b: string) => {
    await window.api.removePivotLink(a, b)
    await refresh()
  }

  return (
   <I18nContext.Provider value={t}>
    <div
      className={`app ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* 상단 툴바 */}
      <header className="topbar">
        <button className="brand" onClick={() => setView('graph')}>
          <span className="brand-mark" />
          <span className="brand-name">My DB System</span>
        </button>

        <div className="topbar-right">
          <div className="seg">
            <button
              className={view === 'graph' ? 'on' : ''}
              onClick={() => setView('graph')}
            >
              <IconGraph size={15} />
              <span>{t('topbar.graph')}</span>
            </button>
            <button
              className={view === 'library' ? 'on' : ''}
              onClick={() => setView('library')}
            >
              <IconList size={15} />
              <span>{t('topbar.list')}</span>
            </button>
          </div>

          <button
            className="tb-icon"
            title={t('topbar.openFolder')}
            onClick={() => window.api.openDataDir()}
          >
            <IconFolder size={17} />
          </button>
          <button
            className="tb-icon"
            title={t('topbar.trash')}
            onClick={() => setTrashOpen(true)}
          >
            <IconTrash size={17} />
          </button>
          <button
            className="tb-icon"
            title={t('topbar.settings')}
            onClick={() => setSettingsOpen(true)}
          >
            <IconSettings size={17} />
          </button>

          <button className="btn-accent" onClick={handleImport}>
            <IconPlus size={15} />
            <span>{t('topbar.addFile')}</span>
          </button>
        </div>
      </header>

      {/* 본문 */}
      <main className="content">
        {view === 'graph' ? (
          <section className="graph-pane">
            <GraphView
              items={items}
              pivots={pivots}
              links={links}
              itemLinks={itemLinks}
              pivotLinks={pivotLinks}
              activePivotId={activePivotId}
              maxResults={settings.maxSearchResults}
              palette={palette}
              onOpenItem={(id) => setPreviewId(id)}
              onSelectPivot={setActivePivotId}
              onCreatePivot={createPivot}
              onRenamePivot={renamePivot}
              onRenameItem={renameItem}
              onDeletePivot={removePivot}
              onDeleteItem={handleRemove}
              onConnect={connect}
              onDisconnect={disconnect}
              onConnectItems={connectItems}
              onDisconnectItems={disconnectItems}
              onConnectPivots={connectPivots}
              onDisconnectPivots={disconnectPivots}
            />
            {previewId &&
              (() => {
                const item = items.find((i) => i.id === previewId)
                if (!item) return null
                return (
                  <div className="preview-panel">
                    <div className="preview-bar">
                      <span className="preview-title">
                        <IconEye size={14} />
                        {t('app.preview.readOnly')}
                      </span>
                      <div className="preview-bar-actions">
                        <button
                          onClick={() => {
                            setSelectedId(item.id)
                            setView('library')
                            setPreviewId(null)
                          }}
                        >
                          <IconList size={13} />
                          <span>{t('app.preview.openInList')}</span>
                        </button>
                        <button className="icon-only" onClick={() => setPreviewId(null)}>
                          <IconX size={14} />
                        </button>
                      </div>
                    </div>
                    <Suspense fallback={<div className="empty">{t('common.loading')}</div>}>
                      <Viewer key={item.id} item={item} readOnly allTags={allTags} />
                    </Suspense>
                  </div>
                )
              })()}
          </section>
        ) : (
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
                        {new Date(item.createdAt).toLocaleDateString(LOCALES[settings.language])}
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
                        handleRemove(item.id)
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
                  <Viewer
                    key={selected.id}
                    item={selected}
                    onTagsChange={refresh}
                    allTags={allTags}
                  />
                </Suspense>
              ) : (
                <div className="empty">{t('app.lib.selectToView')}</div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* 설정 모달 */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          storageDir={dataDir}
          onChange={updateSetting}
          onChangeStorage={changeStorage}
          onOpenStorage={() => window.api.openDataDir()}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* 휴지통 모달 */}
      {trashOpen && <TrashModal onClose={() => setTrashOpen(false)} onChanged={refresh} />}

      {/* 첫 실행 온보딩 마법사 */}
      {onboarded === false && (
        <Onboarding
          settings={settings}
          storageDir={dataDir}
          onChange={updateSetting}
          onChangeStorage={changeStorage}
          onFinish={finishOnboarding}
        />
      )}

      {/* 드래그 오버레이 */}
      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-box">
            <IconDownload size={32} />
            <span>{t('app.drop.here')}</span>
            {importPivotId && <small>{t('app.drop.linkHint')}</small>}
          </div>
        </div>
      )}
    </div>
   </I18nContext.Provider>
  )
}
