import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Papa from 'papaparse'
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github-dark.css'
import type { LibraryItem } from './types'
import { IconExternal, IconFolder } from './Icons'
import { useT } from './i18n'

// highlight.js 코어 + 코드 뷰어가 실제로 쓰는 언어만 등록한다(전체 번들 대신).
import hC from 'highlight.js/lib/languages/c'
import hCpp from 'highlight.js/lib/languages/cpp'
import hCsharp from 'highlight.js/lib/languages/csharp'
import hPython from 'highlight.js/lib/languages/python'
import hCss from 'highlight.js/lib/languages/css'
import hScss from 'highlight.js/lib/languages/scss'
import hJs from 'highlight.js/lib/languages/javascript'
import hTs from 'highlight.js/lib/languages/typescript'
import hJson from 'highlight.js/lib/languages/json'
import hXml from 'highlight.js/lib/languages/xml'
import hYaml from 'highlight.js/lib/languages/yaml'
import hBash from 'highlight.js/lib/languages/bash'
import hPowershell from 'highlight.js/lib/languages/powershell'
import hJava from 'highlight.js/lib/languages/java'
import hKotlin from 'highlight.js/lib/languages/kotlin'
import hRust from 'highlight.js/lib/languages/rust'
import hGo from 'highlight.js/lib/languages/go'
import hLua from 'highlight.js/lib/languages/lua'
import hSql from 'highlight.js/lib/languages/sql'

const HLJS_LANGS: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = {
  c: hC,
  cpp: hCpp,
  csharp: hCsharp,
  python: hPython,
  css: hCss,
  scss: hScss,
  javascript: hJs,
  typescript: hTs,
  json: hJson,
  xml: hXml,
  yaml: hYaml,
  bash: hBash,
  powershell: hPowershell,
  java: hJava,
  kotlin: hKotlin,
  rust: hRust,
  go: hGo,
  lua: hLua,
  sql: hSql
}
for (const [name, lang] of Object.entries(HLJS_LANGS)) hljs.registerLanguage(name, lang)

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

