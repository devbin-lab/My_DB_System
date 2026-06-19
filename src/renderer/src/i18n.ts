import { createContext, useContext } from 'react'
import { ko } from './locales/ko'
import { en } from './locales/en'
import { ja } from './locales/ja'

// ─────────────────────────────────────────────────────────────
//  다국어(i18n) 지원: 한국어 / 영어 / 일본어
//  - 언어는 settings.language 에 저장되며 DB(settingsStore)에 영속된다.
//  - App에서 makeT(lang)로 t 함수를 만들어 I18nContext로 내려준다.
//  - 컴포넌트에서는 useT()로 t 함수를 받아 t('key') 형태로 사용한다.
// ─────────────────────────────────────────────────────────────

export type Language = 'ko' | 'en' | 'ja'

// 언어 선택 UI에 표시할 목록(각 언어의 자국어 표기)
export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' }
]

// 날짜 표기 등에 쓰는 Intl 로케일
export const LOCALES: Record<Language, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP'
}

export type Dict = Record<string, string>

const translations: Record<Language, Dict> = { ko, en, ja }

export type TFunc = (key: string, vars?: Record<string, string | number>) => string

// 주어진 언어의 번역 함수를 만든다. 키가 없으면 영어 → 키 자체 순으로 폴백.
export function makeT(lang: Language): TFunc {
  const dict = translations[lang] ?? translations.en
  return (key, vars) => {
    let s = dict[key] ?? translations.en[key] ?? key
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]))
      }
    }
    return s
  }
}

export const I18nContext = createContext<TFunc>(makeT('en'))
export const useT = (): TFunc => useContext(I18nContext)

