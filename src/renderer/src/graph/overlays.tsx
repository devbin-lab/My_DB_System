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

// 노드 종류별 점(dot) 색 — 여러 오버레이에서 공통 사용
const dotColor = (kind: 'pivot' | 'item', p: GraphPalette): string =>
  kind === 'pivot' ? p.pivot : p.file

// 앱 스타일의 알림 모달(OS 기본 alert 대체, 확인 버튼 하나)
export function NoticeDialog({
  message,
  onClose
}: {
  message: string
  onClose: () => void
}) {
  const t = useT()
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="confirm-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <p className="confirm-msg">{message}</p>
        <div className="confirm-actions">
          <button className="btn-accent" onClick={onClose}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// 앱 스타일의 확인 모달(OS 기본 confirm 대체)
export function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onCancel
}: {
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="confirm-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <p className="confirm-msg">{message}</p>
        <div className="confirm-actions">
          <button className="btn-ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button className="btn-accent danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

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
                style={{ background: dotColor(c.kind, palette) }}
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
                style={{ background: dotColor(item.kind, palette) }}
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
  pivotHasContent,
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
  onRequestDeleteSubtree,
  onDeleteItem
}: {
  menu: { x: number; y: number; node: GNode }
  pivotHasContent: boolean
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
  onRequestDeleteSubtree: (id: string) => void
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
            style={{ background: dotColor(menu.node.kind, palette) }}
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
            {menu.node.kind === 'item' && (
              <button
                className="danger"
                onClick={() => {
                  onDeleteItem(menu.node.refId)
                  closeMenu()
                }}
              >
                <IconTrash size={14} />
                <span>{t('graph.delete')}</span>
              </button>
            )}
            {menu.node.kind === 'pivot' && !pivotHasContent && (
              <button
                className="danger"
                onClick={() => {
                  onDeletePivot(menu.node.refId)
                  closeMenu()
                }}
              >
                <IconTrash size={14} />
                <span>{t('graph.delete')}</span>
              </button>
            )}
            {menu.node.kind === 'pivot' && pivotHasContent && (
              <>
                <button
                  className="danger"
                  onClick={() => {
                    onDeletePivot(menu.node.refId)
                    closeMenu()
                  }}
                >
                  <IconTrash size={14} />
                  <span>{t('graph.deletePivotOnly')}</span>
                </button>
                <button
                  className="danger"
                  onClick={() => onRequestDeleteSubtree(menu.node.refId)}
                >
                  <IconTrash size={14} />
                  <span>{t('graph.deleteSubtree')}</span>
                </button>
              </>
            )}
          </>
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
                    style={{ background: dotColor(dt.kind, palette) }}
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
