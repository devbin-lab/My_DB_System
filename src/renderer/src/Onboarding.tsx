import { useState } from 'react'
import type { Settings } from './types'
import { THEMES, ACCENTS } from './Settings'
import { LANGUAGES, useT } from './i18n'
import { IconArrowLeft, IconFolder, IconGraph, IconSettings } from './Icons'

// 첫 실행 마법사.
// 언어 → 환영 → 테마/포인트색 → DB 저장 위치 → 그래프 검색 개수 순서로 안내한다.
// 설정 자체는 부모(App)가 기존 IPC(setSetting/setStorageDir)로 즉시 반영하므로,
// 여기서는 단계 이동과 "시작하기"에서의 완료 처리만 담당한다.

const STEP_KEYS = [
  'onboard.steps.language',
  'onboard.steps.welcome',
  'onboard.steps.appearance',
  'onboard.steps.storage',
  'onboard.steps.graph'
] as const

export default function Onboarding({
  settings,
  storageDir,
  onChange,
  onChangeStorage,
  onFinish
}: {
  settings: Settings
  storageDir: string
  onChange: (key: keyof Settings, value: unknown) => void
  onChangeStorage: () => void
  onFinish: () => void
}) {
  const t = useT()
  const [step, setStep] = useState(0)
  const last = STEP_KEYS.length - 1

  const next = () => setStep((s) => Math.min(s + 1, last))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <div className="onboard-backdrop">
      <div className="onboard">
        {/* 진행 표시 */}
        <div className="onboard-steps">
          {STEP_KEYS.map((key, i) => (
            <div
              key={key}
              className={`onboard-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}
            >
              <span className="onboard-dot">{i + 1}</span>
              <span className="onboard-step-label">{t(key)}</span>
            </div>
          ))}
        </div>

        <div className="onboard-body">
          {step === 0 && (
            <div className="onboard-pane">
              <h2>
                <IconSettings size={18} /> {t('onboard.language.title')}
              </h2>
              <p className="onboard-desc">{t('onboard.language.desc')}</p>
              <div className="lang-grid">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.id}
                    className={`lang-card ${settings.language === l.id ? 'on' : ''}`}
                    onClick={() => onChange('language', l.id)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="onboard-pane onboard-welcome">
              <span className="brand-mark onboard-logo" />
              <h1>{t('onboard.welcome.title')}</h1>
              <p>
                {t('onboard.welcome.desc')
                  .split('\n')
                  .map((line, i) => (
                    <span key={i}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))}
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="onboard-pane">
              <h2>
                <IconSettings size={18} /> {t('onboard.appearance.title')}
              </h2>
              <p className="onboard-desc">{t('onboard.changeAnytime')}</p>

              <h3>{t('onboard.appearance.theme')}</h3>
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

              <h3 className="mt">{t('onboard.appearance.accent')}</h3>
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
            </div>
          )}

          {step === 3 && (
            <div className="onboard-pane">
              <h2>
                <IconFolder size={18} /> {t('onboard.storage.title')}
              </h2>
              <p className="onboard-desc">{t('onboard.storage.desc')}</p>
              <div className="storage-path" title={storageDir}>
                <IconFolder size={14} />
                <span>{storageDir || t('common.loading')}</span>
              </div>
              <div className="storage-actions">
                <button className="btn-ghost" onClick={onChangeStorage}>
                  {t('onboard.storage.change')}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="onboard-pane">
              <h2>
                <IconGraph size={18} /> {t('onboard.graph.title')}
              </h2>
              <p className="onboard-desc">{t('onboard.graph.desc')}</p>
              <div className="setting-row">
                <div className="setting-label">{t('onboard.graph.count')}</div>
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
            </div>
          )}
        </div>

        <div className="onboard-foot">
          <button
            className="btn-ghost"
            onClick={back}
            style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
          >
            <IconArrowLeft size={14} /> {t('common.back')}
          </button>
          {step < last ? (
            <button className="btn-accent" onClick={next}>
              {t('common.next')}
            </button>
          ) : (
            <button className="btn-accent" onClick={onFinish}>
              {t('onboard.start')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
