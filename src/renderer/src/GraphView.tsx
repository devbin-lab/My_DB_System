import { useMemo, useRef } from 'react'
import type { ItemLink, LibraryItem, Link, Pivot } from './types'
import { useT } from './i18n'
import type { GraphPalette } from './graph/types'
import { PivotBanner } from './graph/overlays'
import { useGraphSimulation } from './graph/useGraphSimulation'
import { useGraphInteractions } from './graph/useGraphInteractions'

// 피벗 중심 그래프.
// 노드: 피벗(허브) + 파일. 엣지: 피벗-파일 연결(links).
// - 전역 보기: 모든 피벗 + 모든 파일.
// - 피벗 집중 보기(activePivotId): 그 피벗과 거기에 연결된 파일만.

// 테마별 캔버스 기본 색(App에서 palette로 덮어쓴다)
const DEFAULT_PALETTE: GraphPalette = {
  file: '#9aa1b5',
  pivot: '#cdd3e0',
  edge: 'rgba(154, 161, 181, 0.55)',
  label: 'rgba(232, 234, 242, 0.8)',
  labelHover: '#ffffff',
  accent: '#2dd4bf'
}

interface Props {
  items: LibraryItem[]
  pivots: Pivot[]
  links: Link[]
  itemLinks: ItemLink[]
  pivotLinks: ItemLink[]
  activePivotId: string | null
  maxResults?: number
  palette?: GraphPalette
  onOpenItem: (id: string) => void
  onSelectPivot: (id: string | null) => void
  onCreatePivot: () => Promise<Pivot>
  onRenamePivot: (id: string, name: string) => void
  onRenameItem: (id: string, name: string) => void
  onDeletePivot: (id: string) => void
  onDeletePivotCascade: (id: string) => void
  onDeleteItem: (id: string) => void
  onConnect: (pivotId: string, itemId: string) => void
  onDisconnect: (pivotId: string, itemId: string) => void
  onConnectItems: (a: string, b: string) => void
  onDisconnectItems: (a: string, b: string) => void
  onConnectPivots: (a: string, b: string) => void
  onDisconnectPivots: (a: string, b: string) => void
}

export default function GraphView(props: Props) {
  const {
    items,
    pivots,
    links,
    itemLinks,
    pivotLinks,
    activePivotId,
    maxResults = 12,
    palette = DEFAULT_PALETTE,
    onOpenItem,
    onSelectPivot,
    onCreatePivot,
    onRenamePivot,
    onRenameItem,
    onDeletePivot,
    onDeletePivotCascade,
    onDeleteItem,
    onConnect,
    onDisconnect,
    onConnectItems,
    onDisconnectItems,
    onConnectPivots,
    onDisconnectPivots
  } = props

  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 팔레트는 ref로 시뮬레이션에 전달 → 테마 변경 시 리빌딩 없이 즉시 색 반영
  const paletteRef = useRef(palette)
  paletteRef.current = palette

  // 어떤 노드를 그릴지 결정.
  // 집중 보기면: 활성 피벗 + pivotLinks(부모→자식)를 따라 내려간 모든 하위 피벗(자식·손자…)
  //   + 그 피벗들에 연결된 파일.
  const visible = useMemo(() => {
    if (activePivotId) {
      const pivotIds = new Set<string>([activePivotId])
      const queue = [activePivotId]
      while (queue.length > 0) {
        const cur = queue.shift() as string
        for (const pl of pivotLinks) {
          if (pl.aId === cur && !pivotIds.has(pl.bId)) {
            pivotIds.add(pl.bId)
            queue.push(pl.bId)
          }
        }
      }
      const memberIds = new Set(links.filter((l) => pivotIds.has(l.pivotId)).map((l) => l.itemId))
      return {
        pivots: pivots.filter((p) => pivotIds.has(p.id)),
        items: items.filter((i) => memberIds.has(i.id))
      }
    }
    return { pivots, items }
  }, [activePivotId, pivots, items, links, pivotLinks])

  // 우클릭 상호작용(검색/메뉴/연결)은 공용 훅에서 처리. 연결 모드가 아닐 때의 좌클릭은
  // 파일=열기 / 피벗=집중 보기 진입.
  const interactions = useGraphInteractions({
    canvasRef,
    palette,
    maxResults,
    searchPivots: visible.pivots,
    searchItems: visible.items,
    pivots,
    items,
    links,
    itemLinks,
    pivotLinks,
    onNodeActivate: (n) => {
      if (n.kind === 'item') onOpenItem(n.refId)
      else onSelectPivot(n.refId)
    },
    onCreatePivot,
    onRenamePivot,
    onRenameItem,
    onDeletePivot,
    onDeletePivotCascade,
    onDeleteItem,
    onConnect,
    onDisconnect,
    onConnectItems,
    onDisconnectItems,
    onConnectPivots,
    onDisconnectPivots
  })

  // 물리 시뮬레이션 + 캔버스 렌더링 + 마우스 상호작용 (graph/useGraphSimulation.ts)
  useGraphSimulation({
    canvasRef,
    visible,
    links,
    itemLinks,
    pivotLinks,
    cacheKey: 'main',
    pivots,
    items,
    paletteRef,
    spawnRef: interactions.spawnRef,
    nodesRef: interactions.nodesRef,
    focusRef: interactions.focusRef,
    nodeClickRef: interactions.nodeClickRef,
    linkingRef: interactions.linkingRef,
    setSearch: interactions.setSearch,
    setQuery: interactions.setQuery,
    setMenu: interactions.setMenu,
    setMenuMode: interactions.setMenuMode,
    setRenameText: interactions.setRenameText,
    closeMenu: interactions.closeMenu,
    onOpenItem,
    onSelectPivot
  })

  const activePivot = pivots.find((p) => p.id === activePivotId) ?? null

  return (
    <div className="graph-wrap">
      <canvas ref={canvasRef} />

      {activePivot && (
        <PivotBanner activePivot={activePivot} palette={palette} onSelectPivot={onSelectPivot} />
      )}

      {interactions.overlays}

      {visible.items.length === 0 && visible.pivots.length === 0 && (
        <div className="graph-empty">
          {activePivot ? t('graph.emptyPivot') : t('graph.empty')}
          <br />
          <small>{t('graph.emptyHint')}</small>
        </div>
      )}

      <div className="graph-legend">{t('graph.legend')}</div>
    </div>
  )
}
