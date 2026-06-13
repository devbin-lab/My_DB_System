import { useState } from 'react'
import type { Settings } from './types'
import { THEMES, ACCENTS } from './Settings'
import { IconArrowLeft, IconFolder, IconGraph, IconSettings } from './Icons'

// 첫 실행 마법사.
// 테마/포인트색 → DB 저장 위치 → 그래프 검색 개수 순서로 안내한다.
// 설정 자체는 부모(App)가 기존 IPC(setSetting/setStorageDir)로 즉시 반영하므로,
// 여기서는 단계 이동과 "시작하기"에서의 완료 처리만 담당한다.

const STEPS = ['환영', '모양', '저장 위치', '그래프'] as const

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
  const [step, setStep] = useState(0)
  const last = STEPS.length - 1

  const next = () => setStep((s) => Math.min(s + 1, last))
  const back = () => setStep((s) => Math.max(s - 1, 0))

  return (
    <div className="onboard-backdrop">
      <div className="onboard">
        {/* 진행 표시 */}
        <div className="onboard-steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`onboard-step ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}>
              <span className="onboard-dot">{i + 1}</span>
              <span className="onboard-step-label">{label}</span>
            </div>
          ))}
        </div>

        <div className="onboard-body">
          {step === 0 && (
            <div className="onboard-pane onboard-welcome">
              <span className="brand-mark onboard-logo" />
              <h1>My DB System에 오신 걸 환영합니다</h1>
              <p>
                파일·프로젝트·갤러리를 한곳에 모으고 그래프로 연결하는
                <br />
                나만의 데이터 저장 시스템입니다. 시작 전에 몇 가지만 설정할게요.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="onboard-pane">
              <h2>
                <IconSettings size={18} /> 모양 고르기
              </h2>
              <p className="onboard-desc">언제든 설정에서 다시 바꿀 수 있어요.</p>

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
            </div>
          )}

          {step === 2 && (
            <div className="onboard-pane">
              <h2>
                <IconFolder size={18} /> 데이터 저장 위치
              </h2>
              <p className="onboard-desc">
                추가하는 모든 파일이 이 폴더로 복사되어 보관됩니다. 클라우드 동기화
                폴더(예: 드롭박스)를 골라도 됩니다. 나중에 옮기면 데이터도 함께 이동해요.
              </p>
              <div className="storage-path" title={storageDir}>
                <IconFolder size={14} />
                <span>{storageDir || '불러오는 중…'}</span>
              </div>
              <div className="storage-actions">
                <button className="btn-ghost" onClick={onChangeStorage}>
                  폴더 변경
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="onboard-pane">
              <h2>
                <IconGraph size={18} /> 그래프 검색 개수
              </h2>
              <p className="onboard-desc">
                그래프 화면에서 우클릭 검색 시 한 번에 보여줄 결과 수입니다. 12개마다
                바깥쪽 시계 링이 하나씩 늘어납니다.
              </p>
              <div className="setting-row">
                <div className="setting-label">검색 결과 표시 개수</div>
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
            <IconArrowLeft size={14} /> 이전
          </button>
          {step < last ? (
            <button className="btn-accent" onClick={next}>
              다음
            </button>
          ) : (
            <button className="btn-accent" onClick={onFinish}>
              시작하기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
