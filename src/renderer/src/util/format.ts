import type { LibraryItem } from '../types'

// 확장자 배지 라벨(대문자, 최대 4자). 라이브러리 카드/휴지통 공용.
export function extLabel(item: LibraryItem): string {
  const e = item.ext.replace('.', '').toUpperCase()
  return e.length > 4 ? e.slice(0, 4) : e || 'FILE'
}

// 바이트 → 사람이 읽는 크기 문자열
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
