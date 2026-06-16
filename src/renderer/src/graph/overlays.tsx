import type { RefObject } from 'react'
import type { Pivot } from '../types'
import { useT } from '../i18n'
import {
  IconArrowLeft,
  IconLink,
  IconPencil,
  IconPlus,
  IconScissors,
  IconSearch,
  IconTrash,
  IconX
} from '../Icons'
import type { GNode, GraphPalette, LinkSource, MenuMode, Target } from './types'

// 집중 보기 헤더(현재 피벗 + 전체로 돌아가기)
export function PivotBanner({
  activePivot,
  palette,
  onSelectPivot
}: {
  activePivot: Pivot
  palette: GraphPalette
  onSelectPivot: (id: string | null) => void
}) {
  const t = useT()
  return (
    <div className="pivot-banner">
      <button className="back-btn" onClick={() => onSelectPivot(null)}>
        <IconArrowLeft size={13} />
        <span>{t('graph.all')}</span>
      </button>
      <span className="pivot-name">
        <span className="dot" style={{ background: palette.pivot }} />
        {activePivot.name}
      </span>
      <span className="pivot-hint">{t('graph.pivotHint')}</span>
    </div>
  )
}

// 연결 모드 배너 + 대상 검색
export function LinkingBanner({
  linking,
  linkQuery,
  setLinkQuery,
  setLinking,
  linkInputRef,
  linkCandidates,
  finishLink,
  palette
}: {
  linking: LinkSource
  linkQuery: string
  setLinkQuery: (v: string) => void
  setLinking: (l: LinkSource | null) => void
  linkInputRef: RefObject<HTMLInputElement>
  linkCandidates: Target[]
  finishLink: (kind: 'pivot' | 'item', id: string) => void
  palette: GraphPalette
}) {
  const t = useT()
  return (
    <div className="linking-banner" onMouseDown={(e) => e.stopPropagation()}>
      <div className="linking-top">
        <span className="linking-label">
          <IconLink size={14} />
          <span>
            <b>{linking.label}</b>
            {t('graph.linkPromptSuffix')}
          </span>
        </span>
        <button
          className="linking-cancel"
          onClick={() => {
            setLinking(null)
            setLinkQuery('')
          }}
        >
          <IconX size={12} />
          <span>{t('common.cancel')}</span>
        </button>
      </div>
      <input
        ref={linkInputRef}
        value={linkQuery}
        placeholder={t('graph.linkSearchPlaceholder')}
        onChange={(e) => setLinkQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setLinking(null)
            setLinkQuery('')
          }
          if (e.key === 'Enter' && linkCandidates.length > 0) {
            finishLink(linkCandidates[0].kind, linkCandidates[0].id)
          }
        }}
      />
      <div className="linking-results">
        {linkCandidates.length === 0 ? (
          <div className="node-menu-empty">{t('graph.noLinkTargets')}</div>
        ) : (
          linkCandidates.map((c) => (
            <button key={`${c.kind}:${c.id}`} onClick={() => finishLink(c.kind, c.id)}>
              <span
                className="dot"
                style={{ background: c.kind === 'pivot' ? palette.pivot : palette.file }}
              />
              <span className="t-name">{c.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// 새 피벗 이름 입력(노드 바로 아래)
export function PivotNaming({
  naming,
  nameText,
  setNameText,
  finishNaming
}: {
  naming: { x: number; y: number }
  nameText: string
  setNameText: (v: string) => void
  finishNaming: (save: boolean) => void
}) {
  const t = useT()
  return (
    <div
      className="pivot-naming"
      style={{ left: naming.x, top: naming.y + 26 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        value={nameText}
        placeholder={t('graph.pivotNamePlaceholder')}
        onChange={(e) => setNameText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finishNaming(true)
          if (e.key === 'Escape') finishNaming(false)
        }}
        onBlur={() => finishNaming(true)}
      />
    </div>
  )
}

// 우클릭 방사형 검색 + 피벗 생성
export function RadialSearch({
  search,
  results,
  query,
  setQuery,
  setSearch,
  inputRef,
  pickResult,
  doCreatePivot,
  palette,
  canvasRef
}: {
  search: { x: number; y: number }
  results: Target[]
  query: string
  setQuery: (v: string) => void
  setSearch: (s: { x: number; y: number } | null) => void
  inputRef: RefObject<HTMLInputElement>
  pickResult: (item: Target) => void
  doCreatePivot: () => void
  palette: GraphPalette
  canvasRef: RefObject<HTMLCanvasElement>
}) {
  const t = useT()
  const cw = canvasRef.current?.clientWidth ?? 800
  const ch = canvasRef.current?.clientHeight ?? 600
  const n = results.length
  const SLOTS = 12
  const RING_BASE = 200
  const RING_GAP = 140
  const ringsUsed = Math.floor(Math.max(0, n - 1) / SLOTS)
  const maxRadius = RING_BASE + ringsUsed * RING_GAP
  const reach = maxRadius + 60
  const cx = Math.max(reach, Math.min(search.x, cw - reach))
  const cy = Math.max(reach, Math.min(search.y, ch - reach))

  return (
    <>
      <div className="graph-search-backdrop" onMouseDown={() => setSearch(null)} />
      <div className="graph-radial" style={{ left: cx, top: cy }}>
        {results.map((item, i) => {
          const ring = Math.floor(i / SLOTS)
          const slot = i % SLOTS
          const r = RING_BASE + ring * RING_GAP
          const angle = (-90 + 30 * slot) * (Math.PI / 180)
          const bx = Math.cos(angle) * r
          const by = Math.sin(angle) * r
          return (
            <button
              key={`${item.kind}:${item.id}`}
              className="radial-bubble"
              style={{ left: bx, top: by, animationDelay: `${i * 60}ms` }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => pickResult(item)}
              title={item.name}
            >
              <span
                className="dot"
                style={{ background: item.kind === 'pivot' ? palette.pivot : palette.file }}
              />
              <span className="b-name">{item.name}</span>
            </button>
          )
        })}

        <div className="radial-center" onMouseDown={(e) => e.stopPropagation()}>
          <div className="radial-input">
            <IconSearch size={14} />
            <input
              ref={inputRef}
              value={query}
              placeholder={t('graph.searchPlaceholder')}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearch(null)
                if (e.key === 'Enter' && results.length > 0) pickResult(results[0])
              }}
            />
          </div>
          {n === 0 && query.trim() && <div className="radial-status">{t('graph.noResults')}</div>}
          <button
            className="radial-action"
            onMouseDown={(e) => e.preventDefault()}
            onClick={doCreatePivot}
          >
            <span className="radial-action-icon">
              <IconPlus size={13} />
            </span>
            <span className="radial-action-text">{t('graph.createPivot')}</span>
          </button>
        </div>
      </div>
    </>
  )
}

// 노드 우클릭 컨텍스트 메뉴(이름변경/연결/연결취소/삭제)
export function NodeMenu({
  menu,
  menuMode,
  setMenuMode,
  renameText,
  setRenameText,
  closeMenu,
  setLinking,
  setLinkQuery,
  disconnectTargets,
  applyDisconnect,
  palette,
  canvasRef,
  onRenamePivot,
  onRenameItem,
  onDeletePivot,
  onDeletePivotCascade,
  onDeleteItem
}: {
  menu: { x: number; y: number; node: GNode }
  menuMode: MenuMode
  setMenuMode: (m: MenuMode) => void
  renameText: string
  setRenameText: (v: string) => void
  closeMenu: () => void
  setLinking: (l: LinkSource | null) => void
  setLinkQuery: (v: string) => void
  disconnectTargets: Target[]
  applyDisconnect: (t: Target) => void
  palette: GraphPalette
  canvasRef: RefObject<HTMLCanvasElement>
  onRenamePivot: (id: string, name: string) => void
  onRenameItem: (id: string, name: string) => void
  onDeletePivot: (id: string) => void
  onDeletePivotCascade: (id: string) => void
  onDeleteItem: (id: string) => void
}) {
  const t = useT()
  return (
    <>
      <div className="graph-search-backdrop" onMouseDown={closeMenu} />
      <div
        className="node-menu"
        style={{
          left: Math.min(menu.x, (canvasRef.current?.clientWidth ?? 9999) - 200),
          top: Math.min(menu.y, (canvasRef.current?.clientHeight ?? 9999) - 260)
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="node-menu-title">
          <span
            className="dot"
            style={{ background: menu.node.kind === 'pivot' ? palette.pivot : palette.file }}
          />
          <span className="t-name">{menu.node.label}</span>
        </div>

        {menuMode === 'main' && (
          <>
            <button onClick={() => setMenuMode('rename')}>
              <IconPencil size={14} />
              <span>{t('graph.rename')}</span>
            </button>
            <button
              onClick={() => {
                setLinking({ refId: menu.node.refId, kind: menu.node.kind, label: menu.node.label })
                setLinkQuery('')
                closeMenu()
              }}
            >
              <IconLink size={14} />
              <span>{t('graph.connect')}</span>
            </button>
            <button onClick={() => setMenuMode('disconnect')}>
              <IconScissors size={14} />
              <span>{t('graph.disconnect')}</span>
            </button>
            <button
              className="danger"
              onClick={() => {
                // 피벗은 '피벗만 / 하위 전체' 선택 단계로, 파일은 바로 삭제(휴지통)
                if (menu.node.kind === 'pivot') setMenuMode('delete')
                else {
                  onDeleteItem(menu.node.refId)
                  closeMenu()
                }
              }}
            >
              <IconTrash size={14} />
              <span>{t('graph.delete')}</span>
            </button>
          </>
        )}

        {menuMode === 'delete' && (
          <div className="node-menu-list">
            <button
              onClick={() => {
                onDeletePivot(menu.node.refId)
                closeMenu()
              }}
            >
              {t('graph.deletePivotOnly')}
            </button>
            <button
              className="danger"
              onClick={() => {
                onDeletePivotCascade(menu.node.refId)
                closeMenu()
              }}
            >
              {t('graph.deleteSubtree')}
            </button>
          </div>
        )}

        {menuMode === 'rename' && (
          <div className="node-menu-rename">
            <input
              autoFocus
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (menu.node.kind === 'pivot') onRenamePivot(menu.node.refId, renameText)
                  else onRenameItem(menu.node.refId, renameText)
                  closeMenu()
                }
                if (e.key === 'Escape') setMenuMode('main')
              }}
            />
            <button
              onClick={() => {
                if (menu.node.kind === 'pivot') onRenamePivot(menu.node.refId, renameText)
                else onRenameItem(menu.node.refId, renameText)
                closeMenu()
              }}
            >
              {t('common.confirm')}
            </button>
          </div>
        )}

        {menuMode === 'disconnect' && (
          <div className="node-menu-list">
            {disconnectTargets.length === 0 ? (
              <div className="node-menu-empty">{t('graph.noConnected')}</div>
            ) : (
              disconnectTargets.map((dt) => (
                <button key={`${dt.kind}:${dt.id}`} onClick={() => applyDisconnect(dt)}>
                  <span
                    className="dot"
                    style={{ background: dt.kind === 'pivot' ? palette.pivot : palette.file }}
                  />
                  <span className="t-name">{dt.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </>
  )
}
