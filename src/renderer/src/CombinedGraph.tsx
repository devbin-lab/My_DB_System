import { useEffect, useMemo, useRef, useState } from 'react'
import type { GitHubRepo, GitHubTreeEntry, ItemLink, LibraryItem, Link, Pivot } from './types'
import { useT } from './i18n'
import type { GNode, GraphPalette, LinkSource } from './graph/types'
import { useGraphSimulation } from './graph/useGraphSimulation'
import { buildOwnerCluster, buildRepoTree, parseRef } from './graph/github'
import { IconArrowLeft } from './Icons'

// 통합 보기: 로컬 피벗 그래프 + GitHub(owner→repo) 군집을 한 캔버스에.
// 포커스(드릴다운) 지원: 로컬 피벗 클릭=그 하위 트리 / repo 클릭=그 repo 파일 트리. ←로 복귀.

interface Props {
  items: LibraryItem[]
  pivots: Pivot[]
  links: Link[]
  itemLinks: ItemLink[]
  pivotLinks: ItemLink[]
  palette: GraphPalette
  onOpenItem: (id: string) => void
}

type Focus = { kind: 'pivot'; id: string } | { kind: 'repo'; id: string } | null

export default function CombinedGraph(props: Props) {
  const { items, pivots, links, itemLinks, pivotLinks, palette, onOpenItem } = props
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [login, setLogin] = useState('')
  const [expanded, setExpanded] = useState<Record<string, GitHubTreeEntry[]>>({})
  const [focus, setFocus] = useState<Focus>(null)
  const [loadingRepo, setLoadingRepo] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const has = await window.api.githubHasToken()
      if (!has) return
      const res = await window.api.githubRepos()
      if ('error' in res) return
      setRepos(res.repos)
      setLogin(res.login)
    })()
  }, [])

  const repoByName = useMemo(() => {
    const m = new Map<string, GitHubRepo>()
    for (const r of repos) m.set(r.fullName, r)
    return m
  }, [repos])

  const loadTree = async (fullName: string): Promise<void> => {
    const repo = repoByName.get(fullName)
    if (!repo || expanded[fullName]) return
    setLoadingRepo(fullName)
    const res = await window.api.githubTree(repo.owner, repo.name, repo.defaultBranch)
    setLoadingRepo(null)
    if ('error' in res) return
    setExpanded((prev) => ({ ...prev, [fullName]: res.tree }))
  }

  // 포커스에 따라 보여줄 그래프 데이터 구성
  const graph = useMemo(() => {
    if (focus?.kind === 'pivot') {
      // 로컬 피벗 하위 트리(부모→자식 방향 BFS) + 거기 연결된 파일
      const ids = new Set<string>([focus.id])
      const queue = [focus.id]
      while (queue.length) {
        const cur = queue.shift() as string
        for (const pl of pivotLinks)
          if (pl.aId === cur && !ids.has(pl.bId)) {
            ids.add(pl.bId)
            queue.push(pl.bId)
          }
      }
      const memberItems = new Set(links.filter((l) => ids.has(l.pivotId)).map((l) => l.itemId))
      return {
        pivots: pivots.filter((p) => ids.has(p.id)),
        items: items.filter((i) => memberItems.has(i.id)),
        links,
        itemLinks,
        pivotLinks
      }
    }
    if (focus?.kind === 'repo') {
      const r = repoByName.get(focus.id)
      if (r) {
        const built = buildRepoTree(r, expanded[focus.id] ?? [])
        return { ...built, itemLinks: [] as ItemLink[] }
      }
    }
    // 개요: 로컬 전체 + GitHub owner→repos(접힘)
    const gPivots: Pivot[] = [...pivots]
    const gPivotLinks: ItemLink[] = [...pivotLinks]
    if (repos.length > 0) {
      const owner = buildOwnerCluster(login, repos)
      gPivots.push(...owner.pivots)
      gPivotLinks.push(...owner.pivotLinks)
    }
    return { pivots: gPivots, items, links, itemLinks, pivotLinks: gPivotLinks }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, pivots, items, links, itemLinks, pivotLinks, repos, login, expanded, repoByName])

  const visible = useMemo(
    () => ({ pivots: graph.pivots, items: graph.items }),
    [graph.pivots, graph.items]
  )

  const spawnRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const nodesRef = useRef<GNode[]>([])
  const focusRef = useRef<((id: string) => void) | null>(null)
  const linkingRef = useRef<LinkSource | null>(null)
  const nodeClickRef = useRef<(n: { refId: string; kind: 'pivot' | 'item'; label: string }) => void>(
    () => {}
  )
  nodeClickRef.current = (n) => {
    const refId = n.refId
    if (!focus) {
      if (refId.startsWith('owner:')) {
        if (login) void window.api.openUrl(`https://github.com/${login}`)
      } else if (refId.startsWith('repo:')) {
        const fullName = refId.slice(5)
        setFocus({ kind: 'repo', id: fullName })
        void loadTree(fullName)
      } else if (n.kind === 'item') {
        onOpenItem(refId) // 로컬 파일 → 미리보기
      } else {
        setFocus({ kind: 'pivot', id: refId }) // 로컬 피벗 → 하위 트리로 진입
      }
    } else if (focus.kind === 'pivot') {
      if (n.kind === 'item') onOpenItem(refId)
      else setFocus({ kind: 'pivot', id: refId }) // 더 깊이 드릴다운
    } else {
      // repo 포커스: 폴더/파일은 GitHub로, repo 노드는 repo 페이지로
      const ref = parseRef(refId)
      if (ref.kind === 'dir') {
        const r = repoByName.get(ref.fullName)
        if (r) void window.api.openUrl(`${r.htmlUrl}/tree/${r.defaultBranch}/${ref.path}`)
      } else if (ref.kind === 'file') {
        const r = repoByName.get(ref.fullName)
        if (r) void window.api.openUrl(`${r.htmlUrl}/blob/${r.defaultBranch}/${ref.path}`)
      } else if (ref.kind === 'repo') {
        const r = repoByName.get(ref.fullName)
        if (r) void window.api.openUrl(r.htmlUrl)
      }
    }
  }

  const noop = (): void => {}
  const paletteRef = useRef(palette)
  paletteRef.current = palette

  useGraphSimulation({
    canvasRef,
    visible,
    links: graph.links,
    itemLinks: graph.itemLinks,
    pivotLinks: graph.pivotLinks,
    cacheKey: focus ? `combined:${focus.kind}:${focus.id}` : 'combined',
    rootMinSubtree: focus?.kind === 'repo' ? 0 : 1,
    pivots: graph.pivots,
    items: graph.items,
    paletteRef,
    spawnRef,
    nodesRef,
    focusRef,
    nodeClickRef,
    linkingRef,
    setSearch: noop,
    setQuery: noop,
    setMenu: noop,
    setMenuMode: noop,
    setRenameText: noop,
    closeMenu: noop,
    onOpenItem,
    onSelectPivot: noop
  })

  // 포커스 배너 라벨
  const focusName =
    focus?.kind === 'pivot'
      ? (pivots.find((p) => p.id === focus.id)?.name ?? '')
      : focus?.kind === 'repo'
        ? (repoByName.get(focus.id)?.name ?? focus.id)
        : ''

  return (
    <div className="git-graph-wrap">
      <canvas ref={canvasRef} />
      {focus && (
        <div className="pivot-banner">
          <button className="back-btn" onClick={() => setFocus(null)}>
            <IconArrowLeft size={13} />
            <span>{t('graph.all')}</span>
          </button>
          <span className="pivot-name">
            <span className="dot" style={{ background: palette.pivot }} />
            {focusName}
          </span>
          {focus.kind === 'repo' && loadingRepo === focus.id && (
            <span className="pivot-hint">{t('gh.expanding')}</span>
          )}
        </div>
      )}
      <div className="graph-legend">
        {focus?.kind === 'repo'
          ? t('gh.legendRepo')
          : focus?.kind === 'pivot'
            ? t('combine.legendPivot')
            : t('combine.legend')}
      </div>
    </div>
  )
}
