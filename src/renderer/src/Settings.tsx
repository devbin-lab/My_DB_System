import { useEffect, useState, type ReactNode } from 'react'
import type { AccentId, Language, Settings, ThemeId, UpdateStatus } from './types'
import { IconDownload, IconFolder, IconX } from './Icons'
import { LANGUAGES, useT } from './i18n'

// 표시 이름/설명은 i18n 키(theme.<id>.name / .desc)로 번역한다.
export const THEMES: { id: ThemeId; swatch: [string, string, string] }[] = [
  { id: 'slate', swatch: ['#1b1e27', '#272b38', '#e8eaf2'] },
  { id: 'light', swatch: ['#f5f6f8', '#ffffff', '#1d2230'] },
  { id: 'navy', swatch: ['#0f1726', '#1c2737', '#e3eaf5'] }
]

// 표시 이름은 i18n 키(accent.<id>)로 번역한다.
// 단일 규칙 팔레트: 모든 색 = Tailwind 500(기본)/400(hover)/500@15%(soft), 색상환(hue) 순서로 배열.
export const ACCENTS: { id: AccentId; color: string }[] = [
  { id: 'rose', color: '#f43f5e' },
  { id: 'orange', color: '#f97316' },
  { id: 'amber', color: '#f59e0b' },
  { id: 'lime', color: '#84cc16' },
  { id: 'green', color: '#22c55e' },
  { id: 'teal', color: '#14b8a6' },
  { id: 'cyan', color: '#06b6d4' },
  { id: 'blue', color: '#3b82f6' },
  { id: 'violet', color: '#8b5cf6' },
  { id: 'fuchsia', color: '#d946ef' },
  { id: 'gray', color: '#9ca3af' },
  { id: 'black', color: 'linear-gradient(135deg, #1d2230 50%, #e8eaf2 50%)' }
]

// 한 설정 행: 라벨(제목에 마우스를 올리면 설명 툴팁)은 왼쪽, 컨트롤은 오른쪽 (Claude 데스크톱 스타일).
function SettingRow({
  label,
  desc,
  children
}: {
  label: string
  desc?: string
  children: ReactNode
}) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className={`set-row-label${desc ? ' has-tip' : ''}`}>
          {label}
          {desc && <span className="set-tip">{desc}</span>}
        </div>
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  )
}

// 라벨(+설명) 아래에 넓은 선택 영역(테마 카드·색상 칩·저장 경로 등)을 두는 블록.
function SettingBlock({
  label,
  desc,
  children
}: {
  label: string
  desc?: string
  children: ReactNode
}) {
  return (
    <div className="set-block">
      <div className="set-row-text">
        <div className={`set-row-label${desc ? ' has-tip' : ''}`}>
          {label}
          {desc && <span className="set-tip">{desc}</span>}
        </div>
      </div>
      <div className="set-block-body">{children}</div>
    </div>
  )
}

// 업데이트 확인/설치 행. 메인 프로세스(electron-updater)의 상태를 구독한다.
function UpdateSection() {
  const t = useT()
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    window.api.getVersion().then(setVersion)
    window.api.getUpdateStatus().then(setStatus)
    const off = window.api.onUpdateStatus(setStatus)
    return off
  }, [])

  const busy = status.state === 'checking' || status.state === 'downloading'

  const message = (): { text: string; tone?: 'ok' | 'err' } => {
    switch (status.state) {
      case 'checking':
        return { text: t('settings.update.msg.checking') }
      case 'available':
        return { text: t('settings.update.msg.available', { version: status.version ?? '' }) }
      case 'downloading':
        return {
          text: t('settings.update.msg.downloading', {
            version: status.version ?? '',
            percent: status.percent ?? 0
          })
        }
      case 'downloaded':
        return {
          text: t('settings.update.msg.downloaded', { version: status.version ?? '' }),
          tone: 'ok'
        }
      case 'not-available':
        return { text: t('settings.update.msg.notAvailable'), tone: 'ok' }
      case 'dev':
        return { text: t('settings.update.msg.dev') }
      case 'error':
        return {
          text: t('settings.update.msg.error', {
            error: status.error ?? t('settings.update.unknownError')
          }),
          tone: 'err'
        }
      default:
        return { text: '' }
    }
  }

  const msg = message()

  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-label">{t('settings.update.title')}</div>
        <div className="set-row-desc">
          {t('settings.update.current')} v{version || '…'}
        </div>
        {msg.text && <div className={`set-row-desc update-msg ${msg.tone ?? ''}`}>{msg.text}</div>}
        {status.state === 'downloading' && (
          <div className="update-bar">
            <span style={{ width: `${status.percent ?? 0}%` }} />
          </div>
        )}
      </div>
      <div className="set-row-control">
        {status.state === 'downloaded' ? (
          <button className="btn-accent" onClick={() => window.api.installUpdate()}>
            <IconDownload size={14} />
            {t('settings.update.install')}
          </button>
        ) : (
          <button className="btn-ghost" disabled={busy} onClick={() => window.api.checkUpdate()}>
            {busy ? t('settings.update.checking') : t('settings.update.check')}
          </button>
        )}
      </div>
    </div>
  )
}

