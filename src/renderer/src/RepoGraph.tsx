import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GitHubRepo, GitHubTreeEntry, ItemLink, LibraryItem, Link, Pivot } from './types'
import { useT } from './i18n'
import type { GNode, GraphPalette, LinkSource } from './graph/types'
import { useGraphSimulation } from './graph/useGraphSimulation'
import { buildOwnerCluster, buildRepoTree, parseRef } from './graph/github'
import { IconGitBranch, IconRefresh, IconExternal, IconArrowLeft } from './Icons'

// GitHub 계정의 모든 저장소를 그래프로 보여준다(읽기 전용).
// 전체 보기: repo 노드들. repo 클릭 → 그 repo 안으로 진입(파일 트리) + 상단 뒤로가기.
// repo = 루트, 폴더 = 하위 피벗, 파일 = 자식. (방사형 그래프 엔진 재활용)

interface Props {
  palette: GraphPalette
}

export default function RepoGraph({ palette }: Props) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [status, setStatus] = useState<'checking' | 'noToken' | 'ready'>('checking')
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [login, setLogin] = useState('') // 계정 로그인명(중앙 최상위 노드)
  const [expanded, setExpanded] = useState<Record<string, GitHubTreeEntry[]>>({})
  const [activeRepo, setActiveRepo] = useState<string | null>(null) // 진입한 repo(fullName)
  const [loadingRepo, setLoadingRepo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const repoByName = useMemo(() => {
    const m = new Map<string, GitHubRepo>()
    for (const r of repos) m.set(r.fullName, r)
    return m
  }, [repos])

  const loadRepos = useCallback(async () => {
    setError(null)
    const res = await window.api.githubRepos()
    if ('error' in res) {
      if (res.error === 'noToken') setStatus('noToken')
      else setError(res.error)
      return
    }
    setRepos(res.repos)
    setLogin(res.login)
    setStatus('ready')
  }, [])

  useEffect(() => {
    void (async () => {
      const has = await window.api.githubHasToken()
      if (has) await loadRepos()
      else setStatus('noToken')
    })()
  }, [loadRepos])

  const saveToken = async (): Promise<void> => {
    if (!tokenInput.trim()) return
    setBusy(true)
    setTokenError(null)
    const res = await window.api.githubSetToken(tokenInput.trim())
    setBusy(false)
    if (!res.ok) {
      setTokenError(res.error ?? 'invalidToken')
      return
    }
    setTokenInput('')
    await loadRepos()
  }

  // repo 트리 로드(이미 받았으면 생략)
  const loadTree = useCallback(
    async (fullName: string): Promise<void> => {
      const repo = repoByName.get(fullName)
      if (!repo || expanded[fullName]) return
      setLoadingRepo(fullName)
      const res = await window.api.githubTree(repo.owner, repo.name, repo.defaultBranch)
      setLoadingRepo(null)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setExpanded((prev) => ({ ...prev, [fullName]: res.tree }))
    },
    [repoByName, expanded]
  )

  // repo 안으로 진입(포커스) + 트리 로드
  const enterRepo = (fullName: string): void => {
    if (!repoByName.has(fullName)) return
    setError(null)
    setActiveRepo(fullName)
    void loadTree(fullName)
  }

  // ----- 그래프 데이터 합성: 포커스 중이면 그 repo 트리만, 아니면 repo 노드들 -----
  const graph = useMemo(() => {
    const pivots: Pivot[] = []
    const items: LibraryItem[] = []
    const links: Link[] = []
    const pivotLinks: ItemLink[] = []
    if (activeRepo) {
      const r = repoByName.get(activeRepo)
      if (r) {
        const built = buildRepoTree(r, expanded[r.fullName] ?? [])
        pivots.push(...built.pivots)
        items.push(...built.items)
        links.push(...built.links)
        pivotLinks.push(...built.pivotLinks)
      }
    } else {
      // 전체 보기: 계정 주인을 중앙 최상위 노드로, 모든 repo를 그 자식으로 매단다.
      const owner = buildOwnerCluster(login, repos)
      pivots.push(...owner.pivots)
      pivotLinks.push(...owner.pivotLinks)
    }
    return { pivots, items, links, pivotLinks }
  }, [repos, expanded, activeRepo, repoByName, login])

  const visible = useMemo(
    () => ({ pivots: graph.pivots, items: graph.items }),
    [graph.pivots, graph.items]
  )

  // 시뮬레이션 훅용 ref/세터(읽기 전용이라 대부분 비활성)
  const spawnRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const nodesRef = useRef<GNode[]>([])
  const focusRef = useRef<((id: string) => void) | null>(null)
  const linkingRef = useRef<LinkSource | null>(null)
  const wakeRef = useRef<(() => void) | null>(null)
  const nodeClickRef = useRef<(n: { refId: string; kind: 'pivot' | 'item'; label: string }) => void>(
    () => {}
  )

  nodeClickRef.current = (n) => {
    const ref = parseRef(n.refId)
    if (ref.kind === 'owner') {
      // 중앙 주인 노드 → GitHub 프로필
      if (login) void window.api.openUrl(`https://github.com/${login}`)
    } else if (ref.kind === 'repo') {
      const r = repoByName.get(ref.fullName)
      if (!r) return
      if (!activeRepo) enterRepo(ref.fullName) // 전체 보기 → repo 진입
      else void window.api.openUrl(r.htmlUrl) // 포커스 중 repo 노드 → GitHub
    } else if (ref.kind === 'dir') {
      const r = repoByName.get(ref.fullName)
      if (r) void window.api.openUrl(`${r.htmlUrl}/tree/${r.defaultBranch}/${ref.path}`)
    } else if (ref.kind === 'file') {
      const r = repoByName.get(ref.fullName)
      if (r) void window.api.openUrl(`${r.htmlUrl}/blob/${r.defaultBranch}/${ref.path}`)
    }
  }

  const noop = (): void => {}
  const paletteRef = useRef(palette)
  paletteRef.current = palette

  useGraphSimulation({
    canvasRef,
    visible,
    links: graph.links,
    itemLinks: [],
    pivotLinks: graph.pivotLinks,
    // 전체 보기와 각 repo 포커스를 별도 캐시로 → 진입 시 화면 중앙에 깔끔히 배치/복원
    cacheKey: activeRepo ? `gh:${activeRepo}` : 'gh-global',
    rootMinSubtree: 0, // 미펼침(빈) repo도 항상 루트로
    pivots: graph.pivots,
    items: graph.items,
    paletteRef,
    palette,
    spawnRef,
    nodesRef,
    focusRef,
    nodeClickRef,
    linkingRef,
    wakeRef,
    setSearch: noop,
    setQuery: noop,
    setMenu: noop,
    setMenuMode: noop,
    setRenameText: noop,
    closeMenu: noop,
    onOpenItem: noop,
    onSelectPivot: noop
  })

  // ----- 토큰 입력 화면 -----
  if (status === 'noToken') {
    return (
      <div className="git-empty">
        <IconGitBranch size={34} />
        <p>{t('gh.connectTitle')}</p>
        <small>{t('gh.connectHint')}</small>
        <input
          className="gh-token-input"
          type="password"
          placeholder="ghp_..."
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveToken()}
        />
        {tokenError && <small className="gh-error">{t(`gh.${tokenError}`)}</small>}
        <div className="gh-token-actions">
          <button className="btn-accent" disabled={busy} onClick={saveToken}>
            {busy ? t('gh.connecting') : t('gh.connect')}
          </button>
          <button
            className="git-open-btn"
            onClick={() =>
              window.api.openUrl(
                'https://github.com/settings/tokens/new?scopes=repo&description=My%20DB%20System'
              )
            }
          >
            <IconExternal size={14} />
            <span>{t('gh.createToken')}</span>
          </button>
        </div>
      </div>
    )
  }

  if (status === 'checking') {
    return <div className="git-empty">{t('gh.loading')}</div>
  }

  const active = activeRepo ? repoByName.get(activeRepo) : null

  // 메인 그래프와 동일한 플로팅 배너(.pivot-banner)로 통일.
  return (
    <div className="git-graph-wrap">
      <canvas ref={canvasRef} />

      {active ? (
        <div className="pivot-banner">
          <button className="back-btn" onClick={() => setActiveRepo(null)}>
            <IconArrowLeft size={13} />
            <span>{t('graph.all')}</span>
          </button>
          <span className="pivot-name">
            <span className="dot" style={{ background: palette.pivot }} />
            {active.name}
          </span>
          {loadingRepo === activeRepo ? (
            <span className="pivot-hint">{t('gh.expanding')}</span>
          ) : (
            active.private && <span className="pivot-hint">{t('gh.private')}</span>
          )}
          <button className="back-btn" title="GitHub" onClick={() => window.api.openUrl(active.htmlUrl)}>
            <IconExternal size={13} />
          </button>
        </div>
      ) : (
        <div className="pivot-banner">
          <span className="pivot-name">
            <span className="dot" style={{ background: palette.accent }} />
            {t('gh.repos')}
          </span>
          <span className="pivot-hint">{t('gh.count', { n: repos.length })}</span>
          <button className="back-btn" title={t('git.refresh')} onClick={loadRepos}>
            <IconRefresh size={13} />
          </button>
        </div>
      )}

      {error && <div className="git-loading">{t(`gh.${error}`)}</div>}
      <div className="graph-legend">{active ? t('gh.legendRepo') : t('gh.legend')}</div>
    </div>
  )
}
