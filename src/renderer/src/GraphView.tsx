import { useEffect, useMemo, useRef, useState } from 'react'
import type { ItemLink, ItemType, LibraryItem, Link, Pivot } from './types'
import {
  IconArrowLeft,
  IconLink,
  IconPencil,
  IconPlus,
  IconScissors,
  IconSearch,
  IconTrash,
  IconX
} from './Icons'
import { useT } from './i18n'

// 피벗 중심 그래프.
// 노드: 피벗(허브) + 파일. 엣지: 피벗-파일 연결(links).
// - 전역 보기: 모든 피벗 + 모든 파일.
// - 피벗 집중 보기(activePivotId): 그 피벗과 거기에 연결된 파일만.

interface GNode {
  id: string // 'pivot:<id>' | 'item:<id>'
  refId: string
  kind: 'pivot' | 'item'
  label: string
  type?: ItemType
  x: number
  y: number
  vx: number
  vy: number
  r: number
  fixed: boolean
  h: number // 호버 애니메이션 진행도 (0~1, 매 프레임 부드럽게 보간)
}

interface GEdge {
  a: number
  b: number
  dir?: boolean // 방향 있는 엣지(피벗 부모→자식). a=부모, b=자식
}

// ---------- Barnes-Hut 쿼드트리 (반발력 O(n²) → O(n log n)) ----------
// 매 프레임 노드 위치로 쿼드트리를 만들고, 충분히 멀리 떨어진 노드 무리는
// 질량 중심 하나로 근사해 계산량을 크게 줄인다.
interface QuadCell {
  x0: number
  y0: number
  x1: number
  y1: number
  cx: number // 질량 중심 x
  cy: number // 질량 중심 y
  mass: number // 포함된 노드 수
  body: GNode | null // 노드가 하나뿐인 리프일 때 그 노드
  children: QuadCell[] | null // [NW, NE, SW, SE]
}

const BH_THETA = 0.8 // 근사 강도(작을수록 정확하지만 느림)
const BH_MIN_CELL = 1 // 좌표가 거의 같은 노드에서 무한 분할 방지

// 노드 위치 캐시(id → 좌표/속도). 모듈 레벨이라 그래프뷰가 언마운트/재마운트(목록 ↔ 그래프
// 전환)돼도 유지된다. → 그래프로 돌아왔을 때 이전 배치를 그대로 복원해 다시 펼쳐지지 않는다.
const positionCache = new Map<string, { x: number; y: number; vx: number; vy: number }>()

function makeCell(x0: number, y0: number, x1: number, y1: number): QuadCell {
  return { x0, y0, x1, y1, cx: 0, cy: 0, mass: 0, body: null, children: null }
}

function placeInChild(cell: QuadCell, b: GNode): void {
  const mx = (cell.x0 + cell.x1) / 2
  const my = (cell.y0 + cell.y1) / 2
  const i = (b.x < mx ? 0 : 1) + (b.y < my ? 0 : 2)
  insertBody(cell.children![i], b)
}

function insertBody(cell: QuadCell, b: GNode): void {
  // 질량 중심 누적 갱신
  cell.cx = (cell.cx * cell.mass + b.x) / (cell.mass + 1)
  cell.cy = (cell.cy * cell.mass + b.y) / (cell.mass + 1)
  cell.mass++
  if (cell.mass === 1) {
    cell.body = b
    return
  }
  if (cell.x1 - cell.x0 < BH_MIN_CELL) return // 셀이 너무 작으면 버킷으로 누적만
  if (!cell.children) {
    const mx = (cell.x0 + cell.x1) / 2
    const my = (cell.y0 + cell.y1) / 2
    cell.children = [
      makeCell(cell.x0, cell.y0, mx, my),
      makeCell(mx, cell.y0, cell.x1, my),
      makeCell(cell.x0, my, mx, cell.y1),
      makeCell(mx, my, cell.x1, cell.y1)
    ]
    if (cell.body) {
      placeInChild(cell, cell.body)
      cell.body = null
    }
  }
  placeInChild(cell, b)
}

