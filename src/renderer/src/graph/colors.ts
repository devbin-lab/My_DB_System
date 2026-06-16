import type { ItemType } from '../types'
import type { GNode, GraphPalette } from './types'

// 호버/포커스 링: 타입별 대표색. 대표색이 없으면 흰색(테마 강조 라벨색).
const TYPE_RING: Partial<Record<ItemType, string>> = {
  md: '#7c6af2',
  pdf: '#f2786a',
  csv: '#5fd068',
  code: '#5ab8f5',
  image: '#f5c95a'
}

// 대표색이 없는 타입과 피벗은 테마의 강조 라벨 색(다크=흰색, 라이트=검정)을 쓴다
export function ringColor(n: GNode, palette: GraphPalette): string {
  if (n.kind === 'item' && n.type) return TYPE_RING[n.type] ?? palette.labelHover
  return palette.labelHover
}
