import { useEffect, useMemo, useRef, useState } from 'react'
import type { ItemLink, LibraryItem, Link, Pivot } from './types'
import { useT } from './i18n'
import type { GNode, GraphPalette, MenuMode, Target } from './graph/types'
import {
  LinkingBanner,
  NodeMenu,
  PivotBanner,
  PivotNaming,
  RadialSearch
} from './graph/overlays'
import { useGraphSimulation } from './graph/useGraphSimulation'

// 피벗 중심 그래프.
// 노드: 피벗(허브) + 파일. 엣지: 피벗-파일 연결(links).
// - 전역 보기: 모든 피벗 + 모든 파일.
// - 피벗 집중 보기(activePivotId): 그 피벗과 거기에 연결된 파일만.

// 테마별 캔버스 기본 색(App에서 palette로 덮어쓴다)
const DEFAULT_PALETTE: GraphPalette = {
  file: '#9aa1b5',
  pivot: '#cdd3e0',
  edge: 'rgba(154, 161, 181, 0.55)',
  label: 'rgba(232, 234, 242, 0.8)',
  labelHover: '#ffffff',
  accent: '#2dd4bf'
}

interface Props {
  items: LibraryItem[]
  pivots: Pivot[]
  links: Link[]
  itemLinks: ItemLink[]
  pivotLinks: ItemLink[]
  activePivotId: string | null
  maxResults?: number
  palette?: GraphPalette
  onOpenItem: (id: string) => void
  onSelectPivot: (id: string | null) => void
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

export default function GraphView(props: Props) {
  const {
    items,
    pivots,
    links,
    itemLinks,
    pivotLinks,
    activePivotId,
    maxResults = 12,
    palette = DEFAULT_PALETTE,
    onOpenItem,
    onSelectPivot,
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
  } = props

  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const focusRef = useRef<((id: string) => void) | null>(null)
  // 노드 클릭 시 동작. 연결 모드면 연결, 아니면 열기/피벗진입.
  // 시뮬레이션 effect가 매번 재실행되지 않도록 ref로 최신 동작을 주입한다.
  const nodeClickRef = useRef<
    (n: { refId: string; kind: 'pivot' | 'item'; label: string }) => void
  >(() => {})

  // 어떤 노드를 그릴지 결정.
  // 집중 보기면: 활성 피벗 + pivotLinks(부모→자식)를 따라 내려간 모든 하위 피벗(자식·손자…)
  //   + 그 피벗들에 연결된 파일.
  // pivotLinks는 방향이 있으므로(a_id=부모, b_id=자식) 자식 방향으로만 내려간다.
  // → 부모 피벗을 클릭하면 하위 계층만 펼쳐지고 상위(부모/형제)는 보이지 않는다.
  const visible = useMemo(() => {
    if (activePivotId) {
      const pivotIds = new Set<string>([activePivotId])
      const queue = [activePivotId]
      while (queue.length > 0) {
        const cur = queue.shift() as string
        for (const pl of pivotLinks) {
          if (pl.aId === cur && !pivotIds.has(pl.bId)) {
            pivotIds.add(pl.bId)
            queue.push(pl.bId)
          }
        }
      }
      const memberIds = new Set(
        links.filter((l) => pivotIds.has(l.pivotId)).map((l) => l.itemId)
      )
      return {
        pivots: pivots.filter((p) => pivotIds.has(p.id)),
        items: items.filter((i) => memberIds.has(i.id))
      }
    }
    return { pivots, items }
  }, [activePivotId, pivots, items, links, pivotLinks])

  // ---------- 우클릭 검색/피벗 생성 오버레이 ----------
  const [search, setSearch] = useState<{ x: number; y: number } | null>(null)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    if (!search) return []
    const q = query.trim().toLowerCase()
    if (!q) return []
    const pv = visible.pivots
      .filter((p) => p.name.toLowerCase().includes(q))
      .map((p) => ({ kind: 'pivot' as const, id: p.id, name: p.name, type: undefined }))
    const it = visible.items
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
      )
      .map((i) => ({ kind: 'item' as const, id: i.id, name: i.name, type: i.type }))
    return [...pv, ...it].slice(0, maxResults)
  }, [search, query, visible, maxResults])

  useEffect(() => {
    if (search) inputRef.current?.focus()
  }, [search])

  const pickResult = (r: { kind: 'pivot' | 'item'; id: string }) => {
    focusRef.current?.(`${r.kind}:${r.id}`)
    setSearch(null)
    setQuery('')
  }

  // ---------- 피벗 즉시 생성 + 그 자리에서 이름 입력 ----------
  // spawnRef: 새 피벗 노드를 우클릭한 위치에 고정 배치하기 위한 정보
  const spawnRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const nodesRef = useRef<GNode[]>([])
  const [naming, setNaming] = useState<{ pivotId: string; x: number; y: number } | null>(
    null
  )
  const [nameText, setNameText] = useState('')

  const doCreatePivot = async () => {
    if (!search) return
    const pos = { x: search.x, y: search.y }
    setSearch(null)
    setQuery('')
    const pivot = await onCreatePivot()
    spawnRef.current = { id: pivot.id, ...pos }
    setNameText('')
    setNaming({ pivotId: pivot.id, ...pos })
  }

  const finishNaming = (save: boolean) => {
    if (!naming) return
    if (save && nameText.trim()) {
      onRenamePivot(naming.pivotId, nameText.trim())
    }
    // 고정 해제
    const node = nodesRef.current.find((n) => n.id === `pivot:${naming.pivotId}`)
    if (node) node.fixed = false
    spawnRef.current = null
    setNaming(null)
  }

  // ---------- 노드 우클릭 컨텍스트 메뉴 ----------
  const [menu, setMenu] = useState<{ x: number; y: number; node: GNode } | null>(null)
  const [menuMode, setMenuMode] = useState<MenuMode>('main')
  const [renameText, setRenameText] = useState('')

  const closeMenu = () => {
    setMenu(null)
    setMenuMode('main')
  }

  // pair 연결에서 특정 id의 이웃 집합 (파일↔파일 또는 피벗↔피벗)
  const neighborsIn = (pairs: ItemLink[], id: string): Set<string> => {
    const s = new Set<string>()
    for (const l of pairs) {
      if (l.aId === id) s.add(l.bId)
      else if (l.bId === id) s.add(l.aId)
    }
    return s
  }
  const itemNeighbors = (itemId: string) => neighborsIn(itemLinks, itemId)
  const pivotNeighbors = (pivotId: string) => neighborsIn(pivotLinks, pivotId)

  // 어떤 노드(source)에 연결 가능한 후보 목록
  // (피벗 → 파일만 / 파일 → 피벗 + 다른 파일, 이미 연결된 건 제외)
  const validTargetsFor = (node: { refId: string; kind: 'pivot' | 'item' }): Target[] => {
    const ref = node.refId
    if (node.kind === 'item') {
      const linkedPivots = new Set(
        links.filter((l) => l.itemId === ref).map((l) => l.pivotId)
      )
      const neighbors = itemNeighbors(ref)
      const pv: Target[] = pivots
        .filter((p) => !linkedPivots.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, kind: 'pivot' }))
      const it: Target[] = items
        .filter((i) => i.id !== ref && !neighbors.has(i.id))
        .map((i) => ({ id: i.id, name: i.name, kind: 'item' }))
      return [...pv, ...it]
    } else {
      // 피벗 → 연결 안 된 파일 + 연결 안 된 다른 피벗
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
  // source 노드를 정해두고, 그래프에서 대상 노드를 직접 클릭하거나
  // 검색창에서 골라 연결한다.
  const [linking, setLinking] = useState<{
    refId: string
    kind: 'pivot' | 'item'
    label: string
  } | null>(null)
  const [linkQuery, setLinkQuery] = useState('')
  const linkInputRef = useRef<HTMLInputElement>(null)
  // 연결 모드에서 캔버스 draw 루프가 최신 소스 노드를 읽도록 ref로 주입(고무줄 선용)
  const linkingRef = useRef(linking)

  useEffect(() => {
    if (linking) linkInputRef.current?.focus()
  }, [linking])

  // source → (targetKind,targetId) 연결 실행
  const finishLink = (targetKind: 'pivot' | 'item', targetId: string) => {
    const src = linking
    if (!src) return
    if (!(targetKind === src.kind && targetId === src.refId)) {
      if (src.kind === 'pivot') {
        if (targetKind === 'item') onConnect(src.refId, targetId)
        else onConnectPivots(src.refId, targetId) // 피벗 ↔ 피벗
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
    const filtered = q ? all.filter((t) => t.name.toLowerCase().includes(q)) : all
    return filtered.slice(0, 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linking, linkQuery, links, itemLinks, pivotLinks, pivots, items])

  const disconnectTargets = useMemo<Target[]>(() => {
    if (!menu) return []
    const ref = menu.node.refId
    if (menu.node.kind === 'item') {
      const linkedPivots = new Set(
        links.filter((l) => l.itemId === ref).map((l) => l.pivotId)
      )
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
  }, [menu, links, itemLinks, pivotLinks, pivots, items])

  const applyDisconnect = (t: Target) => {
    if (!menu) return
    const node = menu.node
    if (node.kind === 'item') {
      if (t.kind === 'pivot') onDisconnect(t.id, node.refId)
      else onDisconnectItems(node.refId, t.id)
    } else {
      // 피벗 노드
      if (t.kind === 'pivot') onDisconnectPivots(node.refId, t.id)
      else onDisconnect(node.refId, t.id)
    }
    closeMenu()
  }

  // 매 렌더마다 최신 클릭 동작 주입
  nodeClickRef.current = (n) => {
    if (linking) finishLink(n.kind, n.refId)
    else if (n.kind === 'item') onOpenItem(n.refId)
    else onSelectPivot(n.refId)
  }
  linkingRef.current = linking

  // 물리 시뮬레이션 + 캔버스 렌더링 + 마우스 상호작용 (graph/useGraphSimulation.ts)
  useGraphSimulation({
    canvasRef,
    visible,
    links,
    itemLinks,
    pivotLinks,
    pivots,
    items,
    palette,
    spawnRef,
    nodesRef,
    focusRef,
    nodeClickRef,
    linkingRef,
    setSearch,
    setQuery,
    setMenu,
    setMenuMode,
    setRenameText,
    closeMenu,
    onOpenItem,
    onSelectPivot
  })

  const activePivot = pivots.find((p) => p.id === activePivotId) ?? null

  return (
    <div className="graph-wrap">
      <canvas ref={canvasRef} />

      {activePivot && (
        <PivotBanner activePivot={activePivot} palette={palette} onSelectPivot={onSelectPivot} />
      )}

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
          onDeletePivotCascade={onDeletePivotCascade}
          onDeleteItem={onDeleteItem}
        />
      )}

      {visible.items.length === 0 && visible.pivots.length === 0 && (
        <div className="graph-empty">
          {activePivot ? t('graph.emptyPivot') : t('graph.empty')}
          <br />
          <small>{t('graph.emptyHint')}</small>
        </div>
      )}

      <div className="graph-legend">{t('graph.legend')}</div>
    </div>
  )
}
