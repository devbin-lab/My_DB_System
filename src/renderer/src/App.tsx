import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ItemLink, ItemType, LibraryItem, Link, Pivot, Settings } from './types'
import GraphView from './GraphView'
import RepoGraph from './RepoGraph'
import CombinedGraph from './CombinedGraph'
import SettingsModal from './Settings'
import TrashModal from './Trash'
import Onboarding from './Onboarding'
import Topbar from './components/Topbar'
import LibraryView from './components/LibraryView'
import PreviewPanel from './components/PreviewPanel'
import { NoticeDialog } from './graph/overlays'
import { I18nContext, makeT } from './i18n'
import { IconDownload } from './Icons'

const DEFAULT_SETTINGS: Settings = {
  maxSearchResults: 12,
  theme: 'slate',
  accent: 'teal',
  language: 'en',
  combineGraphs: false
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
  violet: '#a78bfa',
  amber: '#fbbf24',
  green: '#4ade80',
  rose: '#fb7185',
  orange: '#fb923c',
  lime: '#a3e635',
  cyan: '#22d3ee',
  fuchsia: '#e879f9',
  gray: '#9aa1b5',
  black: '#f0f0f3'
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

export default function App() {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dataDir, setDataDir] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [view, setView] = useState<'graph' | 'library' | 'git'>('graph')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null) // 앱 내 알림 모달 메시지
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
      else if (notice) setNotice(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewId, settingsOpen, trashOpen, notice])

  // 안정적인 핸들러(매 렌더 새 함수 X) → 그래프 시뮬레이션이 불필요하게 재빌드되지 않음
  const handleOpenItem = useCallback((id: string) => setPreviewId(id), [])

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

  // 테마/액센트를 CSS 변수로 적용. 선택 언어는 html lang에 반영한다
  // (접근성·폰트 + 한국어 줄바꿈 규칙 :lang(ko)에 사용. index.html의 하드코딩 ko를 덮어쓴다).
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.dataset.accent = settings.accent
    document.documentElement.lang = settings.language
  }, [settings.theme, settings.accent, settings.language])

  // 통합 모드를 켜면 Git 탭이 사라지므로, 그 상태로 남지 않게 그래프로 되돌린다.
  useEffect(() => {
    if (settings.combineGraphs && view === 'git') setView('graph')
  }, [settings.combineGraphs, view])

  const palette = useMemo(() => {
    const isLight = settings.theme === 'light'
    // 블랙/그레이는 테마에 따라 반전·조정(다크 그래프에선 밝게, 라이트에선 어둡게)
    const accentHex =
      settings.accent === 'black'
        ? isLight
          ? '#1d2230'
          : '#f0f0f3'
        : settings.accent === 'gray'
          ? isLight
            ? '#64748b'
            : '#9aa1b5'
          : ACCENT_HEX[settings.accent]
    return { ...GRAPH_PALETTES[settings.theme], accent: accentHex }
  }, [settings.theme, settings.accent])

  const changeStorage = async () => {
    const chosen = await window.api.chooseStorageDir()
    if (!chosen || chosen === dataDir) return
    try {
      const newDir = await window.api.setStorageDir(chosen)
      setDataDir(newDir)
      // 저장소를 전환하면 선택/포커스 상태를 초기화한다(데이터 컨텍스트가 바뀌므로)
      setActivePivotId(null)
      setSelectedId(null)
      setPreviewId(null)
      await refresh()
    } catch {
      setNotice(t('app.storage.moveFailed'))
    }
  }

  const exportBackup = async () => {
    const dest = await window.api.exportBackup()
    if (dest) setNotice(t('app.backup.exported', { path: dest }))
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

  // 타이핑 등 잦은 렌더에서 매번 전체 items를 스캔하지 않도록 메모이즈
  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId]
  )
  const previewItem = useMemo(
    () => (previewId ? (items.find((i) => i.id === previewId) ?? null) : null),
    [items, previewId]
  )

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
  // 부모 피벗 아래에 새 피벗을 만든다(parentId가 있으면 부모 → 새 피벗 연결).
  // 어떤 피벗을 부모로 삼을지는 호출하는 뷰가 결정한다 — GraphView는 activePivotId,
  // CombinedGraph는 자체 focus를 넘긴다(전역 activePivotId에 의존하지 않도록).
  const createPivotUnder = async (parentId: string | null): Promise<Pivot> => {
    const pivot = await window.api.createPivot(t('app.pivot.new'))
    if (parentId) await window.api.addPivotLink(parentId, pivot.id)
    await refresh()
    return pivot
  }
  // GraphView용: 집중 보기 중이면 그 피벗의 자식으로 매단다.
  const createPivot = (): Promise<Pivot> => createPivotUnder(activePivotId)
  const renamePivot = async (id: string, name: string) => {
    await window.api.renamePivot(id, name)
    await refresh()
  }
  const removePivot = async (id: string) => {
    await window.api.removePivot(id)
    if (activePivotId === id) setActivePivotId(null)
    await refresh()
  }
  const removePivotCascade = async (id: string) => {
    await window.api.removePivotCascade(id)
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
      <Topbar
        view={view}
        setView={setView}
        combineGraphs={settings.combineGraphs}
        onOpenFolder={() => window.api.openDataDir()}
        onTrash={() => setTrashOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onImport={handleImport}
      />

      {/* 본문 */}
      <main className="content">
        {view === 'graph' ? (
          <section className="graph-pane">
            {settings.combineGraphs ? (
              <CombinedGraph
                items={items}
                pivots={pivots}
                links={links}
                itemLinks={itemLinks}
                pivotLinks={pivotLinks}
                palette={palette}
                maxResults={settings.maxSearchResults}
                onOpenItem={handleOpenItem}
                onCreatePivot={createPivotUnder}
                onRenamePivot={renamePivot}
                onRenameItem={renameItem}
                onDeletePivot={removePivot}
                onDeletePivotCascade={removePivotCascade}
                onDeleteItem={handleRemove}
                onConnect={connect}
                onDisconnect={disconnect}
                onConnectItems={connectItems}
                onDisconnectItems={disconnectItems}
                onConnectPivots={connectPivots}
                onDisconnectPivots={disconnectPivots}
              />
            ) : (
              <GraphView
                items={items}
                pivots={pivots}
                links={links}
                itemLinks={itemLinks}
                pivotLinks={pivotLinks}
                activePivotId={activePivotId}
                maxResults={settings.maxSearchResults}
                palette={palette}
                onOpenItem={handleOpenItem}
                onSelectPivot={setActivePivotId}
                onCreatePivot={createPivot}
                onRenamePivot={renamePivot}
                onRenameItem={renameItem}
                onDeletePivot={removePivot}
                onDeletePivotCascade={removePivotCascade}
                onDeleteItem={handleRemove}
                onConnect={connect}
                onDisconnect={disconnect}
                onConnectItems={connectItems}
                onDisconnectItems={disconnectItems}
                onConnectPivots={connectPivots}
                onDisconnectPivots={disconnectPivots}
              />
            )}
            {previewItem && (
              <PreviewPanel
                item={previewItem}
                allTags={allTags}
                onOpenInList={() => {
                  setSelectedId(previewItem.id)
                  setView('library')
                  setPreviewId(null)
                }}
                onClose={() => setPreviewId(null)}
              />
            )}
          </section>
        ) : view === 'git' ? (
          <section className="git-view">
            <RepoGraph palette={palette} />
          </section>
        ) : (
          <LibraryView
            items={items}
            filtered={filtered}
            presentTypes={presentTypes}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            search={search}
            setSearch={setSearch}
            selected={selected}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            allTags={allTags}
            language={settings.language}
            onRemove={handleRemove}
            onTagsChange={refresh}
          />
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
          onExportBackup={exportBackup}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* 휴지통 모달 */}
      {trashOpen && <TrashModal onClose={() => setTrashOpen(false)} onChanged={refresh} />}

      {/* 알림 모달 */}
      {notice && <NoticeDialog message={notice} onClose={() => setNotice(null)} />}

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
