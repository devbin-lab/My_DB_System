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
}

// 테마별 캔버스 색은 App에서 palette로 내려준다
export interface GraphPalette {
  file: string
  pivot: string
  edge: string
  label: string
  labelHover: string
}

const DEFAULT_PALETTE: GraphPalette = {
  file: '#9aa1b5',
  pivot: '#cdd3e0',
  edge: 'rgba(154, 161, 181, 0.55)',
  label: 'rgba(232, 234, 242, 0.8)',
  labelHover: '#ffffff'
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

  // 어떤 노드를 그릴지 결정 (집중 보기면 해당 피벗 + 연결 파일만)
  const visible = useMemo(() => {
    if (activePivotId) {
      const memberIds = new Set(
        links.filter((l) => l.pivotId === activePivotId).map((l) => l.itemId)
      )
      const pivot = pivots.find((p) => p.id === activePivotId)
      return {
        pivots: pivot ? [pivot] : [],
        items: items.filter((i) => memberIds.has(i.id))
      }
    }
    return { pivots, items }
  }, [activePivotId, pivots, items, links])

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

  // ---------- 시뮬레이션 + 렌더링 ----------
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const parent = canvas.parentElement!

    let width = parent.clientWidth
    let height = parent.clientHeight

    const resize = () => {
      width = parent.clientWidth
      height = parent.clientHeight
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
    const add = (n: Omit<GNode, 'x' | 'y' | 'vx' | 'vy' | 'fixed' | 'h'>) => {
      idx.set(n.id, nodes.length)
      nodes.push({
        ...n,
        x: width / 2 + (Math.random() - 0.5) * Math.min(width, 600),
        y: height / 2 + (Math.random() - 0.5) * Math.min(height, 600),
        vx: 0,
        vy: 0,
        fixed: false,
        h: 0
      })
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
    // 피벗↔피벗 연결
    for (const l of pivotLinks) {
      if (!visiblePivotIds.has(l.aId) || !visiblePivotIds.has(l.bId)) continue
      const a = idx.get(`pivot:${l.aId}`)
      const b = idx.get(`pivot:${l.bId}`)
      if (a !== undefined && b !== undefined) edges.push({ a, b })
    }

    nodesRef.current = nodes

    // 뷰 변환
    let scale = 1
    let offsetX = 0
    let offsetY = 0
    let tweening = false
    let targetScale = 1
    let targetOffsetX = 0
    let targetOffsetY = 0
    let focusId: string | null = null

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
    let alpha = 1

    const step = () => {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) {
            dx = Math.random() - 0.5
            dy = Math.random() - 0.5
            d2 = 1
          }
          const f = (REPULSION / d2) * alpha
          const d = Math.sqrt(d2)
          const fx = (dx / d) * f
          const fy = (dy / d) * f
          a.vx += fx
          a.vy += fy
          b.vx -= fx
          b.vy -= fy
        }
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
        n.vx += (width / 2 - n.x) * GRAVITY * alpha
        n.vy += (height / 2 - n.y) * GRAVITY * alpha
        n.vx *= DAMPING
        n.vy *= DAMPING
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

      ctx.strokeStyle = palette.edge
      ctx.lineWidth = 1.6 / scale
      ctx.beginPath()
      for (const e of edges) {
        ctx.moveTo(nodes[e.a].x, nodes[e.a].y)
        ctx.lineTo(nodes[e.b].x, nodes[e.b].y)
      }
      ctx.stroke()

      for (const n of nodes) {
        const color = n.kind === 'pivot' ? palette.pivot : palette.file
        const isHover = n === hoverNode
        const isFocus = n.id === focusId

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
          ctx.globalAlpha = 0.5
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
          ctx.globalAlpha = 0.9 * n.h
          ctx.fill()
          ctx.restore()
        }

        // 완전 불투명으로 채워 엣지가 노드 뒤로 비치지 않게 한다
        ctx.beginPath()
        ctx.arc(n.x, n.y, drawR, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        if (n.kind === 'pivot') {
          ctx.strokeStyle = palette.labelHover
          ctx.globalAlpha = 0.5
          ctx.lineWidth = 2 / scale
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        // 컬러 링도 서서히 떠오른다
        if (n.h > 0.01) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, drawR + 2.5 / scale, 0, Math.PI * 2)
          ctx.strokeStyle = ring
          ctx.globalAlpha = n.h
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
          ctx.globalAlpha = labelAlpha
          ctx.fillStyle = n.h > 0.5 ? palette.labelHover : palette.label
          ctx.textAlign = 'center'
          ctx.fillText(n.label, n.x, n.y + drawR + fontSize + 4 / scale)
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
