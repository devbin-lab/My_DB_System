import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { ItemLink, LibraryItem, Link, Pivot } from '../types'
import { useT } from '../i18n'
import { parseRef } from './github'
import { ConfirmDialog, LinkingBanner, NodeMenu, PivotNaming, RadialSearch } from './overlays'
import type { GNode, GraphPalette, LinkSource, MenuMode, Target } from './types'

// 그래프 우클릭 상호작용(검색·피벗 생성·이름변경·삭제·연결/해제)을 한곳에 모은 공용 훅.
// GraphView(로컬 전용)와 CombinedGraph(로컬+GitHub)가 함께 쓴다. 두 뷰가 따로 구현하다
// 통합 보기에서 우클릭이 통째로 비활성(noop)됐던 회귀를 막기 위해 로직을 단일화한다.
//
// GitHub 노드(owner:/repo:/dir:/file:)는 로컬 DB 대상이 아니므로 편집 메뉴/연결을 막는다.
// 로컬 노드는 접두사 없는 uuid → parseRef(refId).kind === 'pivot'.
export const isLocalRef = (refId: string): boolean => parseRef(refId).kind === 'pivot'

interface NodeClickArg {
  refId: string
  kind: 'pivot' | 'item'
  label: string
}

export interface GraphInteractionParams {
  canvasRef: RefObject<HTMLCanvasElement>
  palette: GraphPalette
  maxResults: number
  // 우클릭 검색이 훑을 "현재 화면에 보이는 로컬 노드"
  searchPivots: Pivot[]
  searchItems: LibraryItem[]
  // 연결/해제 후보 풀(전체 로컬 피벗/파일)
  pivots: Pivot[]
  items: LibraryItem[]
  links: Link[]
  itemLinks: ItemLink[]
  pivotLinks: ItemLink[]
  // 연결 모드가 아닐 때의 좌클릭 동작(컴포넌트별로 다름: 열기 / 피벗 진입 / 드릴다운).
  onNodeActivate: (n: NodeClickArg) => void
  onCreatePivot: () => Promise<Pivot>
  onRenamePivot: (id: string, name: string) => void
  onRenameItem: (id: string, name: string) => void
  onDeletePivot: (id: string) => void
  onDeletePivotCascade: (id: string) => void
  onDeleteItem: (id: string) => void
  onConnect: (pivotId: string, itemId: string) => void
  onDisconnect: (pivotId: string, itemId: string) => void
  onConnectItems: (a: string, b: string) => void
  onDisconnectItems: (a: string, b: string) => void
  onConnectPivots: (a: string, b: string) => void
  onDisconnectPivots: (a: string, b: string) => void
}

export interface GraphInteractions {
  // useGraphSimulation에 그대로 넘기는 ref/세터 묶음
  spawnRef: { current: { id: string; x: number; y: number } | null }
  nodesRef: { current: GNode[] }
  focusRef: { current: ((id: string) => void) | null }
  nodeClickRef: { current: (n: NodeClickArg) => void }
  linkingRef: { current: LinkSource | null }
  setSearch: (s: { x: number; y: number } | null) => void
  setQuery: (v: string) => void
  setMenu: (m: { x: number; y: number; node: GNode } | null) => void
  setMenuMode: (m: MenuMode) => void
  setRenameText: (v: string) => void
  closeMenu: () => void
  // 캔버스 위에 띄울 오버레이(검색/메뉴/연결 배너/이름입력/삭제확인)
  overlays: ReactNode
}

