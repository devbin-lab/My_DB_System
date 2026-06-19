// GitHub 그래프 뷰(RepoGraph / CombinedGraph) 공용 헬퍼.
// repo 트리/소유자 군집을 그래프 데이터(피벗/파일/링크)로 합성하고, 노드 id를 파싱한다.
// 순수 함수 + 타입만 의존(순환 의존 없음). 주의: src/main/github.ts(메인 프로세스)와는 별개 파일.
import type { GitHubRepo, GitHubTreeEntry, ItemLink, ItemType, LibraryItem, Link, Pivot } from '../types'

export const basename = (p: string): string => p.split('/').pop() || p
export const dirname = (p: string): string => p.split('/').slice(0, -1).join('/')

// 확장자 → 노드 색 타입
export function extType(name: string): ItemType {
  const e = name.toLowerCase().split('.').pop() ?? ''
  if (e === 'md' || e === 'markdown') return 'md'
  if (e === 'pdf') return 'pdf'
  if (e === 'csv' || e === 'tsv') return 'csv'
  if (e === 'ppt' || e === 'pptx') return 'ppt'
  if (e === 'xls' || e === 'xlsx' || e === 'xlsm') return 'xls'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(e)) return 'image'
  if (
    ['js','ts','tsx','jsx','json','py','c','cpp','h','hpp','java','go','rs','rb','php','cs','html','css','scss','sh','bat','ps1','yml','yaml','toml','sql','kt','lua','xml','vue','swift'].includes(e)
  )
    return 'code'
  return 'other'
}

export type ParsedRef =
  | { kind: 'owner'; login: string }
  | { kind: 'repo'; fullName: string }
  | { kind: 'dir'; fullName: string; path: string }
  | { kind: 'file'; fullName: string; path: string }
  | { kind: 'pivot' } // 로컬 DB 피벗(접두사 없는 uuid)

// 노드 id 접두사로 종류/대상을 파싱한다.
// 형식: owner:<login> / repo:<fullName> / dir:<fullName>:<path> / file:<fullName>:<path>
// (fullName=owner/repo 에는 콜론이 없으므로 접두사 제거 후 첫 콜론에서 path를 가른다)
export function parseRef(refId: string): ParsedRef {
  if (refId.startsWith('owner:')) return { kind: 'owner', login: refId.slice(6) }
  if (refId.startsWith('repo:')) return { kind: 'repo', fullName: refId.slice(5) }
  for (const kind of ['dir', 'file'] as const) {
    const prefix = kind + ':'
    if (refId.startsWith(prefix)) {
      const rest = refId.slice(prefix.length)
      const ci = rest.indexOf(':')
      return ci === -1
        ? { kind, fullName: rest, path: '' }
        : { kind, fullName: rest.slice(0, ci), path: rest.slice(ci + 1) }
    }
  }
  return { kind: 'pivot' }
}

export interface RepoGraphData {
  pivots: Pivot[]
  items: LibraryItem[]
  links: Link[]
  pivotLinks: ItemLink[]
}

// 한 repo의 파일 트리 → 그래프 데이터(repo 루트 + 폴더 피벗 + 파일 자식)
export function buildRepoTree(r: GitHubRepo, tree: GitHubTreeEntry[]): RepoGraphData {
  const repoId = `repo:${r.fullName}`
  const pivots: Pivot[] = [{ id: repoId, name: r.name, createdAt: '' }]
  const items: LibraryItem[] = []
  const links: Link[] = []
  const pivotLinks: ItemLink[] = []
  for (const e of tree) {
    const parentPath = dirname(e.path)
    const parentId = parentPath === '' ? repoId : `dir:${r.fullName}:${parentPath}`
    if (e.type === 'tree') {
      pivots.push({ id: `dir:${r.fullName}:${e.path}`, name: basename(e.path), createdAt: '' })
      pivotLinks.push({ aId: parentId, bId: `dir:${r.fullName}:${e.path}` })
    } else {
      const name = basename(e.path)
      items.push({
        id: `file:${r.fullName}:${e.path}`,
        name,
        ext: '.' + (name.split('.').pop() ?? ''),
        type: extType(name),
        tags: [],
        size: e.size ?? 0,
        storedPath: '',
        originalPath: '',
        createdAt: ''
      })
      links.push({ pivotId: parentId, itemId: `file:${r.fullName}:${e.path}` })
    }
  }
  return { pivots, items, links, pivotLinks }
}

// 계정 소유자(중앙 노드) → 모든 repo를 자식으로 매단 군집
export function buildOwnerCluster(
  login: string,
  repos: GitHubRepo[]
): { pivots: Pivot[]; pivotLinks: ItemLink[] } {
  const ownerId = `owner:${login}`
  const pivots: Pivot[] = [{ id: ownerId, name: login || 'GitHub', createdAt: '' }]
  const pivotLinks: ItemLink[] = []
  for (const r of repos) {
    pivots.push({ id: `repo:${r.fullName}`, name: r.name, createdAt: '' })
    pivotLinks.push({ aId: ownerId, bId: `repo:${r.fullName}` })
  }
  return { pivots, pivotLinks }
}
