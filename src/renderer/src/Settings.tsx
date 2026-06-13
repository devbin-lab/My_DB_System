import { useEffect, useState } from 'react'
import type { AccentId, Settings, ThemeId, UpdateStatus } from './types'
import { IconDownload, IconFolder, IconX } from './Icons'

export const THEMES: {
  id: ThemeId
  name: string
  desc: string
  swatch: [string, string, string]
}[] = [
  { id: 'slate', name: '슬레이트', desc: '밝은 다크', swatch: ['#1b1e27', '#272b38', '#e8eaf2'] },
  { id: 'light', name: '라이트', desc: '밝고 깔끔한', swatch: ['#f5f6f8', '#ffffff', '#1d2230'] },
  { id: 'navy', name: '네이비', desc: '깊은 청색 다크', swatch: ['#0f1726', '#1c2737', '#e3eaf5'] }
]

export const ACCENTS: { id: AccentId; name: string; color: string }[] = [
  { id: 'teal', name: '틸', color: '#14b8a6' },
  { id: 'blue', name: '블루', color: '#3b82f6' },
  { id: 'violet', name: '바이올렛', color: '#7c6af2' },
  { id: 'amber', name: '앰버', color: '#f59e0b' },
  { id: 'green', name: '그린', color: '#22c55e' }
]

// 업데이트 확인/설치 섹션. 메인 프로세스(electron-updater)의 상태를 구독한다.
function UpdateSection() {
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
        return { text: '업데이트 확인 중…' }
      case 'available':
        return { text: `새 버전 v${status.version} 을(를) 내려받는 중…` }
      case 'downloading':
        return { text: `새 버전 v${status.version ?? ''} 내려받는 중… ${status.percent ?? 0}%` }
      case 'downloaded':
        return { text: `v${status.version} 설치 준비 완료. 재시작하면 적용됩니다.`, tone: 'ok' }
      case 'not-available':
        return { text: '최신 버전을 사용 중입니다.', tone: 'ok' }
      case 'dev':
        return { text: '개발 모드에서는 업데이트를 확인할 수 없습니다.' }
      case 'error':
        return { text: `업데이트 확인 실패: ${status.error ?? '알 수 없는 오류'}`, tone: 'err' }
      default:
        return { text: '' }
    }
  }

  const msg = message()

  return (
    <section className="settings-group">
      <h3>업데이트</h3>
      <div className="setting-row">
        <div className="setting-label">
          현재 버전
          <small>v{version || '…'}</small>
        </div>
        <div className="setting-control">
          {status.state === 'downloaded' ? (
            <button className="btn-accent" onClick={() => window.api.installUpdate()}>
              <IconDownload size={14} />
              재시작하여 설치
            </button>
          ) : (
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => window.api.checkUpdate()}
            >
              {busy ? '확인 중…' : '업데이트 확인'}
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
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>설정</h2>
          <button className="icon-only" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="modal-body">
          <section className="settings-group">
            <h3>테마</h3>
            <div className="theme-grid">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`theme-card ${settings.theme === t.id ? 'on' : ''}`}
                  onClick={() => onChange('theme', t.id)}
                >
                  <span
                    className="theme-preview"
                    style={{ background: t.swatch[0], borderColor: t.swatch[1] }}
                  >
                    <span style={{ background: t.swatch[1] }} />
                    <span style={{ background: t.swatch[2] }} />
                  </span>
                  <span className="theme-name">{t.name}</span>
                  <span className="theme-desc">{t.desc}</span>
                </button>
              ))}
            </div>

            <h3 className="mt">포인트 색상</h3>
            <div className="accent-row">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  className={`accent-chip ${settings.accent === a.id ? 'on' : ''}`}
                  title={a.name}
                  style={{ background: a.color }}
                  onClick={() => onChange('accent', a.id)}
                />
              ))}
            </div>
          </section>

          <section className="settings-group">
            <h3>저장소</h3>
            <p className="settings-desc">
              추가하는 모든 파일이 이 폴더로 복사되어 보관됩니다. 위치를 바꾸면 기존
              데이터도 함께 옮겨집니다.
            </p>
            <div className="storage-path" title={storageDir}>
              <IconFolder size={14} />
              <span>{storageDir || '불러오는 중…'}</span>
            </div>
            <div className="storage-actions">
              <button className="btn-ghost" onClick={onChangeStorage}>
                폴더 변경
              </button>
              <button className="btn-ghost" onClick={onOpenStorage}>
                탐색기에서 열기
              </button>
            </div>
          </section>

          <section className="settings-group">
            <h3>그래프 검색</h3>
            <div className="setting-row">
              <div className="setting-label">
                검색 결과 표시 개수
                <small>12개마다 바깥쪽 시계 링이 하나씩 늘어납니다</small>
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
