import { useT } from '../i18n'
import {
  IconFolder,
  IconGitBranch,
  IconGraph,
  IconList,
  IconPlus,
  IconSettings,
  IconTrash
} from '../Icons'

type View = 'graph' | 'library' | 'git'

// 상단 툴바: 뷰 전환 세그먼트 + 폴더/휴지통/설정 아이콘 + 파일 추가
export default function Topbar({
  view,
  setView,
  combineGraphs,
  onOpenFolder,
  onTrash,
  onSettings,
  onImport
}: {
  view: View
  setView: (v: View) => void
  combineGraphs: boolean
  onOpenFolder: () => void
  onTrash: () => void
  onSettings: () => void
  onImport: () => void
}) {
  const t = useT()
  return (
    <header className="topbar">
      <button className="brand" onClick={() => setView('graph')}>
        <span className="brand-mark" />
        <span className="brand-name">My DB System</span>
      </button>

      <div className="topbar-right">
        <div className="seg">
          <button className={view === 'graph' ? 'on' : ''} onClick={() => setView('graph')}>
            <IconGraph size={15} />
            <span>{t('topbar.graph')}</span>
          </button>
          <button className={view === 'library' ? 'on' : ''} onClick={() => setView('library')}>
            <IconList size={15} />
            <span>{t('topbar.list')}</span>
          </button>
          {!combineGraphs && (
            <button className={view === 'git' ? 'on' : ''} onClick={() => setView('git')}>
              <IconGitBranch size={15} />
              <span>{t('topbar.git')}</span>
            </button>
          )}
        </div>

        <button className="tb-icon" title={t('topbar.openFolder')} onClick={onOpenFolder}>
          <IconFolder size={17} />
        </button>
        <button className="tb-icon" title={t('topbar.trash')} onClick={onTrash}>
          <IconTrash size={17} />
        </button>
        <button className="tb-icon" title={t('topbar.settings')} onClick={onSettings}>
          <IconSettings size={17} />
        </button>

        <button className="btn-accent" onClick={onImport}>
          <IconPlus size={15} />
          <span>{t('topbar.addFile')}</span>
        </button>
      </div>
    </header>
  )
}
