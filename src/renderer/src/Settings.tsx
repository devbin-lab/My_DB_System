import { useEffect, useState } from 'react'
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
export const ACCENTS: { id: AccentId; color: string }[] = [
  { id: 'teal', color: '#14b8a6' },
  { id: 'blue', color: '#3b82f6' },
  { id: 'violet', color: '#7c6af2' },
  { id: 'amber', color: '#f59e0b' },
  { id: 'green', color: '#22c55e' }
]

// 업데이트 확인/설치 섹션. 메인 프로세스(electron-updater)의 상태를 구독한다.
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
    <section className="settings-group">
      <h3>{t('settings.update.title')}</h3>
      <div className="setting-row">
        <div className="setting-label">
          {t('settings.update.current')}
          <small>v{version || '…'}</small>
        </div>
        <div className="setting-control">
          {status.state === 'downloaded' ? (
            <button className="btn-accent" onClick={() => window.api.installUpdate()}>
              <IconDownload size={14} />
              {t('settings.update.install')}
            </button>
          ) : (
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => window.api.checkUpdate()}
            >
              {busy ? t('settings.update.checking') : t('settings.update.check')}
            </button>
          )}
        </div>
      </div>

      {msg.text && (
        <p className={`update-msg ${msg.tone ?? ''}`}>{msg.text}</p>
      )}

      {status.state === 'downloading' && (
        <div className="update-bar">
          <span style={{ width: `${status.percent ?? 0}%` }} />
        </div>
      )}
    </section>
  )
}

export default function SettingsModal({
  settings,
  storageDir,
  onChange,
  onChangeStorage,
  onOpenStorage,
  onClose
}: {
  settings: Settings
  storageDir: string
  onChange: (key: keyof Settings, value: unknown) => void
  onChangeStorage: () => void
  onOpenStorage: () => void
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

        <div className="modal-body">
          <section className="settings-group">
            <h3>{t('settings.language.title')}</h3>
            <div className="lang-row">
              {LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  className={`lang-chip ${settings.language === l.id ? 'on' : ''}`}
                  onClick={() => onChange('language', l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-group">
            <h3>{t('settings.theme')}</h3>
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

            <h3 className="mt">{t('settings.accent')}</h3>
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
          </section>

          <section className="settings-group">
            <h3>{t('settings.storage.title')}</h3>
            <p className="settings-desc">{t('settings.storage.desc')}</p>
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
          </section>

          <section className="settings-group">
            <h3>{t('settings.graph.title')}</h3>
            <div className="setting-row">
              <div className="setting-label">
                {t('settings.graph.count')}
                <small>{t('settings.graph.countHint')}</small>
              </div>
              <div className="setting-control">
                <input
                  type="range"
                  min={1}
                  max={48}
                  step={1}
                  value={settings.maxSearchResults}
                  onChange={(e) => onChange('maxSearchResults', Number(e.target.value))}
                />
                <span className="setting-value">{settings.maxSearchResults}</span>
              </div>
            </div>
          </section>

          <UpdateSection />
        </div>
      </div>
    </div>
  )
}
