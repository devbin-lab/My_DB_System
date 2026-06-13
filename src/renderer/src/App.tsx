import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ItemLink, ItemType, LibraryItem, Link, Pivot, Settings } from './types'
import Viewer from './Viewer'
import GraphView from './GraphView'
import SettingsModal from './Settings'
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

const DEFAULT_SETTINGS: Settings = { maxSearchResults: 12, theme: 'slate', accent: 'teal' }

// 테마별 그래프 캔버스 팔레트
export interface GraphPalette {
  file: string
  pivot: string
  edge: string
  label: string
  labelHover: string
}

const GRAPH_PALETTES: Record<Settings['theme'], GraphPalette> = {
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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [pivots, setPivots] = useState<Pivot[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [itemLinks, setItemLinks] = useState<ItemLink[]>([])
  const [pivotLinks, setPivotLinks] = useState<ItemLink[]>([])
  const [activePivotId, setActivePivotId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null) // 그래프 읽기 전용 미리보기

  // Esc로 미리보기/설정 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (settingsOpen) setSettingsOpen(false)
      else if (previewId) setPreviewId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewId, settingsOpen])

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
  }, [refresh])

  const updateSetting = async (key: keyof Settings, value: unknown) => {
    setSettings(await window.api.setSetting(key, value))
  }

  // 테마/액센트를 CSS 변수로 적용
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.dataset.accent = settings.accent
  }, [settings.theme, settings.accent])

  const palette = useMemo(() => GRAPH_PALETTES[settings.theme], [settings.theme])

  const changeStorage = async () => {
    const chosen = await window.api.chooseStorageDir()
    if (!chosen || chosen === dataDir) return
    try {
      const newDir = await window.api.setStorageDir(chosen)
      setDataDir(newDir)
      await refresh()
    } catch {
      alert('저장소 이동에 실패했습니다. 폴더 권한이나 사용 중인 파일을 확인해주세요.')
    }
  }

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [items, search])

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
    if (added.length > 0) {
      await refresh()
      setSelectedId(added[0].id)
    }
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
    const pivot = await window.api.createPivot('새 피벗')
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
              <span>그래프</span>
            </button>
            <button
              className={view === 'library' ? 'on' : ''}
              onClick={() => setView('library')}
            >
              <IconList size={15} />
              <span>목록</span>
            </button>
          </div>

          <button
            className="tb-icon"
            title="저장 폴더 열기"
            onClick={() => window.api.openDataDir()}
          >
            <IconFolder size={17} />
          </button>
          <button className="tb-icon" title="설정" onClick={() => setSettingsOpen(true)}>
            <IconSettings size={17} />
          </button>

          <button className="btn-accent" onClick={handleImport}>
            <IconPlus size={15} />
            <span>파일 추가</span>
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
                        읽기 전용
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
                          <span>목록에서 열기</span>
                        </button>
                        <button className="icon-only" onClick={() => setPreviewId(null)}>
                          <IconX size={14} />
                        </button>
                      </div>
                    </div>
                    <Viewer key={item.id} item={item} readOnly />
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
                  placeholder="이름 또는 태그 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button className="clear" onClick={() => setSearch('')}>
                    <IconX size={13} />
                  </button>
                )}
              </div>

              <div className="lib-items">
                {filtered.length === 0 && (
                  <div className="empty">
                    {items.length === 0 ? (
                      <>
                        <IconDownload size={28} />
                        <p>
                          파일을 창에 끌어다 놓거나
                          <br />
                          상단의 [파일 추가]를 누르세요
                        </p>
                      </>
                    ) : (
                      <p>검색 결과가 없습니다</p>
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
                        {new Date(item.createdAt).toLocaleDateString('ko-KR')}
                        {item.tags.length > 0 && (
                          <span className="lib-card-tags">
                            {' '}
                            · {item.tags.map((t) => `#${t}`).join(' ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="lib-card-del"
                      title="삭제"
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
                <Viewer key={selected.id} item={selected} onTagsChange={refresh} />
              ) : (
                <div className="empty">파일을 선택하면 여기에 표시됩니다</div>
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

      {/* 드래그 오버레이 */}
      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-box">
            <IconDownload size={32} />
            <span>여기에 파일을 놓으세요</span>
            {importPivotId && <small>현재 피벗에 자동으로 연결됩니다</small>}
          </div>
        </div>
      )}
    </div>
  )
}
