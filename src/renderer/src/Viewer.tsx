import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Papa from 'papaparse'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import type { LibraryItem } from './types'
import { IconExternal, IconFolder } from './Icons'

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
  readOnly = false
}: {
  item: LibraryItem
  onTagsChange?: () => void
  readOnly?: boolean
}) {
  const [text, setText] = useState<string | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState(item.tags.join(', '))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let revoked: string | null = null
    setText(null)
    setBlobUrl(null)
    setError(null)

    const load = async () => {
      try {
        if (item.type === 'pdf' || item.type === 'image') {
          const b64 = await window.api.readBinary(item.id)
          if (b64) {
            const url = base64ToBlobUrl(b64, MIME[item.ext] ?? 'application/octet-stream')
            revoked = url
            setBlobUrl(url)
          }
        } else {
          setText(await window.api.readText(item.id))
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

  const saveTags = async () => {
    const tags = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    await window.api.setTags(item.id, tags)
    onTagsChange?.()
  }

  return (
    <div className="viewer">
      <header className="viewer-header">
        <div className="viewer-title" title={item.storedPath}>
          {item.name}
        </div>
        <div className="viewer-actions">
          <button onClick={() => window.api.openExternal(item.id)}>
            <IconExternal size={13} />
            <span>외부에서 열기</span>
          </button>
          <button onClick={() => window.api.showInFolder(item.id)}>
            <IconFolder size={13} />
            <span>폴더에서 보기</span>
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
            placeholder="태그 (쉼표로 구분)"
          />
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
      </div>
    </div>
  )
}

function CsvTable({ text }: { text: string }) {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  const rows = (result.data as string[][]).slice(0, 1000)
  if (rows.length === 0) return <div className="empty">빈 CSV 파일입니다.</div>
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
      {(result.data as string[][]).length > 1000 && (
        <div className="csv-note">처음 1,000행만 표시됩니다.</div>
      )}
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