export function useGraphInteractions(params: GraphInteractionParams): GraphInteractions {
  const {
    canvasRef,
    palette,
    maxResults,
    searchPivots,
    searchItems,
    pivots,
    items,
    links,
    itemLinks,
    pivotLinks,
    onNodeActivate,
    onCreatePivot,
    onRenamePivot,
    onRenameItem,
    onDeletePivot,
    onDeletePivotCascade,
    onDeleteItem,
    onConnect,
    onDisconnect,
    onConnectItems,
    onDisconnectItems,
    onConnectPivots,
    onDisconnectPivots
  } = params

  const t = useT()
  const focusRef = useRef<((id: string) => void) | null>(null)
  const nodeClickRef = useRef<(n: NodeClickArg) => void>(() => {})

  // ---------- 우클릭 검색/피벗 생성 오버레이 ----------
  const [search, setSearch] = useState<{ x: number; y: number } | null>(null)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    if (!search) return []
    const q = query.trim().toLowerCase()
    if (!q) return []
    const pv = searchPivots
      .filter((p) => p.name.toLowerCase().includes(q))
      .map((p) => ({ kind: 'pivot' as const, id: p.id, name: p.name, type: undefined }))
    const it = searchItems
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) || i.tags.some((tag) => tag.toLowerCase().includes(q))
      )
      .map((i) => ({ kind: 'item' as const, id: i.id, name: i.name, type: i.type }))
    return [...pv, ...it].slice(0, maxResults)
  }, [search, query, searchPivots, searchItems, maxResults])

  useEffect(() => {
    if (search) inputRef.current?.focus()
  }, [search])

  const pickResult = (r: { kind: 'pivot' | 'item'; id: string }): void => {
    focusRef.current?.(`${r.kind}:${r.id}`)
    setSearch(null)
    setQuery('')
  }

  // ---------- 피벗 즉시 생성 + 그 자리에서 이름 입력 ----------
  const spawnRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const nodesRef = useRef<GNode[]>([])
  const [naming, setNaming] = useState<{ pivotId: string; x: number; y: number } | null>(null)
  const [nameText, setNameText] = useState('')

  const doCreatePivot = async (): Promise<void> => {
    if (!search) return
    const pos = { x: search.x, y: search.y }
    setSearch(null)
    setQuery('')
    const pivot = await onCreatePivot()
    spawnRef.current = { id: pivot.id, ...pos }
    setNameText('')
    setNaming({ pivotId: pivot.id, ...pos })
  }

  const finishNaming = (save: boolean): void => {
    if (!naming) return
    if (save && nameText.trim()) onRenamePivot(naming.pivotId, nameText.trim())
    const node = nodesRef.current.find((n) => n.id === `pivot:${naming.pivotId}`)
    if (node) node.fixed = false
    spawnRef.current = null
    setNaming(null)
  }

  // ---------- 노드 우클릭 컨텍스트 메뉴 ----------
  const [menu, setMenu] = useState<{ x: number; y: number; node: GNode } | null>(null)
  const [menuMode, setMenuMode] = useState<MenuMode>('main')
  const [renameText, setRenameText] = useState('')
  const [confirmCascadeId, setConfirmCascadeId] = useState<string | null>(null)

  const closeMenu = (): void => {
    setMenu(null)
    setMenuMode('main')
  }

  // GitHub 노드(읽기 전용)는 컨텍스트 메뉴를 띄우지 않는다. 시뮬레이션은 어떤 노드든
  // setMenu를 호출하므로, 여기서 로컬 노드만 통과시켜 GitHub 노드 우클릭을 무시한다.
  const guardedSetMenu = (m: { x: number; y: number; node: GNode } | null): void => {
    setMenu(m && !isLocalRef(m.node.refId) ? null : m)
  }

  const neighborsIn = (pairs: ItemLink[], id: string): Set<string> => {
    const s = new Set<string>()
    for (const l of pairs) {
      if (l.aId === id) s.add(l.bId)
      else if (l.bId === id) s.add(l.aId)
    }
    return s
  }
  const itemNeighbors = (itemId: string): Set<string> => neighborsIn(itemLinks, itemId)
  const pivotNeighbors = (pivotId: string): Set<string> => neighborsIn(pivotLinks, pivotId)

  const validTargetsFor = (node: { refId: string; kind: 'pivot' | 'item' }): Target[] => {
    const ref = node.refId
    if (node.kind === 'item') {
      const linkedPivots = new Set(links.filter((l) => l.itemId === ref).map((l) => l.pivotId))
      const neighbors = itemNeighbors(ref)
      const pv: Target[] = pivots
        .filter((p) => !linkedPivots.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, kind: 'pivot' }))
      const it: Target[] = items
        .filter((i) => i.id !== ref && !neighbors.has(i.id))
        .map((i) => ({ id: i.id, name: i.name, kind: 'item' }))
      return [...pv, ...it]
    } else {
      const linkedItems = new Set(links.filter((l) => l.pivotId === ref).map((l) => l.itemId))
      const pvNeighbors = pivotNeighbors(ref)
      const it: Target[] = items
        .filter((i) => !linkedItems.has(i.id))
        .map((i) => ({ id: i.id, name: i.name, kind: 'item' }))
      const pv: Target[] = pivots
        .filter((p) => p.id !== ref && !pvNeighbors.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, kind: 'pivot' }))
      return [...pv, ...it]
    }
  }

  // ---------- 연결 모드 ----------
  const [linking, setLinking] = useState<LinkSource | null>(null)
  const [linkQuery, setLinkQuery] = useState('')
  const linkInputRef = useRef<HTMLInputElement>(null)
  const linkingRef = useRef<LinkSource | null>(linking)

  useEffect(() => {
    if (linking) linkInputRef.current?.focus()
  }, [linking])

  const finishLink = (targetKind: 'pivot' | 'item', targetId: string): void => {
    const src = linking
    if (!src) return
    // GitHub 노드는 연결 대상이 될 수 없다(로컬 DB 링크만 가능).
    if (!isLocalRef(targetId)) return
    if (!(targetKind === src.kind && targetId === src.refId)) {
      if (src.kind === 'pivot') {
        if (targetKind === 'item') onConnect(src.refId, targetId)
        else onConnectPivots(src.refId, targetId)
      } else if (targetKind === 'pivot') {
        onConnect(targetId, src.refId)
      } else {
        onConnectItems(src.refId, targetId)
      }
    }
    setLinking(null)
    setLinkQuery('')
  }

  const linkCandidates = useMemo<Target[]>(() => {
    if (!linking) return []
    const q = linkQuery.trim().toLowerCase()
    const all = validTargetsFor(linking)
    const filtered = q ? all.filter((tg) => tg.name.toLowerCase().includes(q)) : all
    return filtered.slice(0, 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linking, linkQuery, links, itemLinks, pivotLinks, pivots, items])

  const disconnectTargets = useMemo<Target[]>(() => {
    if (!menu) return []
    const ref = menu.node.refId
    if (menu.node.kind === 'item') {
      const linkedPivots = new Set(links.filter((l) => l.itemId === ref).map((l) => l.pivotId))
      const neighbors = itemNeighbors(ref)
      const pv: Target[] = pivots
        .filter((p) => linkedPivots.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, kind: 'pivot' }))
      const it: Target[] = items
        .filter((i) => neighbors.has(i.id))
        .map((i) => ({ id: i.id, name: i.name, kind: 'item' }))
      return [...pv, ...it]
    } else {
      const linkedItems = new Set(links.filter((l) => l.pivotId === ref).map((l) => l.itemId))
      const pvNeighbors = pivotNeighbors(ref)
      const pv: Target[] = pivots
        .filter((p) => pvNeighbors.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, kind: 'pivot' }))
      const it: Target[] = items
        .filter((i) => linkedItems.has(i.id))
        .map((i) => ({ id: i.id, name: i.name, kind: 'item' }))
      return [...pv, ...it]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, links, itemLinks, pivotLinks, pivots, items])

  const applyDisconnect = (tg: Target): void => {
    if (!menu) return
    const node = menu.node
    if (node.kind === 'item') {
      if (tg.kind === 'pivot') onDisconnect(tg.id, node.refId)
      else onDisconnectItems(node.refId, tg.id)
    } else {
      if (tg.kind === 'pivot') onDisconnectPivots(node.refId, tg.id)
      else onDisconnect(node.refId, tg.id)
    }
    closeMenu()
  }

  // 매 렌더마다 최신 동작 주입(시뮬레이션 effect가 재실행되지 않도록 ref 경유).
  nodeClickRef.current = (n) => {
    if (linking) finishLink(n.kind, n.refId)
    else onNodeActivate(n)
  }
  linkingRef.current = linking

  const overlays = (
    <>
      {linking && (
        <LinkingBanner
          linking={linking}
          linkQuery={linkQuery}
          setLinkQuery={setLinkQuery}
          setLinking={setLinking}
          linkInputRef={linkInputRef}
          linkCandidates={linkCandidates}
          finishLink={finishLink}
          palette={palette}
        />
      )}

      {naming && (
        <PivotNaming
          naming={naming}
          nameText={nameText}
          setNameText={setNameText}
          finishNaming={finishNaming}
        />
      )}

      {search && (
        <RadialSearch
          search={search}
          results={results}
          query={query}
          setQuery={setQuery}
          setSearch={setSearch}
          inputRef={inputRef}
          pickResult={pickResult}
          doCreatePivot={doCreatePivot}
          palette={palette}
          canvasRef={canvasRef}
        />
      )}

      {menu && (
        <NodeMenu
          menu={menu}
          pivotHasContent={
            menu.node.kind === 'pivot' &&
            (links.some((l) => l.pivotId === menu.node.refId) ||
              pivotLinks.some((l) => l.aId === menu.node.refId))
          }
          menuMode={menuMode}
          setMenuMode={setMenuMode}
          renameText={renameText}
          setRenameText={setRenameText}
          closeMenu={closeMenu}
          setLinking={setLinking}
          setLinkQuery={setLinkQuery}
          disconnectTargets={disconnectTargets}
          applyDisconnect={applyDisconnect}
          palette={palette}
          canvasRef={canvasRef}
          onRenamePivot={onRenamePivot}
          onRenameItem={onRenameItem}
          onDeletePivot={onDeletePivot}
          onRequestDeleteSubtree={(id) => {
            setConfirmCascadeId(id)
            closeMenu()
          }}
          onDeleteItem={onDeleteItem}
        />
      )}

      {confirmCascadeId && (
        <ConfirmDialog
          message={t('graph.deleteSubtreeConfirm')}
          confirmLabel={t('graph.deleteSubtree')}
          onConfirm={() => {
            onDeletePivotCascade(confirmCascadeId)
            setConfirmCascadeId(null)
          }}
          onCancel={() => setConfirmCascadeId(null)}
        />
      )}
    </>
  )

  return {
    spawnRef,
    nodesRef,
    focusRef,
    nodeClickRef,
    linkingRef,
    setSearch,
    setQuery,
    setMenu: guardedSetMenu,
    setMenuMode,
    setRenameText,
    closeMenu,
    overlays
  }
}
