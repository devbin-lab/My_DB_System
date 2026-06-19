import type { ItemType } from './types'

// 파일 타입별 색(라이브러리 배지 / 그래프 노드 등 공용)
export const TYPE_COLORS: Record<ItemType, string> = {
  md: '#7c6af2',
  pdf: '#f2786a',
  csv: '#5fd068',
  code: '#5ab8f5',
  image: '#f5c95a',
  ppt: '#e8703a',
  xls: '#2aa775',
  other: '#8a8fa8'
}
