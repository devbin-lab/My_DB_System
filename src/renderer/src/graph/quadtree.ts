import type { GNode } from './types'

// ---------- Barnes-Hut 쿼드트리 (반발력 O(n²) → O(n log n)) ----------
// 매 프레임 노드 위치로 쿼드트리를 만들고, 충분히 멀리 떨어진 노드 무리는
// 질량 중심 하나로 근사해 계산량을 크게 줄인다.
export interface QuadCell {
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

export const BH_THETA = 0.8 // 근사 강도(작을수록 정확하지만 느림)
const BH_MIN_CELL = 1 // 좌표가 거의 같은 노드에서 무한 분할 방지

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

export function buildQuadTree(nodes: GNode[]): QuadCell | null {
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
export function applyRepulsion(
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