function buildQuadTree(nodes: GNode[]): QuadCell | null {
  if (nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1
  const root = makeCell(minX, minY, minX + size, minY + size)
  for (const n of nodes) insertBody(root, n)
  return root
}

// 노드 b가 받는 반발력을 트리에서 누적해 b.vx/vy에 더한다.
function applyRepulsion(
  cell: QuadCell,
  b: GNode,
  repulsion: number,
  alpha: number,
  theta2: number
): void {
  if (cell.mass === 0) return
  let dx = b.x - cell.cx
  let dy = b.y - cell.cy
  let d2 = dx * dx + dy * dy
  const s = cell.x1 - cell.x0
  // 리프이거나(자식 없음) 충분히 멀면(s/d < theta) 한 덩어리로 근사
  if (cell.children === null || s * s < theta2 * d2) {
    if (cell.children === null && cell.body === b && cell.mass === 1) return // 자기 자신
    if (d2 < 1) {
      dx = Math.random() - 0.5
      dy = Math.random() - 0.5
      d2 = 1
    }
    const d = Math.sqrt(d2)
    const f = ((repulsion * cell.mass) / d2) * alpha
    b.vx += (dx / d) * f
    b.vy += (dy / d) * f
    return
  }
  for (const child of cell.children) applyRepulsion(child, b, repulsion, alpha, theta2)
}

// 테마별 캔버스 색은 App에서 palette로 내려준다
export interface GraphPalette {
  file: string
  pivot: string
  edge: string
  label: string
  labelHover: string
  accent: string // 포인트색(부모→자식 방향 호 등 강조용)
}

const DEFAULT_PALETTE: GraphPalette = {
  file: '#9aa1b5',
  pivot: '#cdd3e0',
  edge: 'rgba(154, 161, 181, 0.55)',
  label: 'rgba(232, 234, 242, 0.8)',
  labelHover: '#ffffff',
  accent: '#2dd4bf'
}

// 호버/포커스 링: 타입별 대표색. 대표색이 없으면 흰색.
const TYPE_RING: Partial<Record<ItemType, string>> = {
  md: '#7c6af2',
  pdf: '#f2786a',
  csv: '#5fd068',
  code: '#5ab8f5',
  image: '#f5c95a'
}

// 대표색이 없는 타입과 피벗은 테마의 강조 라벨 색(다크=흰색, 라이트=검정)을 쓴다
function ringColor(n: GNode, palette: GraphPalette): string {
  if (n.kind === 'item' && n.type) return TYPE_RING[n.type] ?? palette.labelHover
  return palette.labelHover
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
  onDeleteItem: (id: string) => void
  onConnect: (pivotId: string, itemId: string) => void
  onDisconnect: (pivotId: string, itemId: string) => void
  onConnectItems: (a: string, b: string) => void
  onDisconnectItems: (a: string, b: string) => void
  onConnectPivots: (a: string, b: string) => void
  onDisconnectPivots: (a: string, b: string) => void
}

// 연결/연결취소 후보 (피벗 또는 파일)
interface Target {
  id: string
  name: string
  kind: 'pivot' | 'item'
}

type MenuMode = 'main' | 'connect' | 'disconnect' | 'rename'

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

  // ---------- 시뮬레이션 + 렌더링 ----------
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const parent = canvas.parentElement!

    let width = parent.clientWidth
    let height = parent.clientHeight

    // 중력 중심: 노드를 끌어당기는 월드 좌표 기준점. 리사이즈로 바뀌지 않게 고정한다.
    const centerX = width / 2
    const centerY = height / 2

    // 뷰 변환 상태 (resize에서 보정하므로 먼저 선언)
    let scale = 1
    let offsetX = 0
    let offsetY = 0
    let tweening = false
    let targetScale = 1
    let targetOffsetX = 0
    let targetOffsetY = 0
    let focusId: string | null = null

    const resize = () => {
      const newW = parent.clientWidth
      const newH = parent.clientHeight
      // 노드 좌표·중력 중심은 그대로 두고, 화면 중앙에 있던 지점이 계속 중앙에 남도록
      // 뷰 오프셋만 보정한다. → 줌/패닝 상태와 무관하게 보던 위치가 유지되고 쏠림도 없다.
      if (newW !== width || newH !== height) {
        const dx = (newW - width) / 2
        const dy = (newH - height) / 2
        offsetX += dx
        offsetY += dy
        targetOffsetX += dx
        targetOffsetY += dy
      }
      width = newW
      height = newH
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(parent)

    // 그래프 빌드
    const nodes: GNode[] = []
    const edges: GEdge[] = []
    const idx = new Map<string, number>()
    // 첫 빌드(보존된 위치 없음)인지, 이번에 새로 생긴 노드 인덱스는 무엇인지 추적
    const isFirstBuild = positionCache.size === 0
    const newIndices: number[] = []
    // 첫 배치 스폰 반경: 노드 수에 비례해 넓게 퍼뜨려(원판) 중심 뭉침을 줄인다.
    const totalNodes = visible.pivots.length + visible.items.length
    const spawnR = Math.max(250, Math.sqrt(Math.max(1, totalNodes)) * 55)
    const add = (n: Omit<GNode, 'x' | 'y' | 'vx' | 'vy' | 'fixed' | 'h'>) => {
      const i = nodes.length
      idx.set(n.id, i)
      const saved = positionCache.get(n.id)
      if (saved) {
        // 기존 노드는 이전 위치/속도를 그대로 복원 → 튀지 않음
        nodes.push({ ...n, x: saved.x, y: saved.y, vx: saved.vx, vy: saved.vy, fixed: false, h: 0 })
      } else {
        // 새 노드는 중심을 둘러싼 원판에 고르게 스폰(아래에서 이웃이 있으면 그 근처로 재배치)
        newIndices.push(i)
        const ang = Math.random() * Math.PI * 2
        const rad = Math.sqrt(Math.random()) * spawnR
        nodes.push({
          ...n,
          x: centerX + Math.cos(ang) * rad,
          y: centerY + Math.sin(ang) * rad,
          vx: 0,
          vy: 0,
          fixed: false,
          h: 0
        })
      }
    }

    for (const p of visible.pivots) {
      add({ id: `pivot:${p.id}`, refId: p.id, kind: 'pivot', label: p.name, r: 10 })
      // 방금 생성한 피벗은 우클릭한 자리에 고정(이름 입력 동안)
      const spawn = spawnRef.current
      if (spawn && spawn.id === p.id) {
        const n = nodes[nodes.length - 1]
        n.x = spawn.x
        n.y = spawn.y
        n.fixed = true
      }
    }
    for (const i of visible.items) {
      add({ id: `item:${i.id}`, refId: i.id, kind: 'item', label: i.name, type: i.type, r: 6 })
    }
    const visiblePivotIds = new Set(visible.pivots.map((p) => p.id))
    const visibleItemIds = new Set(visible.items.map((i) => i.id))
    for (const l of links) {
      if (!visiblePivotIds.has(l.pivotId) || !visibleItemIds.has(l.itemId)) continue
      const a = idx.get(`pivot:${l.pivotId}`)
      const b = idx.get(`item:${l.itemId}`)
      if (a !== undefined && b !== undefined) edges.push({ a, b })
    }
    // 파일↔파일 연결
    for (const l of itemLinks) {
      if (!visibleItemIds.has(l.aId) || !visibleItemIds.has(l.bId)) continue
      const a = idx.get(`item:${l.aId}`)
      const b = idx.get(`item:${l.bId}`)
      if (a !== undefined && b !== undefined) edges.push({ a, b })
    }
    // 피벗↔피벗 연결 (부모 a → 자식 b, 방향 있음)
    for (const l of pivotLinks) {
      if (!visiblePivotIds.has(l.aId) || !visiblePivotIds.has(l.bId)) continue
      const a = idx.get(`pivot:${l.aId}`)
      const b = idx.get(`pivot:${l.bId}`)
      if (a !== undefined && b !== undefined) edges.push({ a, b, dir: true })
    }

    // 새 노드(첫 빌드 제외)는 연결된 기존 노드들의 평균 위치 근처에 등장시켜
    // 멀리서 날아오지 않게 한다.
    if (!isFirstBuild && newIndices.length > 0) {
      const isNew = new Set(newIndices)
      for (const ni of newIndices) {
        let sx = 0
        let sy = 0
        let cnt = 0
        for (const e of edges) {
          if (e.a === ni && !isNew.has(e.b)) {
            sx += nodes[e.b].x
            sy += nodes[e.b].y
            cnt++
          } else if (e.b === ni && !isNew.has(e.a)) {
            sx += nodes[e.a].x
            sy += nodes[e.a].y
            cnt++
          }
        }
        if (cnt > 0) {
          nodes[ni].x = sx / cnt + (Math.random() - 0.5) * 40
          nodes[ni].y = sy / cnt + (Math.random() - 0.5) * 40
        }
      }
    }

    nodesRef.current = nodes

    focusRef.current = (id: string) => {
      const n = nodes.find((nd) => nd.id === id)
      if (!n) return
      targetScale = 1.8
      targetOffsetX = width / 2 - n.x * targetScale
      targetOffsetY = height / 2 - n.y * targetScale
      tweening = true
      focusId = id
      alpha = Math.max(alpha, 0.2)
    }

    let dragNode: GNode | null = null
    let panning = false
    let lastX = 0
    let lastY = 0
    let moved = 0
    let hoverNode: GNode | null = null
    // 호버 강조 상태: 피벗에 마우스를 올리면 그 직계 자식만 밝히고 나머지는 흐리게(옵시디언식).
    let dim = 0 // 0=강조 없음, 1=완전 강조 (부드럽게 보간)
    let hlNodes: Set<GNode> | null = null
    let hlEdges: Set<GEdge> | null = null

    const toWorld = (sx: number, sy: number) => ({
      x: (sx - offsetX) / scale,
      y: (sy - offsetY) / scale
    })

    const hitTest = (sx: number, sy: number): GNode | null => {
      const { x, y } = toWorld(sx, sy)
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        const dx = n.x - x
        const dy = n.y - y
        if (dx * dx + dy * dy <= (n.r + 5) * (n.r + 5)) return n
      }
      return null
    }

    const REPULSION = 2600
    const SPRING = 0.04
    const SPRING_LEN = 90
    const GRAVITY = 0.012
    const DAMPING = 0.85
    const MAX_V = 40 // 프레임당 최대 이동량(요동 방지 안전장치)

    // 재가열(reheat) 세기:
    // - 첫 빌드: 1 (전체 레이아웃)
    // - 새 노드가 생김: 0.3 (부분적으로 자리 잡기)
    // - 위치만 복원되는 변경(이름변경·태그 등): 0.05 (거의 안 움직임)
    let alpha = isFirstBuild ? 1 : newIndices.length > 0 ? 0.3 : 0.05

    const BH_THETA2 = BH_THETA * BH_THETA

    const step = () => {
      // 반발력: Barnes-Hut 쿼드트리로 O(n log n) 근사
      const tree = buildQuadTree(nodes)
      if (tree) {
        for (const n of nodes) applyRepulsion(tree, n, REPULSION, alpha, BH_THETA2)
      }
      for (const e of edges) {
        const a = nodes[e.a]
        const b = nodes[e.b]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - SPRING_LEN) * SPRING * alpha
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
      for (const n of nodes) {
        if (n.fixed) {
          n.vx = 0
          n.vy = 0
          continue
        }
        n.vx += (centerX - n.x) * GRAVITY * alpha
        n.vy += (centerY - n.y) * GRAVITY * alpha
        n.vx *= DAMPING
        n.vy *= DAMPING
        // 프레임당 이동량 제한(어떤 경우에도 휙 날지 않게)
        if (n.vx > MAX_V) n.vx = MAX_V
        else if (n.vx < -MAX_V) n.vx = -MAX_V
        if (n.vy > MAX_V) n.vy = MAX_V
        else if (n.vy < -MAX_V) n.vy = -MAX_V
        n.x += n.vx
        n.y += n.vy
      }
      if (alpha > 0.03) alpha *= 0.998
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.save()
      ctx.translate(offsetX, offsetY)
      ctx.scale(scale, scale)

      // 호버한 피벗의 하위 전체(자식·손자… 서브트리)를 강조 대상으로 모은다.
      // 엣지는 a=부모/원본, b=자식/대상으로 저장되므로, 자식 방향(e.a==현재)으로만 내려간다.
      const dimTarget = hoverNode && hoverNode.kind === 'pivot' ? 1 : 0
      if (hoverNode && hoverNode.kind === 'pivot') {
        const start = nodes.indexOf(hoverNode)
        // 1) 하위 피벗을 BFS로 모두 수집(피벗→피벗 방향만 따라감)
        const pivotSet = new Set<number>([start])
        const queue = [start]
        while (queue.length > 0) {
          const cur = queue.shift() as number
          for (const e of edges) {
            if (e.a === cur && nodes[e.b].kind === 'pivot' && !pivotSet.has(e.b)) {
              pivotSet.add(e.b)
              queue.push(e.b)
            }
          }
        }
        // 2) 수집된 피벗들 + 그들에 연결된 파일 + 잇는 엣지를 모두 강조
        const hn = new Set<GNode>()
        const he = new Set<GEdge>()
        for (const pi of pivotSet) hn.add(nodes[pi])
        for (const e of edges) {
          if (pivotSet.has(e.a)) {
            he.add(e)
            hn.add(nodes[e.b])
          }
        }
        hlNodes = hn
        hlEdges = he
      }
      dim += (dimTarget - dim) * 0.2
      if (dim < 0.002) {
        dim = 0
        hlNodes = null
        hlEdges = null
      }
      const dimAlpha = 1 - 0.82 * dim

      ctx.strokeStyle = palette.edge
      ctx.lineWidth = 1.6 / scale
      for (const e of edges) {
        ctx.globalAlpha = !hlEdges || hlEdges.has(e) ? 1 : dimAlpha
        ctx.beginPath()
        ctx.moveTo(nodes[e.a].x, nodes[e.a].y)
        ctx.lineTo(nodes[e.b].x, nodes[e.b].y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      for (const n of nodes) {
        const color = n.kind === 'pivot' ? palette.pivot : palette.file
        const isHover = n === hoverNode
        const isFocus = n.id === focusId
        // 강조 중이고 자식 집합에 없으면 흐리게
        const na = !hlNodes || hlNodes.has(n) ? 1 : dimAlpha

        // 애플식 부드러운 호버: 목표값(0/1)으로 매 프레임 지수 보간
        const target = isHover || isFocus ? 1 : 0
        n.h += (target - n.h) * 0.16
        if (Math.abs(target - n.h) < 0.004) n.h = target
        const ring = ringColor(n, palette)
        const drawR = n.r * (1 + 0.15 * n.h) // 최대 1.15배만 커진다

        if (isFocus) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r * 2.2, 0, Math.PI * 2)
          ctx.strokeStyle = ring
          ctx.globalAlpha = 0.5 * na
          ctx.lineWidth = 2 / scale
          ctx.stroke()
          ctx.globalAlpha = 1
        }

        // 은은한 글로우 (호버 진행도에 비례)
        if (n.h > 0.01) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(n.x, n.y, drawR, 0, Math.PI * 2)
          ctx.shadowColor = ring
          ctx.shadowBlur = 18 * n.h
          ctx.fillStyle = color
          ctx.globalAlpha = 0.9 * n.h * na
          ctx.fill()
          ctx.restore()
        }

        // 완전 불투명으로 채워 엣지가 노드 뒤로 비치지 않게 한다
        ctx.beginPath()
        ctx.arc(n.x, n.y, drawR, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = na
        ctx.fill()
        if (n.kind === 'pivot') {
          ctx.strokeStyle = palette.labelHover
          ctx.globalAlpha = 0.5 * na
          ctx.lineWidth = 2 / scale
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        // 컬러 링도 서서히 떠오른다
        if (n.h > 0.01) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, drawR + 2.5 / scale, 0, Math.PI * 2)
          ctx.strokeStyle = ring
          ctx.globalAlpha = n.h * na
          ctx.lineWidth = 1.5 / scale
          ctx.stroke()
          ctx.globalAlpha = 1
        }

        // 라벨: 확대된 원 반지름 기준으로 내려와서 절대 가려지지 않는다
        const zoomLabel = n.kind === 'pivot' || scale > 1.4
        const labelAlpha = zoomLabel ? 1 : n.h
        if (labelAlpha > 0.02) {
          const fontSize = (n.kind === 'pivot' ? 13 : 10) / scale
          ctx.font = `${n.kind === 'pivot' ? '600 ' : ''}${fontSize}px 'Segoe UI', 'Malgun Gothic', sans-serif`
          ctx.globalAlpha = labelAlpha * na
          ctx.fillStyle = n.h > 0.5 ? palette.labelHover : palette.label
          ctx.textAlign = 'center'
          ctx.fillText(n.label, n.x, n.y + drawR + fontSize + 4 / scale)
          ctx.globalAlpha = 1
        }
      }

      // 부모→자식 방향 표시: 부모 피벗 테두리의 자식 쪽에 흰색 점을 찍는다.
      ctx.fillStyle = palette.labelHover
      for (const e of edges) {
        if (!e.dir) continue
        const p = nodes[e.a] // 부모
        const c = nodes[e.b] // 자식
        const pna = !hlNodes || hlNodes.has(p) ? 1 : dimAlpha
        const drawR = p.r * (1 + 0.15 * p.h)
        const ang = Math.atan2(c.y - p.y, c.x - p.x)
        const dotX = p.x + Math.cos(ang) * (drawR + 4 / scale)
        const dotY = p.y + Math.sin(ang) * (drawR + 4 / scale)
        ctx.beginPath()
        ctx.arc(dotX, dotY, 4 / scale, 0, Math.PI * 2)
        ctx.globalAlpha = 0.95 * pna
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // 연결 모드: 소스 노드에서 마우스 커서까지 따라오는 고무줄 선
      const link = linkingRef.current
      if (link) {
        const srcId = (link.kind === 'pivot' ? 'pivot:' : 'item:') + link.refId
        const src = nodes.find((nd) => nd.id === srcId)
        if (src) {
          const m = toWorld(lastX, lastY)
          ctx.strokeStyle = palette.pivot
          ctx.globalAlpha = 0.85
          ctx.lineWidth = 2 / scale
          ctx.setLineDash([6 / scale, 5 / scale])
          ctx.beginPath()
          ctx.moveTo(src.x, src.y)
          ctx.lineTo(m.x, m.y)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.arc(m.x, m.y, 3.5 / scale, 0, Math.PI * 2)
          ctx.fillStyle = palette.pivot
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }

      ctx.restore()
    }

    let raf = 0
    const loop = () => {
      step()
      if (tweening) {
        if (focusId) {
          const n = nodes.find((nd) => nd.id === focusId)
          if (n) {
            targetOffsetX = width / 2 - n.x * targetScale
            targetOffsetY = height / 2 - n.y * targetScale
          }
        }
        const k = 0.12
        scale += (targetScale - scale) * k
        offsetX += (targetOffsetX - offsetX) * k
        offsetY += (targetOffsetY - offsetY) * k
        if (
          Math.abs(targetScale - scale) < 0.001 &&
          Math.abs(targetOffsetX - offsetX) < 0.5 &&
          Math.abs(targetOffsetY - offsetY) < 0.5
        ) {
          tweening = false
        }
      }
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      tweening = false
      moved = 0
      const hit = hitTest(sx, sy)
      if (hit) {
        dragNode = hit
        hit.fixed = true
        alpha = Math.max(alpha, 0.3)
      } else {
        panning = true
      }
      lastX = sx
      lastY = sy
    }

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const hit = hitTest(sx, sy)
      if (hit) {
        setSearch(null)
        setMenuMode('main')
        setRenameText(hit.label)
        setMenu({ x: sx, y: sy, node: hit })
      } else {
        closeMenu()
        setSearch({ x: sx, y: sy })
        setQuery('')
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (dragNode) {
        const w = toWorld(sx, sy)
        dragNode.x = w.x
        dragNode.y = w.y
        moved += Math.abs(sx - lastX) + Math.abs(sy - lastY)
      } else if (panning) {
        offsetX += sx - lastX
        offsetY += sy - lastY
        moved += Math.abs(sx - lastX) + Math.abs(sy - lastY)
      } else {
        hoverNode = hitTest(sx, sy)
        canvas.style.cursor = hoverNode ? 'pointer' : 'grab'
      }
      lastX = sx
      lastY = sy
    }

    const onMouseUp = () => {
      if (dragNode) {
        if (moved < 5) {
          nodeClickRef.current({
            refId: dragNode.refId,
            kind: dragNode.kind,
            label: dragNode.label
          })
        }
        dragNode.fixed = false
        dragNode = null
      }
      panning = false
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      tweening = false
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const newScale = Math.min(4, Math.max(0.25, scale * factor))
      offsetX = sx - ((sx - offsetX) / scale) * newScale
      offsetY = sy - ((sy - offsetY) / scale) * newScale
      scale = newScale
    }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      // 현재 보이는 노드 위치를 저장(집중 보기로 숨겨진 노드의 좌표는 유지해야 하므로
      // 통째로 교체하지 않고 갱신만 한다). 실제로 삭제된 노드만 정리한다.
      for (const n of nodes) positionCache.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy })
      const liveIds = new Set<string>([
        ...items.map((i) => `item:${i.id}`),
        ...pivots.map((p) => `pivot:${p.id}`)
      ])
      for (const key of positionCache.keys()) {
        if (!liveIds.has(key)) positionCache.delete(key)
      }
      cancelAnimationFrame(raf)
      ro.disconnect()
      focusRef.current = null
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [visible, links, itemLinks, pivotLinks, pivots, items, onOpenItem, onSelectPivot])

  const activePivot = pivots.find((p) => p.id === activePivotId) ?? null

  return (
    <div className="graph-wrap">
      <canvas ref={canvasRef} />

      {/* 집중 보기 헤더 */}
      {activePivot && (
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
      )}

      {/* 연결 모드 배너 + 검색 */}
      {linking && (
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
              linkCandidates.map((t) => (
                <button key={`${t.kind}:${t.id}`} onClick={() => finishLink(t.kind, t.id)}>
                  <span
                    className="dot"
                    style={{ background: t.kind === 'pivot' ? palette.pivot : palette.file }}
                  />
                  <span className="t-name">{t.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* 새 피벗 이름 입력 (노드 바로 아래) */}
      {naming && (
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
      )}

      {/* 우클릭 검색 + 피벗 생성 */}
      {search &&
        (() => {
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
                        style={{
                          background: item.kind === 'pivot' ? palette.pivot : palette.file
                        }}
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
                  {n === 0 && query.trim() && (
                    <div className="radial-status">{t('graph.noResults')}</div>
                  )}
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
        })()}

      {/* 노드 컨텍스트 메뉴 */}
      {menu && (
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
                style={{
                  background: menu.node.kind === 'pivot' ? palette.pivot : palette.file
                }}
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
                    setLinking({
                      refId: menu.node.refId,
                      kind: menu.node.kind,
                      label: menu.node.label
                    })
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
                    if (menu.node.kind === 'pivot') onDeletePivot(menu.node.refId)
                    else onDeleteItem(menu.node.refId)
                    closeMenu()
                  }}
                >
                  <IconTrash size={14} />
                  <span>{t('graph.delete')}</span>
                </button>
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
                      if (menu.node.kind === 'pivot')
                        onRenamePivot(menu.node.refId, renameText)
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
                  disconnectTargets.map((t) => (
                    <button key={`${t.kind}:${t.id}`} onClick={() => applyDisconnect(t)}>
                      <span
                        className="dot"
                        style={{
                          background: t.kind === 'pivot' ? palette.pivot : palette.file
                        }}
                      />
                      <span className="t-name">{t.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </>
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
