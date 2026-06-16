import { useEffect } from 'react'
import type { ItemLink, LibraryItem, Link, Pivot } from '../types'
import { applyRepulsion, BH_THETA, buildQuadTree } from './quadtree'
import { ringColor } from './colors'
import type { GEdge, GNode, GraphPalette, LinkSource, MenuMode } from './types'

// 노드 위치 캐시(id → 좌표/속도). 모듈 레벨이라 그래프뷰가 언마운트/재마운트(목록 ↔ 그래프
// 전환)돼도 유지된다. → 그래프로 돌아왔을 때 이전 배치를 그대로 복원해 다시 펼쳐지지 않는다.
const positionCache = new Map<string, { x: number; y: number; vx: number; vy: number }>()

// 중력 중심(월드 좌표)도 위치 캐시와 함께 유지한다. effect가 재실행될 때마다 새로 계산하면,
// 리사이즈 이후 캐시된 노드 좌표와 중심이 어긋나 노드 전체가 한 방향으로 쏠린다.
let gravityCenter: { x: number; y: number } | null = null

// 뷰 변환(줌/패닝)도 유지한다. 그래프뷰 재마운트(목록 ↔ 그래프 전환) 시 0으로 초기화되면
// 노드 군집이 한쪽으로 치우쳐 보이므로, 떠날 때의 뷰를 그대로 복원한다.
let viewState: { scale: number; offsetX: number; offsetY: number } | null = null

interface NodeClickArg {
  refId: string
  kind: 'pivot' | 'item'
  label: string
}

interface SimulationParams {
  canvasRef: { current: HTMLCanvasElement | null }
  visible: { pivots: Pivot[]; items: LibraryItem[] }
  links: Link[]
  itemLinks: ItemLink[]
  pivotLinks: ItemLink[]
  pivots: Pivot[]
  items: LibraryItem[]
  palette: GraphPalette
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
  onOpenItem: (id: string) => void
  onSelectPivot: (id: string | null) => void
}

// 피벗 그래프의 물리 시뮬레이션 + 캔버스 렌더링 + 마우스 상호작용을 담당하는 훅.
// (컴포넌트의 JSX/상태와 분리된 "명령형 캔버스" 영역)
export function useGraphSimulation(params: SimulationParams): void {
  const {
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
  } = params

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const parent = canvas.parentElement!

    let width = parent.clientWidth
    let height = parent.clientHeight

    // 중력 중심: 노드를 끌어당기는 월드 좌표 기준점. 최초 1회만 정하고 이후엔 유지한다
    // (재실행/리사이즈로 바뀌면 캐시된 노드 좌표와 어긋나 쏠림이 생기므로).
    if (!gravityCenter) gravityCenter = { x: width / 2, y: height / 2 }
    const centerX = gravityCenter.x
    const centerY = gravityCenter.y

    // 뷰 변환 상태. 이전 뷰(줌/패닝)가 있으면 복원하고, 없으면 중력 중심을 화면 중앙에 맞춘다.
    let scale = viewState ? viewState.scale : 1
    let offsetX = viewState ? viewState.offsetX : width / 2 - centerX
    let offsetY = viewState ? viewState.offsetY : height / 2 - centerY
    let tweening = false
    let targetScale = scale
    let targetOffsetX = offsetX
    let targetOffsetY = offsetY
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
      viewState = { scale, offsetX, offsetY }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, links, itemLinks, pivotLinks, pivots, items, onOpenItem, onSelectPivot])
}
