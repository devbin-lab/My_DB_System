import type { ItemType } from '../types'

// 그래프 노드: 피벗(허브) 또는 파일.
export interface GNode {
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

// 그래프 엣지: 노드 인덱스 쌍.
export interface GEdge {
  a: number
  b: number
  dir?: boolean // 방향 있는 엣지(피벗 부모→자식). a=부모, b=자식
}

// 연결/연결취소 후보 (피벗 또는 파일)
export interface Target {
  id: string
  name: string
  kind: 'pivot' | 'item'
}

// 테마별 캔버스 색은 App에서 palette로 내려준다
export interface GraphPalette {
  file: string
  pivot: string
  edge: string
  label: string
  labelHover: string
  accent: string // 포인트색(부모→자식 방향 점 등 강조용)
}