// GitHub 연결 상태/해제. (Git 뷰어 화면에서 실수로 누르지 않도록 설정에 둔다)
function GitHubSection() {
  const t = useT()
  const [connected, setConnected] = useState<boolean | null>(null)
  useEffect(() => {
    window.api.githubHasToken().then(setConnected)
  }, [])
  const disconnect = async (): Promise<void> => {
    await window.api.githubClearToken()
    setConnected(false)
  }
  const statusText =
    connected == null
      ? t('common.loading')
      : connected
        ? t('settings.github.connected')
        : t('settings.github.notConnected')
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-label has-tip">
          {t('settings.github.title')}
          <span className="set-tip">{t('settings.github.desc')}</span>
        </div>
        <div className="set-row-desc">
          {t('settings.github.status')}: {statusText}
        </div>
      </div>
      <div className="set-row-control">
        <button className="btn-ghost" disabled={!connected} onClick={disconnect}>
          {t('settings.github.disconnect')}
        </button>
      </div>
    </div>
  )
}

export default function SettingsModal({
  settings,
  storageDir,
  onChange,
  onChangeStorage,
  onOpenStorage,
  onExportBackup,
  onClose
}: {
  settings: Settings
  storageDir: string
  onChange: (key: keyof Settings, value: unknown) => void
  onChangeStorage: () => void
  onOpenStorage: () => void
  onExportBackup: () => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('settings.title')}</h2>
          <button className="icon-only" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="modal-body settings-list">
          <SettingRow label={t('settings.language.title')}>
            <select
              className="lang-select"
              aria-label={t('settings.language.title')}
              value={settings.language}
              onChange={(e) => onChange('language', e.target.value as Language)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </SettingRow>

          <SettingBlock label={t('settings.theme')}>
            <div className="theme-grid">
              {THEMES.map((tm) => (
                <button
                  key={tm.id}
                  className={`theme-card ${settings.theme === tm.id ? 'on' : ''}`}
                  onClick={() => onChange('theme', tm.id)}
                >
                  <span
                    className="theme-preview"
                    style={{ background: tm.swatch[0], borderColor: tm.swatch[1] }}
                  >
                    <span style={{ background: tm.swatch[1] }} />
                    <span style={{ background: tm.swatch[2] }} />
                  </span>
                  <span className="theme-name">{t(`theme.${tm.id}.name`)}</span>
                  <span className="theme-desc">{t(`theme.${tm.id}.desc`)}</span>
                </button>
              ))}
            </div>
          </SettingBlock>

          <SettingBlock label={t('settings.accent')}>
            <div className="accent-row">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className={`accent-chip ${settings.accent === a.id ? 'on' : ''}`}
                  title={t(`accent.${a.id}`)}
                  style={{ background: a.color }}
                  onClick={() => onChange('accent', a.id)}
                />
              ))}
            </div>
          </SettingBlock>

          <SettingBlock label={t('settings.storage.title')} desc={t('settings.storage.desc')}>
            <div className="storage-path" title={storageDir}>
              <IconFolder size={14} />
              <span>{storageDir || t('common.loading')}</span>
            </div>
            <div className="storage-actions">
              <button className="btn-ghost" onClick={onChangeStorage}>
                {t('settings.storage.change')}
              </button>
              <button className="btn-ghost" onClick={onOpenStorage}>
                {t('settings.storage.open')}
              </button>
            </div>
          </SettingBlock>

          <SettingRow label={t('settings.backup.title')} desc={t('settings.backup.desc')}>
            <button className="btn-ghost" onClick={onExportBackup}>
              {t('settings.backup.export')}
            </button>
          </SettingRow>

          <SettingRow label={t('settings.combine.title')} desc={t('settings.combine.desc')}>
            <button
              className={`toggle ${settings.combineGraphs ? 'on' : ''}`}
              role="switch"
              aria-checked={settings.combineGraphs}
              title={t('settings.combine.title')}
              onClick={() => onChange('combineGraphs', !settings.combineGraphs)}
            >
              <span className="toggle-knob" />
            </button>
          </SettingRow>

          <SettingRow label={t('settings.graph.count')} desc={t('settings.graph.countHint')}>
            <input
              type="range"
              min={1}
              max={48}
              step={1}
              value={settings.maxSearchResults}
              onChange={(e) => onChange('maxSearchResults', Number(e.target.value))}
            />
            <span className="setting-value">{settings.maxSearchResults}</span>
          </SettingRow>

          <GitHubSection />

          <UpdateSection />
        </div>
      </div>
    </div>
  )
}