function base64ToBlobUrl(base64: string, mime: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

export default function Viewer({
  item,
  onTagsChange,
  readOnly = false,
  allTags = []
}: {
  item: LibraryItem
  onTagsChange?: () => void
  readOnly?: boolean
  allTags?: string[]
}) {
  const t = useT()
  const [text, setText] = useState<string | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState(item.tags.join(', '))
  const [error, setError] = useState<string | null>(null)
  // 미리보기를 지원하지 않는 파일(바이너리·대용량·ppt 등) → 외부 열기 안내
  const [unsupported, setUnsupported] = useState(false)

  useEffect(() => {
    let revoked: string | null = null
    setText(null)
    setBlobUrl(null)
    setError(null)
    setUnsupported(false)

    const load = async () => {
      try {
        if (item.type === 'pdf' || item.type === 'image') {
          const b64 = await window.api.readBinary(item.id)
          if (b64) {
            const url = base64ToBlobUrl(b64, MIME[item.ext] ?? 'application/octet-stream')
            revoked = url
            setBlobUrl(url)
          } else {
            setUnsupported(true)
          }
        } else if (item.type === 'ppt' || item.type === 'xls') {
          // 바이너리 오피스 문서는 내장 미리보기 없이 외부 프로그램으로 연다.
          setUnsupported(true)
        } else {
          // 텍스트 계열. 바이너리/대용량이면 메인이 null을 주므로 미리보기 대신 안내.
          const txt = await window.api.readText(item.id)
          if (txt === null) setUnsupported(true)
          else setText(txt)
        }
      } catch (e) {
        setError(String(e))
      }
    }
    load()

    return () => {
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [item.id, item.type, item.ext])

  const currentTags = tagInput
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const saveTagList = async (tags: string[]) => {
    await window.api.setTags(item.id, tags)
    onTagsChange?.()
  }

  const saveTags = () => saveTagList(currentTags)

  // 클릭 한 번으로 기존 태그를 추가(중복 제외)
  const addTag = (tag: string) => {
    if (currentTags.includes(tag)) return
    const next = [...currentTags, tag]
    setTagInput(next.join(', '))
    saveTagList(next)
  }

  // 아직 안 붙은 기존 태그 추천 목록
  const suggestions = allTags.filter((tag) => !currentTags.includes(tag)).slice(0, 12)

  return (
    <div className="viewer">
      <header className="viewer-header">
        <div className="viewer-title" title={item.storedPath}>
          {item.name}
        </div>
        <div className="viewer-actions">
          <button onClick={() => window.api.openExternal(item.id)}>
            <IconExternal size={13} />
            <span>{t('viewer.openExternal')}</span>
          </button>
          <button onClick={() => window.api.showInFolder(item.id)}>
            <IconFolder size={13} />
            <span>{t('viewer.showInFolder')}</span>
          </button>
        </div>
      </header>

      {!readOnly && (
        <div className="tag-editor">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onBlur={saveTags}
            onKeyDown={(e) => e.key === 'Enter' && saveTags()}
            placeholder={t('viewer.tagsPlaceholder')}
          />
          {suggestions.length > 0 && (
            <div className="tag-suggest">
              <span className="tag-suggest-label">{t('viewer.suggestedTags')}</span>
              {suggestions.map((tag) => (
                <button key={tag} className="tag-suggest-chip" onClick={() => addTag(tag)}>
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="viewer-body">
        {error && <div className="error">{error}</div>}
        {item.type === 'md' && text !== null && (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
        {item.type === 'csv' && text !== null && <CsvTable text={text} />}
        {item.type === 'code' && text !== null && <CodeView text={text} ext={item.ext} />}
        {item.type === 'other' && text !== null && <pre className="plain-text">{text}</pre>}
        {item.type === 'pdf' && blobUrl && (
          <iframe className="pdf-frame" src={blobUrl} title={item.name} />
        )}
        {item.type === 'image' && blobUrl && (
          <div className="image-wrap">
            <img src={blobUrl} alt={item.name} />
          </div>
        )}
        {unsupported && (
          <div className="no-preview">
            <p>{t('viewer.noPreview')}</p>
            <button className="btn-accent" onClick={() => window.api.openExternal(item.id)}>
              {t('viewer.openExternal')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CsvTable({ text }: { text: string }) {
  const t = useT()
  // 파싱은 text가 바뀔 때만(부모 리렌더마다 재파싱 방지)
  const allRows = useMemo(
    () => Papa.parse<string[]>(text.trim(), { skipEmptyLines: true }).data as string[][],
    [text]
  )
  const truncated = allRows.length > 1000
  const rows = truncated ? allRows.slice(0, 1000) : allRows
  if (rows.length === 0) return <div className="empty">{t('viewer.emptyCsv')}</div>
  const [header, ...body] = rows
  return (
    <div className="csv-wrap">
      <table>
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && <div className="csv-note">{t('viewer.csvNote')}</div>}
    </div>
  )
}

const EXT_LANG: Record<string, string> = {
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.py': 'python',
  '.css': 'css',
  '.scss': 'scss',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.jsx': 'javascript',
  '.tsx': 'typescript',
  '.json': 'json',
  '.html': 'xml',
  '.xml': 'xml',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.sh': 'bash',
  '.ps1': 'powershell',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rs': 'rust',
  '.go': 'go',
  '.lua': 'lua',
  '.sql': 'sql'
}

function CodeView({ text, ext }: { text: string; ext: string }) {
  const lang = EXT_LANG[ext]
  let html: string
  try {
    html = lang
      ? hljs.highlight(text, { language: lang }).value
      : hljs.highlightAuto(text).value
  } catch {
    html = text
  }
  return (
    <pre className="code-view">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
