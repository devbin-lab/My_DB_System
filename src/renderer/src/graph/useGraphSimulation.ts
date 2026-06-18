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

// 직전 빌드의 엣지 구성(연결 변화 감지용). 노드 수가 같아도 연결/해제로 엣지가 달라지면
// 레이아웃을 살짝 재가열해 새 구조에 맞게 다시 펼친다(예: 새 피벗에 파일을 옮겼을 때).
let prevEdgeSig: string | null = null

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

    // 부모→자식 피벗 관계 + 직계 파일 수(전체 그래프 기준, 집중 보기와 무관하게 일정).
    const childAll = new Map<string, string[]>()
    for (const pl of pivotLinks) {
      const arr = childAll.get(pl.aId) ?? []
      arr.push(pl.bId)
      childAll.set(pl.aId, arr)
    }
    const fileCountAll = new Map<string, number>()
    for (const l of links) fileCountAll.set(l.pivotId, (fileCountAll.get(l.pivotId) ?? 0) + 1)

    // 서브트리 전체 크기 = 직계 파일 + 모든 하위 피벗·파일(재귀). 메모이즈 + 사이클 방지.
    // → 직계뿐 아니라 중간·최상위 부모도 그 아래 전체에 비례해 커진다.
    const subtreeCount = new Map<string, number>()
    const visitingSub = new Set<string>()
    const subtreeOf = (id: string): number => {
      const c = subtreeCount.get(id)
      if (c !== undefined) return c
      if (visitingSub.has(id)) return 0
      visitingSub.add(id)
      let n = fileCountAll.get(id) ?? 0
      for (const k of childAll.get(id) ?? []) n += 1 + subtreeOf(k)
      visitingSub.delete(id)
      subtreeCount.set(id, n)
      return n
    }
    // 계층 높이 = 이 피벗 아래로 가장 깊은 자식 피벗까지의 단계 수(잎 피벗=0).
    // 위로 올라갈수록(높이가 클수록) 반드시 커지도록 크기에 직접 반영한다.
    const heightCache = new Map<string, number>()
    const visitingH = new Set<string>()
    const heightOf = (id: string): number => {
      const c = heightCache.get(id)
      if (c !== undefined) return c
      if (visitingH.has(id)) return 0
      visitingH.add(id)
      let h = 0
      for (const k of childAll.get(id) ?? []) h = Math.max(h, 1 + heightOf(k))
      visitingH.delete(id)
      heightCache.set(id, h)
      return h
    }
    // 크기 = 기본 + 계층 높이(레벨당 +5) + 서브트리 양(같은 레벨 내 차이). 상한 44.
    const pivotRadius = (id: string): number =>
      Math.min(44, 10 + heightOf(id) * 5 + Math.sqrt(subtreeOf(id)) * 1.4)

    for (const p of visible.pivots) {
      add({ id: `pivot:${p.id}`, refId: p.id, kind: 'pivot', label: p.name, r: pivotRadius(p.id) })
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

    // ---------- 영역(섹터) 할당 ----------
    // 트리를 방사형 부채꼴로 나눠 각 서브트리가 자기 각도 구역만 차지하게 한다.
    // 깊이는 반지름(중심에서 멀어짐), 형제는 각도로 분리 → 부모-자식 선이 형제 영역을
    // 가로지르지 않아 엉킴이 크게 준다. 피벗에만 목표 위치를 주고(파일은 스프링으로 따라붙음),
    // 매 프레임 약한 인력으로 끌어당겨 경직되지 않게 한다.
    const RING = 145 // 깊이 1단계당 반지름 증가(↓ 할수록 트리가 촘촘)
    let maxDepth = 0 // 가장 바깥 군집의 깊이(고립 노드를 그 바깥 둘레에 두기 위함)
    const sectorTarget = new Map<string, { x: number; y: number }>()
    // 각도 분배용 넓이(최소 1 보장)
    const spanOf = (id: string): number => Math.max(1, subtreeOf(id))
    const assignSector = (id: string, a0: number, a1: number, depth: number): void => {
      if (depth > maxDepth) maxDepth = depth
      const mid = (a0 + a1) / 2
      sectorTarget.set(`pivot:${id}`, {
        x: centerX + Math.cos(mid) * depth * RING,
        y: centerY + Math.sin(mid) * depth * RING
      })
      const kids = (childAll.get(id) ?? []).filter((k) => visiblePivotIds.has(k)).sort()
      if (kids.length === 0) return
      const totalSpan = kids.reduce((s, k) => s + spanOf(k), 0) || 1
      const width = a1 - a0
      let cur = a0
      for (const k of kids) {
        const w = (spanOf(k) / totalSpan) * width
        assignSector(k, cur, cur + w, depth + 1)
        cur += w
      }
    }
    // 루트 = 보이는 부모가 없는 피벗(집중 보기에선 활성 피벗이 곧 루트)
    const visParent = new Set<string>()
    for (const pl of pivotLinks) {
      if (visiblePivotIds.has(pl.aId) && visiblePivotIds.has(pl.bId)) visParent.add(pl.bId)
    }
    // 내용(파일·자식)이 있는 루트만 구조의 뼈대로 삼는다. 빈 독립 피벗은 고립 노드로 취급
    // (아래 바깥 둘레로) → 빈 새 피벗이 루트로 끼어들어 구조를 흩뜨리지 않는다.
    const roots = visible.pivots
      .map((p) => p.id)
      .filter((id) => !visParent.has(id) && subtreeOf(id) > 0)
      .sort()
    const rootTotalSpan = roots.reduce((s, id) => s + spanOf(id), 0) || 1
    const rootDepth = roots.length > 1 ? 1 : 0 // 루트 여럿이면 중심을 비우고 1링부터
    let ra = -Math.PI / 2 // 12시 방향부터 배치
    for (const id of roots) {
      const w = (spanOf(id) / rootTotalSpan) * Math.PI * 2
      assignSector(id, ra, ra + w, rootDepth)
      ra += w
    }

    // ---------- 파일 방사형 슬롯 ----------
    // 각 피벗 주위에 파일을 균등한 각도로 배치하고, 반지름은 파일 수에 맞춰 키운다
    // (= 가장 바깥 자식까지의 원형 영역). 외부 반발에 밀려 한쪽으로 쏠리지 않고
    // 사방으로 고르게 퍼지는 방사형 버스트가 된다.
    const filesByPivot = new Map<string, string[]>()
    for (const l of links) {
      if (!visiblePivotIds.has(l.pivotId) || !visibleItemIds.has(l.itemId)) continue
      const arr = filesByPivot.get(l.pivotId) ?? []
      arr.push(l.itemId)
      filesByPivot.set(l.pivotId, arr)
    }
    const fileSlot = new Map<string, { pivotIdx: number; angle: number; radius: number }>()
    for (const [pivotId, fileIds] of filesByPivot) {
      const pIdx = idx.get(`pivot:${pivotId}`)
      if (pIdx === undefined) continue
      fileIds.sort()
      const count = fileIds.length
      // 둘레에 파일당 ~22px 확보되도록 반지름 결정(최소 피벗 반지름 + 50)
      const radius = Math.max(nodes[pIdx].r + 50, (count * 22) / (2 * Math.PI))
      for (let i = 0; i < count; i++) {
        const fIdx = idx.get(`item:${fileIds[i]}`)
        if (fIdx === undefined) continue
        fileSlot.set(`item:${fileIds[i]}`, {
          pivotIdx: pIdx,
          angle: (2 * Math.PI * i) / count,
          radius
        })
      }
    }

    // ---------- 고립 노드 바깥 둘레 배치 ----------
    // 섹터(피벗)도 슬롯(파일)도 없는 노드 = 어디에도 연결 안 된 고립 노드(고립 파일·빈 피벗).
    // 중심으로 끌리면 구조 한가운데로 파고들므로, 구조 바깥 큰 둘레에 고르게 둔다.
    const orphanTarget = new Map<string, { x: number; y: number }>()
    const orphanIds = nodes
      .filter((n) => !sectorTarget.has(n.id) && !fileSlot.has(n.id))
      .map((n) => n.id)
      .sort()
    if (orphanIds.length > 0) {
      const orphanRadius = maxDepth * RING + 240 // 가장 바깥 군집보다 더 바깥
      orphanIds.forEach((id, i) => {
        const ang = (2 * Math.PI * i) / orphanIds.length
        orphanTarget.set(id, {
          x: centerX + Math.cos(ang) * orphanRadius,
          y: centerY + Math.sin(ang) * orphanRadius
        })
      })
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

    const REPULSION = 2500 // 노드 간 반발력(↑ 할수록 넓게 퍼짐)
    const SPRING = 0.04
    const SPRING_PP = 0.012 // 피벗↔피벗 스프링은 약하게 — 위치는 섹터 인력이 주도
    const SPRING_LEN_PP = 240 // 피벗 ↔ 피벗(부모-자식) 기본 + 양쪽 반지름
    const SPRING_LEN_FF = 95 // 파일 ↔ 파일
    const GRAVITY = 0.009 // 섹터·슬롯 목표가 없는 노드(고립 파일 등)용 중심 인력
    const SECTOR_PULL = 0.05 // 피벗을 자기 섹터 목표 위치로 끌어당기는 힘
    const FILE_PULL = 0.06 // 파일을 피벗 주위 방사형 슬롯으로 끌어당기는 힘
    const DAMPING = 0.85
    const MAX_V = 40 // 프레임당 최대 이동량(요동 방지 안전장치)

    // 연결 구조가 바뀌었는지(연결/해제) 감지. 노드 수는 같아도 엣지가 달라지면 재배치가 필요하다.
    const edgeSig = edges
      .map((e) => `${nodes[e.a].id}>${nodes[e.b].id}`)
      .sort()
      .join('|')
    const structuralChange = !isFirstBuild && prevEdgeSig !== null && edgeSig !== prevEdgeSig
    prevEdgeSig = edgeSig

    // 재가열(reheat) 세기:
    // - 첫 빌드: 1 (전체 레이아웃)
    // - 새 노드가 생김: 0.3 (부분적으로 자리 잡기)
    // - 연결/해제로 구조가 바뀜: 0.25 (새 구조에 맞게 다시 펼침)
    // - 위치만 복원되는 변경(이름변경·태그 등): 0.05 (거의 안 움직임)
    let alpha = isFirstBuild ? 1 : newIndices.length > 0 ? 0.3 : structuralChange ? 0.25 : 0.05

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
        // 피벗-파일 연결은 스프링 대신 방사형 슬롯 인력이 위치를 잡는다(아래) → 여기선 건너뜀
        if (!e.dir && (a.kind === 'pivot' || b.kind === 'pivot')) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const restLen = e.dir ? SPRING_LEN_PP + a.r + b.r : SPRING_LEN_FF
        const k = e.dir ? SPRING_PP : SPRING // 부모-자식은 약하게(섹터가 위치 주도)
        const f = (d - restLen) * k * alpha
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
        // 피벗 → 섹터 목표 / 파일 → 자기 피벗 주위 방사형 슬롯 / 그 외(고립) → 중심.
        const tgt = sectorTarget.get(n.id)
        const slot = tgt ? undefined : fileSlot.get(n.id)
        if (tgt) {
          n.vx += (tgt.x - n.x) * SECTOR_PULL * alpha
          n.vy += (tgt.y - n.y) * SECTOR_PULL * alpha
        } else if (slot) {
          const p = nodes[slot.pivotIdx]
          const tx = p.x + Math.cos(slot.angle) * slot.radius
          const ty = p.y + Math.sin(slot.angle) * slot.radius
          n.vx += (tx - n.x) * FILE_PULL * alpha
          n.vy += (ty - n.y) * FILE_PULL * alpha
        } else {
          // 고립 노드는 바깥 둘레로(중심으로 파고들지 않게). 목표가 없으면 약한 중심 인력.
          const ot = orphanTarget.get(n.id)
          if (ot) {
            n.vx += (ot.x - n.x) * GRAVITY * 2 * alpha
            n.vy += (ot.y - n.y) * GRAVITY * 2 * alpha
          } else {
            n.vx += (centerX - n.x) * GRAVITY * alpha
            n.vy += (centerY - n.y) * GRAVITY * alpha
          }
        }
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
